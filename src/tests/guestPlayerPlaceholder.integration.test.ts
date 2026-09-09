import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureClubOperationsSchema } from '../db/ensureClubOperationsSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import {
  GUEST_PLAYER_MIGRATION_KEY,
  ensureGuestPlayerPlaceholderSchema,
  reconcileLegacyGuestPlayers,
} from '../db/ensureGuestPlayerPlaceholderSchema.ts';
import {
  createGuestPlaceholder,
  replaceGuestWithRegisteredPlayer,
} from '../server/services/guestPlayerService.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

const initialize = async () => {
  db = createDatabaseConnection(':memory:');
  await ensureJudgeAuthoritySchema(db);
  await ensureClubOperationsSchema(db);
  await ensureGuestPlayerPlaceholderSchema(db);
  return db;
};

const seedEvening = async (database: DatabaseWrapper, id = 'e-1') => {
  const now = '2026-09-09T12:00:00.000Z';
  await database.run(`
    INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES (?, 'Guest test', ?, 'Europe/Moscow', 'CASUAL', 'active', 20, 500, ?, ?)
  `, [id, now, now, now]);
};

const seedPlayer = async (database: DatabaseWrapper, id: string, nickname: string, source = 'crm_manual') => {
  const now = '2026-09-09T12:00:00.000Z';
  await database.run(`
    INSERT INTO players (id,nickname,source,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
    VALUES (?,?,?,'normal','normal',1500,0,?,?)
  `, [id, nickname, source, now, now]);
};

