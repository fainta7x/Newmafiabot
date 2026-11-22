import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';

/**
 * A game with a guest or a novice at the table counts for nobody (owner, 2026-11-22: «в играх, где есть гости новички не
 * учитывался Эло никому да и в принципе статистика не записывалась»; who: «Гость или игрок-новичок»; what: «Эло и вся
 * статистика»; from when: «Только вечер 20 ноября» back, older evenings stay as they were).
 *
 * The game stays in its evening and protocol; it gives no Elo to anybody and is left out of every statistic (profile,
 * roles, metrics, achievements, seasons, ratings). Decided once, when the game is completed, from the people at the table
 * then: a seat without a profile (a guest) or a player whose level is «Новичок». Stored on `games.stats_excluded`
 * (1 — out, 0 — counts, NULL — not decided yet); an edited protocol is decided again.
 */
export const STATS_GUEST_RULE_FROM = '2026-11-20T00:00:00+03:00';

/** The column exists on every database the readers see (also one made before it, or a test's own table). */
export const ensureGameStatsColumn = oncePerDatabase(async (db: DatabaseWrapper) => {
  const table = await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'games'").catch(() => null);
  const column = await db.get("SELECT 1 FROM pragma_table_info('games') WHERE name = 'stats_excluded'").catch(() => null);
  if (table && !column) await db.run('ALTER TABLE games ADD COLUMN stats_excluded INTEGER');
});

/** The SQL condition «this club game counts for statistics», for queries over `games` (alias `g` by default). */
export const clubGameCountsSql = (g = 'g') => `COALESCE(${g}.stats_excluded, 0) = 0`;

const parse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

/** Decides every completed club game not decided yet. Returns how many games were newly left out. */
export async function decideGameStatsExclusion(db: DatabaseWrapper): Promise<number> {
  await ensureGameStatsColumn(db);
  const rows = await db.all<{ id: number; protocol_text: string; starts_at: string | null; game_date: string | null }>(`
    SELECT g.id, g.protocol_text, e.starts_at, g.game_date FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.stats_excluded IS NULL AND g.evening_id IS NOT NULL AND g.protocol_text IS NOT NULL
       AND json_valid(g.protocol_text) AND json_extract(g.protocol_text, '$.protocol.status') = 'completed'`).catch(() => []);
  if (!rows.length) return 0;
  const from = Date.parse(STATS_GUEST_RULE_FROM);
  const hasLevel = (await db.all<{ name: string }>('PRAGMA table_info(players)')).some((column) => column.name === 'game_level');
  const novices = new Set((await db.all<{ id: string }>(`SELECT id FROM players WHERE ${hasLevel ? "COALESCE(game_level, '') IN ('novice', 'unrated') OR " : ''}COALESCE(source, '') = 'legacy_guest_migrated'`)).map((row) => String(row.id)));
  let excluded = 0;
  for (const row of rows) {
    const when = Date.parse(String(row.starts_at || row.game_date || ''));
    let out = false;
    if (Number.isFinite(when) && when >= from) {
      const results = Array.isArray(parse(row.protocol_text)?.player_results) ? parse(row.protocol_text).player_results : [];
      out = results.some((result: any) => {
        const playerId = String(result?.player_id || '').trim();
        return Boolean(result?.guest_placeholder_id) || !playerId || novices.has(playerId);
      });
    }
    await db.run('UPDATE games SET stats_excluded = ? WHERE id = ? AND stats_excluded IS NULL', [out ? 1 : 0, row.id]);
    if (out) excluded += 1;
  }
  return excluded;
}
