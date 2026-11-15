import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureClubOperationsSchema } from '../db/ensureClubOperationsSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { GUEST_PLAYER_MIGRATION_KEY, ensureGuestPlayerPlaceholderSchema, reconcileLegacyGuestPlayers } from '../db/ensureGuestPlayerPlaceholderSchema.ts';
import { createGuestPlaceholder, replaceGuestWithRegisteredPlayer } from '../server/services/guestPlayerService.ts';

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

const seedEvening = async (database: DatabaseWrapper, id: string) => {
  const now = '2026-09-09T12:00:00.000Z';
  await database.run(`
    INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES (?, 'Guest edge test', ?, 'Europe/Moscow', 'CASUAL', 'active', 20, 500, ?, ?)
  `, [id, now, now, now]);
};

const seedPlayer = async (database: DatabaseWrapper, id: string, nickname: string, source = 'crm_manual') => {
  const now = '2026-09-09T12:00:00.000Z';
  await database.run(`
    INSERT INTO players (id,nickname,source,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
    VALUES (?,?,?,'normal','normal',1500,0,?,?)
  `, [id, nickname, source, now, now]);
};

const rerunMigration = async (database: DatabaseWrapper, count = 1) => {
  const now = '2026-09-09T15:00:00.000Z';
  await database.run(`
    UPDATE guest_player_migration_state
       SET status='failed', total_count=?, processed_count=0, last_player_id=NULL,
           error_message='edge-case rerun', completed_at=NULL, updated_at=?
     WHERE migration_key=?
  `, [count, now, GUEST_PLAYER_MIGRATION_KEY]);
  return reconcileLegacyGuestPlayers(database);
};

describe('GUEST-PLAYER-001 edge regressions', () => {
  it('atomically transfers guest evening payment and attendance facts to the replacement participant', async () => {
    const database = await initialize();
    await seedEvening(database, 'e-pay');
    await seedPlayer(database, 'p-pay', 'Зарегистрированный');
    const guest = await createGuestPlaceholder(database, {
      eveningId: 'e-pay', displayName: 'Гость с оплатой', responseStatus: 'late',
      amountDue: 500, amountPaid: 200, notes: '200 ₽ оплачено гостем',
    });
    const now = '2026-09-09T15:10:00.000Z';
    await database.run(`UPDATE guest_player_placeholders SET attendance_status='attended', arrival_status='late', checked_in_at=? WHERE id=?`, [now, guest.id]);
    const envelope = {
      version: 1, kind: 'club_evening_protocol',
      protocol: { game_id: '10', status: 'completed', winner_team: 'red', votes: [], shots: [], best_moves: [] },
      player_results: [{ participant_id: guest.id, player_id: null, guest_placeholder_id: guest.id, seat_number: 1, display_name: 'Гость с оплатой', role: 'citizen', exit_type: 'alive' }],
    };
    const slots = [{ slot_num: 1, participant_id: guest.id, player_id: null, guest_placeholder_id: guest.id, nickname: 'Гость с оплатой', role: 'citizen' }];
    await database.run(`
      INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES (10,'e-pay',10,?,'Красные','Победа Красных',?,?,?)
    `, [now, JSON.stringify(envelope), JSON.stringify(slots), now]);

    const replacement = await replaceGuestWithRegisteredPlayer(database, { gameId: 10, seatNumber: 1, replacementPlayerId: 'p-pay' });
    const participant = await database.get<any>('SELECT * FROM evening_participants WHERE id=?', [replacement.participantId]);
    expect(participant).toMatchObject({
      player_id: 'p-pay', response_status: 'late', registration_status: 'late',
      attendance_status: 'attended', arrival_status: 'late', payment_status: 'partial',
      amount_due: 500, amount_paid: 200,
    });
    expect(String(participant.notes || '')).toContain('200 ₽ оплачено гостем');
    const placeholder = await database.get<any>('SELECT replaced_by_player_id,replaced_at FROM guest_player_placeholders WHERE id=?', [guest.id]);
    expect(placeholder.replaced_by_player_id).toBe('p-pay');
    expect(placeholder.replaced_at).toBeTruthy();
  });

  it('rewrites legacy slots even when there is no v1 structured protocol', async () => {
    const database = await initialize();
    await seedEvening(database, 'e-slots');
    await seedPlayer(database, 'legacy-slots', 'Старый гость', 'quick_guest');
    const now = '2026-09-09T15:20:00.000Z';
    await database.run(`
      INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-slots','e-slots','legacy-slots','going','going','attended','on_time','paid',500,500,?,?)
    `, [now, now]);
    await database.run(`
      INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES (11,'e-slots',11,?,'Красные','Legacy',NULL,?,?)
    `, [now, JSON.stringify([{ slot_num: 1, participant_id: 'ep-slots', player_id: 'legacy-slots', nickname: 'Старый гость', role: 'citizen' }]), now]);

    await rerunMigration(database);
    const slot = JSON.parse(String((await database.get<any>('SELECT slots_json FROM games WHERE id=11'))?.slots_json || '[]'))[0];
    expect(slot).toMatchObject({ participant_id: 'guest:ep-slots', player_id: null, guest_placeholder_id: 'guest:ep-slots', nickname: 'Старый гость', role: 'citizen' });
    expect(await database.get<any>("SELECT source,lifecycle_status FROM players WHERE id='legacy-slots'"))
      .toEqual({ source: 'legacy_guest_migrated', lifecycle_status: 'archived' });
  });

  it('does not archive a legacy guest when historical identity is ambiguous or unstructured', async () => {
    const database = await initialize();
    await seedEvening(database, 'e-review');
    await seedPlayer(database, 'legacy-review', 'Нужна проверка', 'quick_guest');
    const now = '2026-09-09T15:30:00.000Z';
    await database.run(`
      INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-review','e-review','legacy-review','going','going','attended','on_time','paid',500,500,?,?)
    `, [now, now]);
    await database.run(`
      INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES (12,'e-review',12,?,'Красные','Legacy',?, '[]', ?)
    `, [now, JSON.stringify({ version: 0, participant_id: 'ep-review', player_id: 'legacy-review', facts: { role: 'citizen' } }), now]);

    await rerunMigration(database);
    expect(await database.get<any>("SELECT source,lifecycle_status FROM players WHERE id='legacy-review'"))
      .toEqual({ source: 'quick_guest', lifecycle_status: 'normal' });
    expect(await database.get<any>("SELECT id FROM guest_player_placeholders WHERE legacy_player_id='legacy-review'"))
      .toBeNull();
    expect(await database.get<any>("SELECT reason FROM guest_player_migration_diagnostics WHERE legacy_player_id='legacy-review' AND reason='migration_requires_review'"))
      .toMatchObject({ reason: 'migration_requires_review' });
  });
});

