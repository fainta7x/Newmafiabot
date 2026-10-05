import { EVENING_VOTING_WINDOW_MS } from './clubYearAwardsService.ts';

/**
 * «Игрок вечера» voting (owner, 2026-10-04): one question for the whole evening, open for three days after the evening is
 * closed, only for players who attended and only for another attendee. One place for the rules, used by the app
 * (`playerEveningVotingRoutes`) and by the Telegram bot buttons (`POST /api/bot/evenings/:id/vote`).
 */

export const EVENING_VOTE_CATEGORY = 'best_player';

export type VotingContext =
  | { error: 'not_completed' }
  | { error: 'not_attended'; evening: any }
  | {
      error: null;
      evening: any;
      votingOpen: boolean;
      deadlineMs: number;
      attendeeIds: Set<string>;
      nominees: Array<{ player_id: string; nickname: string; avatar_url: string; categories: string[] }>;
    };

export const ensureEveningVoteSchema = async (db: any) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_player_votes (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      voter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      nominee_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, voter_player_id, category)
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_evening_player_votes_results
      ON evening_player_votes(evening_id, category, nominee_player_id)
  `);
};

export const loadVotingContext = async (db: any, eveningId: string, viewerId: string): Promise<VotingContext> => {
  const evening = await db.get(`
    SELECT id, title, starts_at, settled_at, status
      FROM game_evenings
     WHERE id = ?
     LIMIT 1
  `, [eveningId]);
  if (!evening || (evening.status !== 'completed' && !evening.settled_at)) return { error: 'not_completed' };

  const viewer = await db.get(`
    SELECT id
      FROM evening_participants
     WHERE evening_id = ? AND player_id = ? AND attendance_status = 'attended'
     LIMIT 1
  `, [eveningId, viewerId]);
  if (!viewer) return { error: 'not_attended', evening };

  const baseTime = new Date(String(evening.settled_at || evening.starts_at || '')).getTime();
  const deadlineMs = Number.isFinite(baseTime) ? baseTime + EVENING_VOTING_WINDOW_MS : 0;
  const votingOpen = deadlineMs > Date.now();

  const attendeeRows = await db.all(`
    SELECT p.id, p.nickname
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);

  const attendeeIds = new Set<string>(attendeeRows.map((row: any) => String(row.id)));
  const nominees = attendeeRows
    .filter((row: any) => String(row.id) !== String(viewerId))
    .map((row: any) => ({
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      avatar_url: `/api/player/players/${encodeURIComponent(String(row.id))}/avatar`,
      categories: [EVENING_VOTE_CATEGORY],
    }));

  return { error: null, evening, votingOpen, deadlineMs, attendeeIds, nominees };
};

export type CastVoteResult =
  | { ok: true; nominee: { player_id: string; nickname: string }; updatedAt: string; deadlineMs: number }
  | { ok: false; code: 'not_completed' | 'not_attended' | 'closed' | 'bad_nominee' | 'ambiguous_nominee' };

/**
 * Records (or changes) the voter's vote. `nominee` is a player id, or — from a Telegram button, whose callback data is
 * limited to 64 bytes — the beginning of one; it must name exactly one other attendee.
 */
export const castEveningVote = async (db: any, eveningId: string, voterId: string, nominee: string, options: { allowPrefix?: boolean } = {}): Promise<CastVoteResult> => {
  await ensureEveningVoteSchema(db);
  const context = await loadVotingContext(db, eveningId, voterId);
  if (context.error === 'not_completed') return { ok: false, code: 'not_completed' };
  if (context.error === 'not_attended') return { ok: false, code: 'not_attended' };
  if (!context.votingOpen) return { ok: false, code: 'closed' };

  const wanted = String(nominee || '').trim();
  const matches = wanted
    ? context.nominees.filter((item) => item.player_id === wanted || (options.allowPrefix && wanted.length >= 4 && item.player_id.startsWith(wanted)))
    : [];
  const exact = matches.find((item) => item.player_id === wanted);
  const chosen = exact || (matches.length === 1 ? matches[0] : null);
  if (!chosen) return { ok: false, code: matches.length > 1 ? 'ambiguous_nominee' : 'bad_nominee' };
  if (!context.attendeeIds.has(chosen.player_id)) return { ok: false, code: 'bad_nominee' };

  const now = new Date().toISOString();
  await db.run(`
    INSERT INTO evening_player_votes (
      evening_id, voter_player_id, category, nominee_player_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(evening_id, voter_player_id, category) DO UPDATE SET
      nominee_player_id = excluded.nominee_player_id,
      updated_at = excluded.updated_at
  `, [eveningId, voterId, EVENING_VOTE_CATEGORY, chosen.player_id, now, now]);
  return { ok: true, nominee: { player_id: chosen.player_id, nickname: chosen.nickname }, updatedAt: now, deadlineMs: context.deadlineMs };
};
