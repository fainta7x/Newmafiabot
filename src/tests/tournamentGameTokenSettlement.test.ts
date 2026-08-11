import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTournamentGameTokenSchema } from '../db/ensureTournamentGameTokenSchema.ts';
import { reconcileTournamentGameTokenSettlement } from '../server/services/tournamentGameTokenSettlementService.ts';

const roleForSeat = (seat: number) => seat <= 6 ? 'citizen' : seat === 7 ? 'sheriff' : seat <= 9 ? 'mafia' : 'don';

describe('tournament game token settlement', () => {
  let db: DatabaseWrapper;
  let dbPath = '';

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `tournament-token-${crypto.randomUUID()}.sqlite`);
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      );
      CREATE TABLE token_ledger (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason_type TEXT NOT NULL,
        description TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_hash TEXT NOT NULL,
        actor_type TEXT,
        actor_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE tournaments (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE tournament_games (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        game_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        winner_team TEXT,
        judge_player_id TEXT,
        completed_at TEXT
      );
      CREATE TABLE tournament_game_protocols (
        game_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        winner_team TEXT,
        end_reason TEXT,
        ppk_culprit_participant_id TEXT
      );
      CREATE TABLE tournament_participants (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        display_name TEXT
      );
      CREATE TABLE tournament_game_seats (
        game_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        seat_number INTEGER NOT NULL,
        role TEXT
      );
      CREATE TABLE tournament_game_player_results (
        game_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        exit_type TEXT,
        judge_bonus REAL,
        protocol_bonus REAL,
        ci_points REAL,
        disciplinary_penalty_points REAL,
        regular_fouls INTEGER,
        minor_technical_fouls INTEGER,
        major_technical_fouls INTEGER
      );
      CREATE TABLE tournament_game_best_moves (
        game_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        source TEXT NOT NULL,
        seat_numbers_json TEXT NOT NULL
      );
    `);
    for (let i = 1; i <= 11; i += 1) {
      raw.prepare('INSERT INTO players (id, nickname, tokens) VALUES (?, ?, 0)').run(`p-${i}`, `P${i}`);
    }
    raw.prepare("INSERT INTO tournaments (id, title) VALUES ('t-1', 'Test cup')").run();
    raw.prepare("INSERT INTO tournament_games (id, tournament_id, game_number, status, winner_team, judge_player_id) VALUES ('g-1','t-1',1,'completed','red','p-11')").run();
    raw.prepare("INSERT INTO tournament_game_protocols (game_id,status,winner_team,end_reason,ppk_culprit_participant_id) VALUES ('g-1','completed','red','normal',NULL)").run();
    for (let seat = 1; seat <= 10; seat += 1) {
      raw.prepare('INSERT INTO tournament_participants (id, player_id, display_name) VALUES (?, ?, ?)').run(`tp-${seat}`, `p-${seat}`, `P${seat}`);
      raw.prepare('INSERT INTO tournament_game_seats (game_id, participant_id, seat_number, role) VALUES (?, ?, ?, ?)').run('g-1', `tp-${seat}`, seat, roleForSeat(seat));
      raw.prepare(`INSERT INTO tournament_game_player_results
        (game_id,participant_id,exit_type,judge_bonus,protocol_bonus,ci_points,disciplinary_penalty_points,regular_fouls,minor_technical_fouls,major_technical_fouls)
        VALUES ('g-1',?,'alive',0,0,0,0,0,0,0)`).run(`tp-${seat}`);
    }
    raw.close();
    db = createDatabaseConnection(dbPath);
    await ensureTournamentGameTokenSchema(db);
  });

  afterEach(() => {
    try { db?.sqlite.close(); } catch {}
    try { if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
  });

  it('settles once, replays as a no-op and reverses exactly when the game is reopened', async () => {
    const first = await reconcileTournamentGameTokenSettlement(db, 'g-1', { activateIfUntracked: true, context: 'completion' });
    expect(first.mutations).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(215);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-8'")).tokens)).toBe(115);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(100);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM token_ledger')).n)).toBe(11);

    const replay = await reconcileTournamentGameTokenSettlement(db, 'g-1', { activateIfUntracked: true, context: 'completion' });
    expect(replay.mutations).toBe(0);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM token_ledger')).n)).toBe(11);

    await db.run("UPDATE tournament_games SET status='active' WHERE id='g-1'");
    await db.run("UPDATE tournament_game_protocols SET status='draft' WHERE game_id='g-1'");
    const reopened = await reconcileTournamentGameTokenSettlement(db, 'g-1', { context: 'reopen' });
    expect(reopened.mutations).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(0);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-8'")).tokens)).toBe(0);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(0);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM token_ledger')).n)).toBe(22);
  });
});
