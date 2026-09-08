import { afterEach, describe, expect, it } from 'vitest';
import { applySep4ChaginGameIdentityMigration } from '../db/fixSep4ChaginGameIdentityMigration';
import { createDatabaseConnection, type DatabaseWrapper } from '../db';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema';
import { ensureClubOperationsSchema } from '../db/ensureClubOperationsSchema';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

const envelope = (gameId: number, participantId: string) => ({
  version: 1, kind: 'club_evening_protocol',
  protocol: { game_id: String(gameId), status: 'completed', winner_team: 'red', best_moves: [{ participant_id: participantId, seat_numbers: [1, 2, 3] }] },
  player_results: [{ participant_id: participantId, player_id: 'chagin', seat_number: 6, display_name: 'Чагин', role: 'citizen', fouls: 2 }],
});

describe('confirmed Sep 4 identity repair', () => {
  it('leaves game 1, assigns game 2 to Guest, and games 3+ to Fandorin', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureJudgeAuthoritySchema(db); await ensureClubOperationsSchema(db);
    const now = '2026-09-05T00:00:00.000Z';
    await db.run("INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('chagin','Чагин',?,?),('fandorin','Фандорин',?,?)", [now, now, now, now]);
    await db.run("INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES ('sep4','4 сентября','2026-09-04T20:00:00+03:00','CASUAL','completed',400,?,?)", [now, now]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('chagin-part','sep4','chagin','going','going','attended','on_time','paid',400,400,?,?)", [now, now]);
    for (let id = 1; id <= 4; id += 1) {
      await db.run("INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (?,'sep4',?,'2026-09-04T21:00:00+03:00','red','Победа красных',?,?,?)", [id, id, JSON.stringify(envelope(id, 'chagin-part')), JSON.stringify([{ slot_num: 6, participant_id: 'chagin-part', player_id: 'chagin', nickname: 'Чагин', role: 'citizen', fouls: 2 }]), now]);
    }

    const result = await applySep4ChaginGameIdentityMigration(db);
    expect(result.gamesChanged).toEqual([2, 3, 4]);
    const games = await db.all<any>('SELECT id,protocol_text FROM games ORDER BY id');
    expect(JSON.parse(games[0].protocol_text).player_results[0].player_id).toBe('chagin');
    expect(JSON.parse(games[1].protocol_text).player_results[0]).toMatchObject({ display_name: 'Гость', role: 'citizen', fouls: 2 });
    expect(JSON.parse(games[2].protocol_text).player_results[0]).toMatchObject({ player_id: 'fandorin', display_name: 'Фандорин', role: 'citizen', fouls: 2 });
    expect(JSON.parse(games[3].protocol_text).protocol.best_moves[0].participant_id).not.toBe('chagin-part');
    expect((await applySep4ChaginGameIdentityMigration(db)).applied).toBe(false);
  });
});
