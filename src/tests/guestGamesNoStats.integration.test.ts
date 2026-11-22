import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index';
import { loadPlayerEloHistory } from '../server/services/playerEloHistoryService';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService';
import { listCompletedGames, listPlayerGameResults, COMPLETED_GAME_PLAYERS_SQL } from '../server/services/gameService';
import { loadStatGames } from '../server/services/gameStatisticsService';
import { applyGuestGamesStatsExclusion } from '../server/dataMigrations/applyGuestGamesStatsExclusion';

// Owner, 2026-11-22: a game with a guest or a novice at the table gives Elo to nobody and is left out of every statistic;
// from the evening of 20 November on, older evenings stay as they were.
const ROLES = ['Дон', 'Мафия', 'Мафия', 'Шериф', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный'];
type Db = ReturnType<typeof createDatabaseConnection>;

const seedGame = async (db: Db, number: number, prefix: string, startsAt: string, seat10: 'player' | 'guest' | 'novice') => {
  if (!(await db.all<any>('PRAGMA table_info(players)')).some((column) => column.name === 'game_level')) await db.run("ALTER TABLE players ADD COLUMN game_level TEXT NOT NULL DEFAULT 'club'");
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 10; index += 1) {
    const playerId = index === 9 ? `${prefix}-p10` : `shared-p${index + 1}`;
    const level = index === 9 && seat10 === 'novice' ? 'novice' : 'club';
    await db.run(`INSERT OR IGNORE INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, game_level, created_at, updated_at)
       VALUES (?, ?, 'normal', 'normal', 'test', 1000, 0, ?, ?, ?)`, [playerId, playerId, level, startsAt, startsAt]);
    const guest = index === 9 && seat10 === 'guest';
    results.push({ player_id: guest ? null : playerId, guest_placeholder_id: guest ? 'guest-1' : null, participant_id: `${prefix}-part-${index + 1}`,
      seat_number: index + 1, role: ROLES[index], judge_bonus: 0, protocol_bonus: 0, ci_points: 0, minor_technical_fouls: 0, major_technical_fouls: 0 });
  }
  const eveningId = `${prefix}-evening`;
  await db.run(`INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, default_price, created_at, updated_at)
     VALUES (?, 'Вечер', ?, 'Europe/Moscow', 'CASUAL', 'active', 0, ?, ?)`, [eveningId, startsAt, startsAt, startsAt]);
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { game_id: String(number), status: 'completed', winner_team: 'red', completed_at: startsAt }, player_results: results };
  await db.run(`INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
     VALUES (?, ?, ?, 'Красные', 'Победа Красные', ?, '[]', ?)`, [eveningId, number, startsAt, JSON.stringify(protocol), startsAt]);
};

describe('a game with a guest or a novice counts for nobody (owner, 2026-11-22)', () => {
  it('from 20 November: no Elo for anybody, out of the player games, the statistics and the counts; older games stay', async () => {
    const db = createDatabaseConnection(':memory:');
    try {
      await seedGame(db, 1, 'old', '2026-11-13T17:00:00.000Z', 'guest'); // before 20.11: counts as before
      await seedGame(db, 2, 'guest', '2026-11-20T17:00:00.000Z', 'guest');
      await seedGame(db, 3, 'novice', '2026-11-20T18:00:00.000Z', 'novice');
      await seedGame(db, 4, 'full', '2026-11-20T19:00:00.000Z', 'player');
      const rows = await rebuildCanonicalEloRatings(db);
      expect(rows.find((row) => row.player_id === 'shared-p1')?.games).toBe(2); // games 1 and 4
      expect(rows.find((row) => row.player_id === 'novice-p10')?.games ?? 0).toBe(0);
      const flags = await db.all<{ global_game_number: number; stats_excluded: number }>('SELECT global_game_number, stats_excluded FROM games ORDER BY global_game_number');
      expect(flags.map((row) => row.stats_excluded)).toEqual([0, 1, 1, 0]);
      const history = await loadPlayerEloHistory(db);
      expect(history.map((event) => event.sourceId).length).toBe(2);
      expect((await listPlayerGameResults(db, 'shared-p1')).map((entry) => entry.game.number).sort()).toEqual([1, 4]);
      expect((await listCompletedGames(db)).map((game) => game.number).sort()).toEqual([1, 4]);
      expect((await loadStatGames(db)).length).toBe(2);
      const played = await db.all<{ game_key: string }>(`SELECT DISTINCT game_key FROM (${COMPLETED_GAME_PLAYERS_SQL})`);
      expect(played.length).toBe(2);
    } finally { db.sqlite.close(); }
  });

  it('an edited protocol is decided again: the guest replaced by a player — the game counts', async () => {
    const db = createDatabaseConnection(':memory:');
    try {
      await seedGame(db, 2, 'guest', '2026-11-20T17:00:00.000Z', 'guest');
      await rebuildCanonicalEloRatings(db);
      expect((await db.get<any>('SELECT stats_excluded FROM games'))!.stats_excluded).toBe(1);
      const game = await db.get<any>('SELECT id, protocol_text FROM games');
      const payload = JSON.parse(game.protocol_text);
      payload.player_results[9] = { ...payload.player_results[9], player_id: 'shared-p1-x', guest_placeholder_id: null };
      await db.run("INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, game_level, created_at, updated_at) VALUES ('shared-p1-x','X','normal','normal','test',1000,0,'club','x','x')");
      // What the protocol save does: the new protocol and a fresh decision.
      await db.run('UPDATE games SET protocol_text = ?, stats_excluded = NULL WHERE id = ?', [JSON.stringify(payload), game.id]);
      await rebuildCanonicalEloRatings(db);
      expect((await db.get<any>('SELECT stats_excluded FROM games'))!.stats_excluded).toBe(0);
    } finally { db.sqlite.close(); }
  });

  it('the one-time migration decides the games played and runs once', async () => {
    const db = createDatabaseConnection(':memory:');
    try {
      await seedGame(db, 2, 'guest', '2026-11-20T17:00:00.000Z', 'guest');
      expect(await applyGuestGamesStatsExclusion(db)).toEqual({ applied: true, excluded: 1 });
      expect(await applyGuestGamesStatsExclusion(db)).toEqual({ applied: false });
    } finally { db.sqlite.close(); }
  });
});