describe('swapping two seats of a club game (owner, 2026-11-15)', () => {
  it('exchanges the two players in the stored protocol and slots, and refuses an archived game', async () => {
    const { swapSeatsInClubGame } = await import('../server/services/guestPlayerService.ts');
    const database = await initialize();
    await seedEvening(database, 'e-swap');
    const envelope = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed' }, player_results: [
      { seat_number: 5, participant_id: 'ep-fm', player_id: 'fm', display_name: 'ФМ', role: 'mafia' },
      { seat_number: 7, participant_id: 'ep-grey', player_id: 'grey', display_name: 'Серый', role: 'citizen' },
    ] };
    const slots = [{ slot_num: 5, participant_id: 'ep-fm', player_id: 'fm', nickname: 'ФМ', role: 'mafia' }, { slot_num: 7, participant_id: 'ep-grey', player_id: 'grey', nickname: 'Серый', role: 'citizen' }];
    await database.run(`INSERT INTO games (id, evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
      VALUES (37, 'e-swap', 37, '2026-11-13', 'red', 'Мирные', ?, ?, '2026-11-13T18:00:00Z')`, [JSON.stringify(envelope), JSON.stringify(slots)]);
    await swapSeatsInClubGame(database, { gameId: 37, seatA: 5, seatB: 7 });
    const row = await database.get<any>('SELECT protocol_text, slots_json FROM games WHERE id = 37');
    const saved = JSON.parse(row.protocol_text);
    expect(saved.player_results.map((item: any) => [item.seat_number, item.display_name, item.role])).toEqual([[5, 'Серый', 'mafia'], [7, 'ФМ', 'citizen']]);
    expect(JSON.parse(row.slots_json).map((item: any) => [item.slot_num, item.nickname])).toEqual([[5, 'Серый'], [7, 'ФМ']]);
    await database.run("UPDATE games SET archived_at = '2026-11-14' WHERE id = 37");
    await expect(swapSeatsInClubGame(database, { gameId: 37, seatA: 5, seatB: 7 })).rejects.toThrow('архива');
  });
});
