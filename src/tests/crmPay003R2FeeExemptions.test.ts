import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService';

describe('CRM-PAY-003-R2 evening-specific fee exemptions', () => {
  let db: DatabaseWrapper;
  const now = '2026-09-09T12:30:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  const seedPlayedParticipant = async (input: {
    suffix: string;
    clubRole?: 'guest' | 'member' | 'team' | 'organizer';
    judgeLevel?: 'none' | 'trainee' | 'host' | 'judge';
    due?: number;
    paid?: number;
    paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'waived';
  }) => {
    const eveningId = `evening-${input.suffix}`;
    const playerId = `player-${input.suffix}`;
    const participantId = `participant-${input.suffix}`;
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES (?,?,'2026-08-01T20:00:00+03:00','Europe/Moscow','CASUAL','completed',20,100,?,?,?)`,
      [eveningId, `Evening ${input.suffix}`, now, now, now],
    );
    await db.run(
      `INSERT INTO players
       (id,nickname,lifecycle_status,source,elo,tokens,club_role,judge_level,created_at,updated_at)
       VALUES (?,?,'normal','test',1000,0,?,?,?,?)`,
      [playerId, `Player ${input.suffix}`, input.clubRole ?? 'member', input.judgeLevel ?? 'none', now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES (?,?,?,'going','going','attended','on_time',?,?,?,?,?)`,
      [participantId, eveningId, playerId, input.paymentStatus ?? 'unpaid', input.due ?? 600, input.paid ?? 0, now, now],
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
  };

  it('charges a judge-qualified player who factually played as a normal participant', async () => {
    const ids = await seedPlayedParticipant({ suffix: 'qualified-judge', judgeLevel: 'judge' });

    await reconcileRegularEveningPayments(db, ids.eveningId);

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 100, amount_paid: 0, payment_status: 'unpaid' });
  });

  it('does not rewrite an older evening when the player becomes a judge later', async () => {
    const ids = await seedPlayedParticipant({ suffix: 'later-judge', judgeLevel: 'none' });
    await db.run("UPDATE players SET judge_level='judge', updated_at=? WHERE id=?", [now, ids.playerId]);

    await reconcileRegularEveningPayments(db, ids.eveningId);

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 100, amount_paid: 0, payment_status: 'unpaid' });
  });

  it('waives a person factually assigned as staff for that specific evening', async () => {
    const ids = await seedPlayedParticipant({ suffix: 'assigned-staff', clubRole: 'organizer' });
    await db.run(
      `INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at)
       VALUES (?,?,?,?)`,
      [ids.eveningId, ids.playerId, now, now],
    );

    await reconcileRegularEveningPayments(db, ids.eveningId);

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 0, amount_paid: 0, payment_status: 'waived' });
  });

  it('preserves an explicit persisted waiver and never reduces recorded payment', async () => {
    const ids = await seedPlayedParticipant({
      suffix: 'explicit-waiver',
      due: 0,
      paid: 150,
      paymentStatus: 'paid',
    });
    await db.run(
      `INSERT INTO evening_fee_waivers (participant_id,evening_id,reason,waived_at,updated_at)
       VALUES (?,?,?,?,?)`,
      [ids.participantId, ids.eveningId, 'Organizer-approved free participation', now, now],
    );

    await reconcileRegularEveningPayments(db, ids.eveningId);
    await reconcileRegularEveningPayments(db, ids.eveningId);

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      [ids.participantId],
    );
    expect(participant).toMatchObject({ amount_due: 0, amount_paid: 150, payment_status: 'paid' });
    const negativeIncome = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
        WHERE evening_id=? AND type='income' AND amount < 0`,
      [ids.eveningId],
    );
    expect(Number(negativeIncome?.count || 0)).toBe(0);
    const duplicateRows = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
        WHERE evening_id=? AND source_type='evening_pricing_reconcile' AND source_id=?`,
      [ids.eveningId, ids.participantId],
    );
    expect(Number(duplicateRows?.count || 0)).toBeLessThanOrEqual(2);
  });
});