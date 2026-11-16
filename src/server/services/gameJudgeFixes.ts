import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Owner, 2026-11-16: in the club evening of 13.11 «Точка» was recorded as the judge of games 40 and 41 by mistake (the
 * judge list allowed any player). The real judges: game 40 — Millourt, game 41 — Насон («40 милорд, в 41 Насон»).
 * Only a game that still has «Точка» as its judge is changed; once per database; a database without them does nothing.
 */
export const EVENING_2026_11_13 = '3ce7717d-8607-48aa-8dda-13f9d96ffeb4';
const TOCHKA = '1831ebec-3b1d-5e8e-b40a-758d73bb3706';
export const JUDGE_FIXES_2026_11_13: Array<{ gameNumber: number; judgeId: string }> = [
  { gameNumber: 40, judgeId: '5b0bcdd0-ea1c-5e84-9ac7-023bfa2c0a1a' }, // Millourt
  { gameNumber: 41, judgeId: 'b53a8fb8-5c34-4a81-9ee2-08b8a40a1f28' }, // Насон
];

export async function fixGameJudges20261113Once(db: DatabaseWrapper): Promise<number> {
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const key = '2026-11-16-game-judges-2026-11-13';
  if (await db.get('SELECT id FROM app_data_migrations WHERE id = ?', [key])) return 0;
  const columns = new Set((await db.all<{ name: string }>('PRAGMA table_info(games)')).map((column) => column.name));
  let changed = 0;
  if (columns.has('judge_player_id')) {
    for (const fix of JUDGE_FIXES_2026_11_13) {
      const judge = await db.get<{ nickname: string }>('SELECT nickname FROM players WHERE id = ?', [fix.judgeId]);
      if (!judge) continue;
      const result = await db.run(
        'UPDATE games SET judge_player_id = ?, judge_name = ? WHERE evening_id = ? AND global_game_number = ? AND judge_player_id = ?',
        [fix.judgeId, judge.nickname, EVENING_2026_11_13, fix.gameNumber, TOCHKA],
      );
      changed += Number(result.changes || 0);
    }
  }
  await db.run('INSERT OR IGNORE INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [key, new Date().toISOString()]);
  return changed;
}
