import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    db = createDatabaseConnection(dbPath);
    await ensureTournamentGameTokenSchema(db);

    const now = new Date().toISOString();
    for (let i = 1; i <= 11; i += 1) {
      await db.run(
        `INSERT INTO players
          (id, nickname, lifecycle_status, contact_status, source, elo, tokens, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 'test', 1000, 0, ?, ?)`,
        [`p-${i}`, `P${i}`, now, now],
      );
    }

    await db.run(
      `INSERT INTO tournaments (id, title, date, status, created_at, updated_at)
       VALUES ('t-1', 'Test cup', ?, 'active', ?, ?)`,
      [now, now, now],
    );
    await db.run(
      `INSERT INTO tournament_games
        (id, tournament_id, game_number, judge_name, judge_player_id, status, winner_team, completed_at)
       VALUES ('g-1', 't-1', 1, 'P11', 'p-11', 'completed', 'red', ?)`,
      [now],
    );
    await db.run(
      `INSERT INTO tournament_game_protocols
        (id, game_id, status, winner_team, end_reason, ppk_culprit_participant_id, created_at, updated_at, completed_at)
       VALUES ('protocol-1', 'g-1', 'completed', 'red', 'normal', NULL, ?, ?, ?)`,
      [now, now, now],
    );

    for (let seat = 1; seat <= 10; seat += 1) {
      await db.run(
        `INSERT INTO tournament_participants
          (id, tournament_id, player_id, display_name, participant_number)
         VALUES (?, 't-1', ?, ?, ?)`,
        [`tp-${seat}`, `p-${seat}`, `P${seat}`, seat],
      );
      await db.run(
        `INSERT INTO tournament_game_seats
          (id, game_id, participant_id, seat_number, role)
         VALUES (?, 'g-1', ?, ?, ?)`,
        [`seat-${seat}`, `tp-${seat}`, seat, roleForSeat(seat)],
      );
      await db.run(
        `INSERT INTO tournament_game_player_results
          (id, game_id, participant_id, exit_type, judge_bonus, protocol_bonus, ci_points,
           disciplinary_penalty_points, regular_fouls, minor_technical_fouls, major_technical_fouls)
         VALUES (?, 'g-1', ?, 'alive', 0, 0, 0, 0, 0, 0, 0)`,
        [`result-${seat}`, `tp-${seat}`],
      );
    }
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