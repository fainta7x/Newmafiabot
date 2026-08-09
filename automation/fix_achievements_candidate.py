from pathlib import Path

# Move tournament judge identity compatibility column after tournament migrations exist.
p = Path('src/db/index.ts')
text = p.read_text(encoding='utf-8')
early = "  addColumnIfNotExists('tournament_games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');\n"
if text.count(early) != 1:
    raise RuntimeError(f'expected one early tournament judge column, got {text.count(early)}')
text = text.replace(early, '', 1)
anchor = "  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');"
if text.count(anchor) != 1:
    raise RuntimeError('tournament post-migration anchor not found')
text = text.replace(anchor, "  addColumnIfNotExists('tournament_games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');\n" + anchor, 1)
p.write_text(text, encoding='utf-8')

# Use a deliberately minimal SQLite fixture so achievement tests do not depend on unrelated legacy migration ordering.
test = r'''import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_ORDER, ACHIEVEMENTS } from '../lib/achievementCatalog.ts';
import {
  collectPlayerAchievementStats,
  evaluatePlayerAchievements,
  importLegacyPlayerAchievements,
  qualifiesForAchievement,
  type AchievementStats,
} from '../server/services/playerAchievementsService.ts';

const makeDb = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, telegram_user_id TEXT UNIQUE, nickname TEXT NOT NULL, elo INTEGER NOT NULL DEFAULT 1000);
    CREATE TABLE game_evenings (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT, evening_id TEXT, winner_team TEXT NOT NULL,
      judge_name TEXT, judge_player_id TEXT, protocol_text TEXT, archived_at TEXT
    );
    CREATE TABLE tournaments (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE tournament_participants (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, player_id TEXT, display_name TEXT);
    CREATE TABLE tournament_games (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, status TEXT NOT NULL, winner_team TEXT, judge_player_id TEXT);
    CREATE TABLE tournament_game_seats (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, participant_id TEXT NOT NULL, role TEXT);
    CREATE TABLE tournament_game_protocols (id TEXT PRIMARY KEY, game_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, first_killed_participant_id TEXT);
    CREATE TABLE tournament_game_player_results (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, participant_id TEXT NOT NULL,
      regular_fouls INTEGER DEFAULT 0, technical_fouls INTEGER DEFAULT 0,
      minor_technical_fouls INTEGER DEFAULT 0, major_technical_fouls INTEGER DEFAULT 0
    );
    CREATE TABLE player_achievements (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'evaluator', legacy_user_id TEXT, created_at TEXT NOT NULL,
      UNIQUE(player_id, achievement_id)
    );
  `);
  const wrapper: any = {
    sqlite,
    async all(sql: string, params: any[] = []) { return sqlite.prepare(sql).all(...params); },
    async get(sql: string, params: any[] = []) { return sqlite.prepare(sql).get(...params) || null; },
    async run(sql: string, params: any[] = []) {
      const info = sqlite.prepare(sql).run(...params);
      return { lastID: info.lastInsertRowid ?? null, changes: info.changes };
    },
    async exec(sql: string) { sqlite.exec(sql); },
    async transaction<T>(cb: (tx: any) => Promise<T>) {
      sqlite.exec('BEGIN');
      try { const value = await cb(wrapper); sqlite.exec('COMMIT'); return value; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return wrapper;
};

const baseStats = (patch: Partial<AchievementStats> = {}): AchievementStats => ({
  completedGames: 0, wins: 0, elo: 1000, judgedGames: 0, puCount: 0, perfectGames: 0,
  roleWins: { sheriff: 0, mafia: 0, don: 0 }, ...patch,
});
const byId = (id: string) => ACHIEVEMENTS.find((item) => item.id === id)!;
const addPlayer = async (db: any, id: string, nickname: string, elo = 1000, telegram: string | null = null) => {
  await db.run('INSERT INTO players (id, telegram_user_id, nickname, elo) VALUES (?, ?, ?, ?)', [id, telegram, nickname, elo]);
};
const addCompletedClubGame = async (db: any, playerId: string, options: { role?: string; winner?: 'red'|'black'; firstKilled?: boolean; regular?: number; tech?: number } = {}) => {
  const eveningId = `evening-${Math.random()}`;
  await db.run("INSERT INTO game_evenings (id,status) VALUES (?, 'completed')", [eveningId]);
  const participantId = `participant-${Math.random()}`;
  const role = options.role || 'sheriff', winner = options.winner || 'red', tech = options.tech || 0;
  const protocol = {
    version: 1, kind: 'club_evening_protocol',
    protocol: { status: 'completed', winner_team: winner, first_killed_participant_id: options.firstKilled ? participantId : null },
    player_results: [{ participant_id: participantId, player_id: playerId, seat_number: 1, role, regular_fouls: options.regular || 0, technical_fouls: tech, minor_technical_fouls: tech, major_technical_fouls: 0 }],
  };
  await db.run('INSERT INTO games (evening_id,winner_team,protocol_text) VALUES (?, ?, ?)', [eveningId, winner, JSON.stringify(protocol)]);
};

describe('legacy achievement catalog', () => {
  it('keeps all 40 achievements and the legacy display order', () => {
    expect(ACHIEVEMENTS).toHaveLength(40);
    expect(ACHIEVEMENT_CATEGORIES.map((item) => item.id)).toEqual(['games','wins','rating','roles','judge','special']);
    expect(ACHIEVEMENT_ORDER).toEqual([
      'first_game','ten_games','twenty_games','thirty_games','fifty_games','seventy_games','hundred_games','one_fifty_games','two_hundred_games',
      'first_win','five_wins','ten_wins','twenty_wins','thirty_wins','forty_wins','fifty_wins','seventy_wins','hundred_wins',
      'elo_1400','elo_1500','elo_1550','elo_1600','elo_1650','elo_1700','elo_1750','elo_1800','elo_1900',
      'first_judge','five_judged','ten_judged','twenty_judged','fifty_judged','sheriff_win','mafia_win','don_win','pu_once','pu_three','pu_master','pu_ten','perfect_game'
    ]);
  });
  it('honours exact milestone boundaries, role wins, PU and perfect game', () => {
    expect(qualifiesForAchievement(byId('ten_games'), baseStats({ completedGames: 9 }))).toBe(false);
    expect(qualifiesForAchievement(byId('ten_games'), baseStats({ completedGames: 10 }))).toBe(true);
    expect(qualifiesForAchievement(byId('five_wins'), baseStats({ wins: 5 }))).toBe(true);
    expect(qualifiesForAchievement(byId('elo_1500'), baseStats({ elo: 1499 }))).toBe(false);
    expect(qualifiesForAchievement(byId('elo_1500'), baseStats({ elo: 1500 }))).toBe(true);
    expect(qualifiesForAchievement(byId('sheriff_win'), baseStats({ roleWins: { sheriff: 1, mafia: 0, don: 0 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('mafia_win'), baseStats({ roleWins: { sheriff: 0, mafia: 1, don: 0 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('don_win'), baseStats({ roleWins: { sheriff: 0, mafia: 0, don: 1 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('pu_three'), baseStats({ puCount: 2 }))).toBe(false);
    expect(qualifiesForAchievement(byId('pu_three'), baseStats({ puCount: 3 }))).toBe(true);
    expect(qualifiesForAchievement(byId('perfect_game'), baseStats({ perfectGames: 1 }))).toBe(true);
  });
});

describe('canonical achievement evaluator', () => {
  it('derives PU, perfect game and role win from a completed canonical club protocol', async () => {
    const db = makeDb(); await addPlayer(db, 'p1', 'Earned');
    await addCompletedClubGame(db, 'p1', { role: 'sheriff', winner: 'red', firstKilled: true });
    const stats = await collectPlayerAchievementStats(db, 'p1');
    expect(stats).toMatchObject({ completedGames: 1, wins: 1, puCount: 1, perfectGames: 1 });
    expect(stats.roleWins.sheriff).toBe(1); db.sqlite.close();
  });

  it('never guesses judged games from judge_name and counts stable judge_player_id only', async () => {
    const db = makeDb(); await addPlayer(db, 'judge-1', 'Judge Nick');
    await db.run("INSERT INTO game_evenings (id,status) VALUES ('judge-evening','completed')");
    const payload = JSON.stringify({ version:1, kind:'club_evening_protocol', protocol:{status:'completed',winner_team:'red'}, player_results:[] });
    const inserted = await db.run("INSERT INTO games (evening_id,winner_team,judge_name,protocol_text) VALUES ('judge-evening','red','Judge Nick',?)", [payload]);
    expect((await collectPlayerAchievementStats(db, 'judge-1')).judgedGames).toBe(0);
    await db.run('UPDATE games SET judge_player_id = ? WHERE id = ?', ['judge-1', inserted.lastID]);
    expect((await collectPlayerAchievementStats(db, 'judge-1')).judgedGames).toBe(1); db.sqlite.close();
  });

  it('is idempotent and never removes already-earned achievements', async () => {
    const db = makeDb(); await addPlayer(db, 'p2', 'Idempotent', 1500);
    const first = await evaluatePlayerAchievements(db, 'p2');
    const second = await evaluatePlayerAchievements(db, 'p2');
    expect(first).toEqual(expect.arrayContaining(['elo_1400', 'elo_1500'])); expect(second).toEqual([]);
    expect(Number((await db.get("SELECT COUNT(*) AS n FROM player_achievements WHERE player_id='p2'")).n)).toBe(2);
    await db.run("UPDATE players SET elo=1000 WHERE id='p2'"); await evaluatePlayerAchievements(db, 'p2');
    expect(Number((await db.get("SELECT COUNT(*) AS n FROM player_achievements WHERE player_id='p2'")).n)).toBe(2); db.sqlite.close();
  });

  it('preserves legacy earned_at when a stable Telegram identity exists', async () => {
    const db = makeDb(); await addPlayer(db, 'legacy-player', 'Legacy', 1000, '12345');
    await db.exec('CREATE TABLE user_achievements (user_id INTEGER, achievement_id TEXT, earned_at TEXT, PRIMARY KEY(user_id, achievement_id))');
    await db.run("INSERT INTO user_achievements VALUES (12345,'first_judge','2025-01-02T03:04:05Z')");
    await importLegacyPlayerAchievements(db);
    expect(await db.get("SELECT achievement_id,earned_at,source FROM player_achievements WHERE player_id='legacy-player' AND achievement_id='first_judge'"))
      .toMatchObject({ achievement_id:'first_judge', earned_at:'2025-01-02T03:04:05Z', source:'legacy' });
    db.sqlite.close();
  });
});
'''
Path('src/tests/playerAchievements.test.ts').write_text(test, encoding='utf-8')
print('Achievement candidate fixes applied.')
