import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  CRM_PAY_003_HISTORICAL_MIGRATION,
  CRM_PAY_003_R2_HISTORICAL_MIGRATION,
} from '../db/ensureClubOperationsSchema';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

const now = '2026-09-09T14:30:00.000Z';

async function seedLegacyWaivedParticipant(db: DatabaseWrapper, input: {
  suffix: string;
  notes: string | null;
  paid?: number;
}) {
  const eveningId = `self-review-evening-${input.suffix}`;
  const playerId = `self-review-player-${input.suffix}`;
  const participantId = `self-review-participant-${input.suffix}`;

  await db.run(
    `INSERT INTO game_evenings
      (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
     VALUES (?,?,'2026-08-01T20:00:00+03:00','Europe/Moscow','CASUAL','completed',20,600,?,?,?)`,
    [eveningId, `Legacy ${input.suffix}`, now, now, now],
  );
  await db.run(
    `INSERT INTO players
      (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
     VALUES (?,?,'normal','test',1000,0,?,?)`,
    [playerId, `Legacy ${input.suffix}`, now, now],
  );
  await db.run(
    `INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,notes,created_at,updated_at)
     VALUES (?,?,?,'going','going','attended','on_time','waived',0,?,?,?,?)`,
    [participantId, eveningId, playerId, input.paid ?? 0, input.notes, now, now],
  );

  const protocol = JSON.stringify({
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { status: 'completed' },
    player_results: [{ participant_id: participantId }],
  });
  await db.run(
    `INSERT INTO games
      (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
     VALUES (?,1,'2026-08-01','red','Красные',?,'[]',?)`,
    [eveningId, protocol, now],
  );

  return { eveningId, playerId, participantId };
}

describe('CRM-PAY-003-R2 self-review safety fixes', () => {
  const openDbs: DatabaseWrapper[] = [];
  const makeDb = () => {
    const db = createDatabaseConnection(':memory:');
    openDbs.push(db);
    return db;
  };

  afterEach(() => {
    while (openDbs.length) {
      const db = openDbs.pop()!;
      try { db.sqlite.close(); } catch {}
    }
  });

  it('protects a legitimate legacy waiver before v1 runs when no migration marker exists yet', async () => {
    const db = makeDb();
    const ids = await seedLegacyWaivedParticipant(db, {
      suffix: 'pre-v1-explicit',
      notes: 'Освобождение от оплаты взноса подтверждено организатором',
    });

    await createApp(db);

    const waiver = await db.get<any>(
      'SELECT reason FROM evening_fee_waivers WHERE participant_id = ?',
      [ids.participantId],
    );
    expect(String(waiver?.reason || '')).toContain('pre-reconciliation explicit waiver');

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id = ?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 0, amount_paid: 0, payment_status: 'waived' });

    const markers = await db.all<any>(
      `SELECT migration_key,status FROM application_migration_history
       WHERE migration_key IN (?,?) ORDER BY migration_key`,
      [CRM_PAY_003_HISTORICAL_MIGRATION, CRM_PAY_003_R2_HISTORICAL_MIGRATION],
    );
    expect(markers).toHaveLength(2);
    expect(markers.every((row: any) => row.status === 'completed')).toBe(true);
  });

  it('does not promote a generic free-text note into a financial waiver', async () => {
    const db = makeDb();
    const ids = await seedLegacyWaivedParticipant(db, {
      suffix: 'generic-free-text',
      notes: 'Бесплатная парковка рядом с площадкой',
    });

    await createApp(db);

    const waiver = await db.get<any>(
      'SELECT participant_id FROM evening_fee_waivers WHERE participant_id = ?',
      [ids.participantId],
    );
    expect(waiver).toBeNull();

    const diagnostic = await db.get<any>(
      `SELECT status,reason FROM evening_fee_waiver_migration_diagnostics
       WHERE participant_id = ?`,
      [ids.participantId],
    );
    expect(diagnostic?.status).toBe('needs_review');
    expect(String(diagnostic?.reason || '')).toContain('not reliably identifiable');

    const participant = await db.get<any>(
      'SELECT amount_due,payment_status FROM evening_participants WHERE id = ?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });
  });

  it('surfaces durable needs_review diagnostics through the organizer payments endpoint', async () => {
    const db = makeDb();
    const ids = await seedLegacyWaivedParticipant(db, {
      suffix: 'review-api',
      notes: null,
    });
    const app = await createApp(db);

    const response = await request(app)
      .get(`/api/evenings/${ids.eveningId}/payments`)
      .set({ Cookie: `organizer_token=${generateOrganizerToken()}` });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const participant = response.body.participants.find((row: any) => row.id === ids.participantId);
    expect(participant).toMatchObject({
      amount_due: 0,
      payment_status: 'waived',
      fee_waived: false,
      fee_review_required: true,
      fee_review_status: 'needs_review',
    });
    expect(String(participant.fee_review_reason || '')).toContain('organizer review');
  });

  it('preserves recorded payment while protecting a pre-v1 legacy waiver', async () => {
    const db = makeDb();
    const ids = await seedLegacyWaivedParticipant(db, {
      suffix: 'pre-v1-paid',
      notes: 'Payment waived by organizer',
      paid: 150,
    });

    await createApp(db);

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id = ?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 0, amount_paid: 150, payment_status: 'paid' });

    const negativeIncome = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
       WHERE evening_id = ? AND type = 'income' AND amount < 0`,
      [ids.eveningId],
    );
    expect(Number(negativeIncome?.count || 0)).toBe(0);
    const refunds = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
       WHERE evening_id = ? AND type = 'refund'`,
      [ids.eveningId],
    );
    expect(Number(refunds?.count || 0)).toBe(0);
  });
});
