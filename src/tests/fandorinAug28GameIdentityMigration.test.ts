import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { ensureClubOperationsSchema } from '../db/ensureClubOperationsSchema.ts';
import { applyFandorinAug28GameIdentityMigration } from '../db/fixFandorinAug28GameIdentityMigration.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

const initializeOperationsSchema = async (database: DatabaseWrapper) => {
  await ensureJudgeAuthoritySchema(database);
  await ensureClubOperationsSchema(database);
};

const makeProtocol = (participantId: string, playerId = 'chagin', displayName = 'Чагин') => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: {
    game_id: '1',
    status: 'draft',
    winner_team: null,
    first_killed_participant_id: participantId,
    best_move_participant_id: participantId,
    best_moves: [{ source: 'first_killed', participant_id: participantId, seat_numbers: [2, 3, 4] }],
  },
  player_results: [{
    participant_id: participantId,
    player_id: playerId,
    seat_number: 6,
    display_name: displayName,
    role: 'Мирный',
    regular_fouls: 2,
    judge_bonus: 0.3,
  }],
});

const makeSlots = (participantId: string, playerId = 'chagin', nickname = 'Чагин') => ([{
  slot_num: 6,
  participant_id: participantId,
  player_id: playerId,
  nickname,
  role: 'Мирный',
  fouls: 2,
}]);

describe('Fandorin Aug 28 game identity repair', () => {
  it('replaces only Chagin game identity while preserving seat result data and is idempotent', async () => {
    db = createDatabaseConnection(':memory:');
    await initializeOperationsSchema(db);

    const now = '2026-08-29T12:00:00.000Z';
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('chagin','Чагин',?,?)`, [now, now]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('fandorin','Фандорин',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at)
                  VALUES ('evening-28','Игровой вечер — 28 августа','2026-08-28T20:00:00+03:00','CASUAL','completed',400,?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (
                    id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at
                  ) VALUES ('chagin-part','evening-28','chagin','going','going','attended','on_time','waived',0,0,?,?)`, [now, now]);

    await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
                  VALUES (1,'evening-28',1,'2026-08-28T21:00:00+03:00','draft','Черновик',?,?,?)`,
      [JSON.stringify(makeProtocol('chagin-part')), JSON.stringify(makeSlots('chagin-part')), now]);

    const result = await applyFandorinAug28GameIdentityMigration(db);
    expect(result.applied).toBe(true);
    expect(result.gamesChanged).toEqual([1]);

    const fandorinParticipant = await db.get<any>(`SELECT * FROM evening_participants WHERE evening_id='evening-28' AND player_id='fandorin'`);
    expect(fandorinParticipant).toMatchObject({ response_status: 'going', registration_status: 'going', attendance_status: 'attended' });

    const game = await db.get<any>('SELECT protocol_text,slots_json FROM games WHERE id=1');
    const repairedProtocol = JSON.parse(game.protocol_text);
    const repairedSlots = JSON.parse(game.slots_json);
    const repaired = repairedProtocol.player_results[0];
    expect(repaired).toMatchObject({
      participant_id: fandorinParticipant.id,
      player_id: 'fandorin',
      seat_number: 6,
      display_name: 'Фандорин',
      role: 'Мирный',
      regular_fouls: 2,
      judge_bonus: 0.3,
    });
    expect(repairedProtocol.protocol.first_killed_participant_id).toBe(fandorinParticipant.id);
    expect(repairedProtocol.protocol.best_move_participant_id).toBe(fandorinParticipant.id);
    expect(repairedProtocol.protocol.best_moves[0].participant_id).toBe(fandorinParticipant.id);
    expect(repairedSlots[0]).toMatchObject({ participant_id: fandorinParticipant.id, player_id: 'fandorin', nickname: 'Фандорин', slot_num: 6, fouls: 2 });

    const second = await applyFandorinAug28GameIdentityMigration(db);
    expect(second.applied).toBe(false);
    expect((await db.all<any>(`SELECT id FROM evening_participants WHERE evening_id='evening-28' AND player_id='fandorin'`))).toHaveLength(1);
  });

  it('aborts before any write when more than one Aug 28 evening contains the target identities', async () => {
    db = createDatabaseConnection(':memory:');
    await initializeOperationsSchema(db);

    const now = '2026-08-29T12:00:00.000Z';
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('chagin','Чагин',?,?)`, [now, now]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('fandorin','Фандорин',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at)
                  VALUES ('evening-a','A','2026-08-28T20:00:00+03:00','CASUAL','completed',400,?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at)
                  VALUES ('evening-b','B','2026-08-28T22:00:00+03:00','CASUAL','completed',400,?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
                  VALUES ('part-a','evening-a','chagin','going','going','attended','on_time','waived',0,0,?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
                  VALUES ('part-b','evening-b','chagin','going','going','attended','on_time','waived',0,0,?,?)`, [now, now]);
    await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
                  VALUES (1,'evening-a',1,'2026-08-28T21:00:00+03:00','draft','Черновик',?,?,?)`,
      [JSON.stringify(makeProtocol('part-a')), JSON.stringify(makeSlots('part-a')), now]);
    await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
                  VALUES (2,'evening-b',2,'2026-08-28T23:00:00+03:00','draft','Черновик',?,?,?)`,
      [JSON.stringify(makeProtocol('part-b')), JSON.stringify(makeSlots('part-b')), now]);

    await expect(applyFandorinAug28GameIdentityMigration(db)).rejects.toThrow('expected exactly one relevant');

    for (const gameId of [1, 2]) {
      const game = await db.get<any>('SELECT protocol_text FROM games WHERE id=?', [gameId]);
      expect(JSON.parse(game.protocol_text).player_results[0].player_id).toBe('chagin');
    }
    expect(await db.get<any>(`SELECT id FROM evening_participants WHERE player_id='fandorin' LIMIT 1`)).toBeNull();
  });
});