describe('GUEST-PLAYER-001 placeholder lifecycle', () => {
  it('creates an evening-local guest without creating a player profile and keeps factual payment locally', async () => {
    const database = await initialize();
    await seedEvening(database);
    const playersBefore = Number((await database.get<any>('SELECT COUNT(*) AS cnt FROM players'))?.cnt || 0);

    const guest = await createGuestPlaceholder(database, {
      eveningId: 'e-1',
      displayName: '',
      responseStatus: 'going',
      amountDue: 500,
      amountPaid: 200,
      notes: 'Оплатил часть на месте',
    });

    expect(guest).toMatchObject({
      nickname: 'Гость',
      player_id: null,
      elo: null,
      is_guest: true,
      amount_due: 500,
      amount_paid: 200,
      payment_status: 'partial',
    });
    expect(Number((await database.get<any>('SELECT COUNT(*) AS cnt FROM players'))?.cnt || 0)).toBe(playersBefore);
    expect(await database.get<any>('SELECT * FROM players WHERE id = ?', [guest.id])).toBeNull();
    expect(await database.get<any>('SELECT amount_due,amount_paid,payment_status FROM guest_player_placeholders WHERE id = ?', [guest.id]))
      .toEqual({ amount_due: 500, amount_paid: 200, payment_status: 'partial' });
  });

  it('replaces only guest identity, preserves protocol facts, rejects duplicates and is retry-idempotent', async () => {
    const database = await initialize();
    await seedEvening(database);
    await seedPlayer(database, 'p-1', 'Фандорин');
    await seedPlayer(database, 'p-2', 'Мориарти');

    const guest = await createGuestPlaceholder(database, { eveningId: 'e-1', displayName: 'Гость X' });
    const now = '2026-09-09T12:30:00.000Z';
    await database.run(`
      INSERT INTO evening_participants (
        id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,created_at,updated_at
      ) VALUES ('ep-2','e-1','p-2','going','going','attended','on_time','waived',0,0,?,?)
    `, [now, now]);

    const envelope = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        game_id: '1', status: 'completed', winner_team: 'red', end_reason: 'ppk',
        ppk_culprit_participant_id: guest.id,
        first_killed_participant_id: guest.id,
        best_move_participant_id: guest.id,
        best_moves: [{ source: 'first_killed', participant_id: guest.id, seat_numbers: [2, 3, 4] }],
        votes: [{ voter_participant_id: guest.id, target_participant_id: 'ep-2', vote_count: 1 }],
        shots: [{ night_number: 1, target_seat: 1, result: 'killed' }],
        judge_notes: 'Сохранить заметку',
      },
      player_results: [
        {
          participant_id: guest.id, player_id: null, guest_placeholder_id: guest.id,
          seat_number: 1, display_name: 'Гость X', role: 'citizen', exit_type: 'killed',
          regular_fouls: 3, minor_technical_fouls: 1, major_technical_fouls: 0,
          judge_bonus: 0.3, protocol_bonus: -0.1, ci_points: 0.2,
          notes: 'Факт места должен сохраниться',
        },
        { participant_id: 'ep-2', player_id: 'p-2', guest_placeholder_id: null, seat_number: 2, display_name: 'Мориарти', role: 'mafia', exit_type: 'alive' },
      ],
    };
    const slots = [
      { slot_num: 1, participant_id: guest.id, player_id: null, guest_placeholder_id: guest.id, nickname: 'Гость X', role: 'citizen', fouls: 3 },
      { slot_num: 2, participant_id: 'ep-2', player_id: 'p-2', guest_placeholder_id: null, nickname: 'Мориарти', role: 'mafia' },
    ];
    await database.run(`
      INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES (1,'e-1',1,?,'Красные','Победа Красных',?,?,?)
    `, [now, JSON.stringify(envelope), JSON.stringify(slots), now]);

    await expect(replaceGuestWithRegisteredPlayer(database, { gameId: 1, seatNumber: 1, replacementPlayerId: 'p-2' }))
      .rejects.toThrow('уже занимает другое место');

    const first = await replaceGuestWithRegisteredPlayer(database, { gameId: 1, seatNumber: 1, replacementPlayerId: 'p-1' });
    expect(first.changed).toBe(true);
    const replaced = first.envelope.player_results.find((row: any) => Number(row.seat_number) === 1);
    expect(replaced).toMatchObject({
      player_id: 'p-1',
      guest_placeholder_id: null,
      display_name: 'Фандорин',
      role: 'citizen',
      exit_type: 'killed',
      regular_fouls: 3,
      minor_technical_fouls: 1,
      judge_bonus: 0.3,
      protocol_bonus: -0.1,
      ci_points: 0.2,
      notes: 'Факт места должен сохраниться',
    });
    expect(first.envelope.protocol.ppk_culprit_participant_id).toBe(first.participantId);
    expect(first.envelope.protocol.first_killed_participant_id).toBe(first.participantId);
    expect(first.envelope.protocol.best_moves[0]).toEqual({ source: 'first_killed', participant_id: first.participantId, seat_numbers: [2, 3, 4] });
    expect(first.envelope.protocol.votes[0].voter_participant_id).toBe(first.participantId);
    expect(first.envelope.protocol.shots).toEqual(envelope.protocol.shots);
    expect(first.envelope.protocol.judge_notes).toBe('Сохранить заметку');
    expect(first.slots[0]).toMatchObject({ player_id: 'p-1', guest_placeholder_id: null, nickname: 'Фандорин', role: 'citizen', fouls: 3 });

    const second = await replaceGuestWithRegisteredPlayer(database, { gameId: 1, seatNumber: 1, replacementPlayerId: 'p-1' });
    expect(second).toMatchObject({ changed: false, idempotent: true, playerId: 'p-1' });
    expect(await database.get<any>('SELECT COUNT(*) AS cnt FROM guest_player_replacement_audit WHERE game_id=1'))
      .toMatchObject({ cnt: 1 });
    expect(await database.get<any>("SELECT COUNT(*) AS cnt FROM evening_participants WHERE evening_id='e-1' AND player_id='p-1'"))
      .toMatchObject({ cnt: 1 });
  });

  it('migrates reliable quick_guest rows without nickname matching and remains resumable/idempotent', async () => {
    const database = await initialize();
    await seedEvening(database, 'e-resume');
    await seedPlayer(database, 'legacy-a', 'Ранее мигрированный гость', 'legacy_guest_migrated');
    await seedPlayer(database, 'legacy-b', 'Одинаковый ник', 'quick_guest');
    const now = '2026-09-09T13:00:00.000Z';

    await database.run(`
      INSERT INTO guest_player_placeholders (
        id,evening_id,display_name,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,legacy_player_id,legacy_participant_id,created_at,updated_at
      ) VALUES ('guest:ep-a','e-resume','Одинаковый ник','going','going','attended','on_time','paid',500,500,'legacy-a','ep-a',?,?)
    `, [now, now]);
    await database.run(`
      INSERT INTO evening_participants (
        id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,created_at,updated_at
      ) VALUES ('ep-a','e-resume','legacy-a','going','going','attended','on_time','paid',500,500,?,?)
    `, [now, now]);
    await database.run(`
      INSERT INTO evening_participants (
        id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,created_at,updated_at
      ) VALUES ('ep-b','e-resume','legacy-b','late','late','attended','late','partial',500,300,?,?)
    `, [now, now]);

    await database.run(`
      UPDATE guest_player_migration_state
         SET status='failed', total_count=2, processed_count=1, last_player_id='legacy-a',
             error_message='simulated crash after row commit', completed_at=NULL, updated_at=?
       WHERE migration_key=?
    `, [now, GUEST_PLAYER_MIGRATION_KEY]);

    const state = await reconcileLegacyGuestPlayers(database);
    expect(state).toMatchObject({ status: 'completed', total_count: 2, processed_count: 2, last_player_id: 'legacy-b', error_message: null });
    const migrated = await database.get<any>("SELECT * FROM guest_player_placeholders WHERE legacy_participant_id='ep-b'");
    expect(migrated).toMatchObject({
      display_name: 'Одинаковый ник', attendance_status: 'attended', arrival_status: 'late',
      payment_status: 'partial', amount_due: 500, amount_paid: 300, legacy_player_id: 'legacy-b',
    });
    expect(await database.get<any>("SELECT source,lifecycle_status FROM players WHERE id='legacy-b'"))
      .toEqual({ source: 'legacy_guest_migrated', lifecycle_status: 'archived' });

    const again = await reconcileLegacyGuestPlayers(database);
    expect(again).toMatchObject({ status: 'completed', processed_count: 2 });
    expect(await database.get<any>("SELECT COUNT(*) AS cnt FROM guest_player_placeholders WHERE legacy_participant_id IN ('ep-a','ep-b')"))
      .toMatchObject({ cnt: 2 });
  });

  it('does not auto-migrate a quick_guest row linked to Telegram/VK identity and writes durable diagnostics', async () => {
    const database = await initialize();
    await seedEvening(database, 'e-linked');
    await seedPlayer(database, 'linked-guest', 'Связанный', 'quick_guest');
    const now = '2026-09-09T14:00:00.000Z';
    await database.run(`
      INSERT INTO evening_participants (
        id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,created_at,updated_at
      ) VALUES ('ep-linked','e-linked','linked-guest','going','going','attended','on_time','paid',500,500,?,?)
    `, [now, now]);
    await database.run(`
      CREATE TABLE player_external_identities (
        platform TEXT NOT NULL, external_user_id TEXT NOT NULL, player_id TEXT NOT NULL,
        screen_name TEXT, display_name TEXT, linked_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(platform,external_user_id), UNIQUE(platform,player_id)
      )
    `);
    await database.run(`
      INSERT INTO player_external_identities (platform,external_user_id,player_id,linked_at,updated_at)
      VALUES ('vk','12345','linked-guest',?,?)
    `, [now, now]);
    await database.run(`
      UPDATE guest_player_migration_state
         SET status='failed', total_count=1, processed_count=0, last_player_id=NULL,
             error_message='rerun for linked identity test', completed_at=NULL, updated_at=?
       WHERE migration_key=?
    `, [now, GUEST_PLAYER_MIGRATION_KEY]);

    const state = await reconcileLegacyGuestPlayers(database);
    expect(state).toMatchObject({ status: 'completed', total_count: 1, processed_count: 1 });
    expect(await database.get<any>("SELECT source,lifecycle_status FROM players WHERE id='linked-guest'"))
      .toEqual({ source: 'quick_guest', lifecycle_status: 'normal' });
    expect(await database.get<any>("SELECT id FROM guest_player_placeholders WHERE legacy_player_id='linked-guest'"))
      .toBeNull();
    const diagnostic = await database.get<any>(`
      SELECT reason,details_json FROM guest_player_migration_diagnostics
       WHERE migration_key=? AND legacy_player_id='linked-guest'
    `, [GUEST_PLAYER_MIGRATION_KEY]);
    expect(diagnostic.reason).toBe('external_identity_linked');
    expect(JSON.parse(diagnostic.details_json).evidence).toContain('external:vk');
  });
});
