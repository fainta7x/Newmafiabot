import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { EVENING_2026_11_13, fixGameJudges20261113Once } from '../server/services/gameJudgeFixes';

describe('the judges of 13.11 (owner, 2026-11-16: «40 милорд, в 41 Насон»)', () => {
  let db: DatabaseWrapper;
  afterEach(() => { try { db.sqlite.close(); } catch {} });
  it('replaces «Точка» by Millourt in game 40 and by Насон in game 41, touches nothing else, runs once', async () => {
    db = createDatabaseConnection(':memory:'); await createApp(db);
    const now = '2026-11-13T17:00:00.000Z';
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?,'Вечер',?,'Europe/Moscow','CASUAL','completed',20,100,?,?)`, [EVENING_2026_11_13, now, now, now]);
    for (const [id, nickname] of [['1831ebec-3b1d-5e8e-b40a-758d73bb3706', 'Точка'], ['5b0bcdd0-ea1c-5e84-9ac7-023bfa2c0a1a', 'Millourt'], ['b53a8fb8-5c34-4a81-9ee2-08b8a40a1f28', 'Насон'], ['chagin', 'Чагин']]) await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, nickname, now, now]);
    const game = (n: number, judgeId: string, judge: string) => db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,judge_player_id,slots_json,created_at) VALUES (?,?,?,'red','Победа',?,?,'[]',?)`, [EVENING_2026_11_13, n, now, judge, judgeId, now]);
    await game(39, 'chagin', 'Чагин'); await game(40, '1831ebec-3b1d-5e8e-b40a-758d73bb3706', 'Точка'); await game(41, '1831ebec-3b1d-5e8e-b40a-758d73bb3706', 'Точка');
    await db.run(`DELETE FROM app_data_migrations WHERE id = '2026-11-16-game-judges-2026-11-13'`);
    expect(await fixGameJudges20261113Once(db)).toBe(2);
    const judges = await db.all<any>('SELECT global_game_number AS n, judge_name, judge_player_id FROM games ORDER BY n');
    expect(judges.map((row) => [row.n, row.judge_name])).toEqual([[39, 'Чагин'], [40, 'Millourt'], [41, 'Насон']]);
    expect(await fixGameJudges20261113Once(db)).toBe(0);
  });
});
