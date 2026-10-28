import {EVENING_VOTING_WINDOW_MS,ensureMvpRunoffIfNeeded,ensureRunoffSchema,MVP_RUNOFF_CATEGORY} from './eveningVoteRounds.ts';

/**
 * «MVP вечера» voting (owner, 2026-10-04): one question for the whole evening, open for three days after the evening is
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
      round:0|1;voteCategory:string;
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
  const runoff=await ensureMvpRunoffIfNeeded(db,eveningId);
  const round=runoff?1:0;
  const voteCategory=round?MVP_RUNOFF_CATEGORY:EVENING_VOTE_CATEGORY;
  const deadlineMs = runoff?Date.parse(runoff.deadline_at):Number.isFinite(baseTime) ? baseTime + EVENING_VOTING_WINDOW_MS : 0;
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
    .filter((row: any) => String(row.id) !== String(viewerId)&&(!runoff||runoff.nominees.includes(String(row.id))))
    .map((row: any) => ({
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      avatar_url: `/api/player/players/${encodeURIComponent(String(row.id))}/avatar`,
      categories: [EVENING_VOTE_CATEGORY],
    }));

  return { error: null, evening, votingOpen, deadlineMs, attendeeIds, nominees,round,voteCategory };
};

export type CastVoteResult =
  | { ok: true; nominee: { player_id: string; nickname: string }; updatedAt: string; deadlineMs: number }
  | { ok: false; code: 'not_completed' | 'not_attended' | 'closed' | 'round_changed' | 'bad_nominee' | 'ambiguous_nominee' };

/**
 * Records (or changes) the voter's vote. `nominee` is a player id, or — from a Telegram button, whose callback data is
 * limited to 64 bytes — the beginning of one; it must name exactly one other attendee.
 */
export const castEveningVote = async (db: any, eveningId: string, voterId: string, nominee: string, options: { allowPrefix?: boolean;round?:number } = {}): Promise<CastVoteResult> => {
  await ensureEveningVoteSchema(db);
  const context = await loadVotingContext(db, eveningId, voterId);
  if (context.error === 'not_completed') return { ok: false, code: 'not_completed' };
  if (context.error === 'not_attended') return { ok: false, code: 'not_attended' };
  if((options.round||0)!==context.round)return {ok:false,code:'round_changed'};
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
  `, [eveningId, voterId, context.voteCategory, chosen.player_id, now, now]);
  return { ok: true, nominee: { player_id: chosen.player_id, nickname: chosen.nickname }, updatedAt: now, deadlineMs: context.deadlineMs };
};

export type PendingVote = { round?:number;evening_id: string; title: string; deadline: string; voted: boolean; my_vote_nickname: string | null; voters: number; attendees: number };

/**
 * What the app shows on the player's home page (owner, 2026-10-13: the vote was hidden deep in «Клуб → Матчи»):
 * the latest closed evening the player attended whose voting is still open, with whether they already voted.
 */
export const loadPendingVoteForPlayer = async (db: any, playerId: string): Promise<PendingVote | null> => {
  await ensureEveningVoteSchema(db);
  await ensureRunoffSchema(db);
  const rows = await db.all(`
    SELECT e.id, e.title, e.starts_at, e.settled_at, e.updated_at
      FROM game_evenings e
      JOIN evening_participants ep ON ep.evening_id = e.id AND ep.player_id = ? AND ep.attendance_status = 'attended'
     WHERE e.status = 'completed' OR e.settled_at IS NOT NULL
     ORDER BY CASE WHEN EXISTS(SELECT 1 FROM evening_mvp_runoffs r WHERE r.evening_id=e.id AND datetime(r.deadline_at)>datetime(?)) THEN 0 ELSE 1 END, datetime(COALESCE(e.settled_at, e.updated_at, e.starts_at)) DESC
     LIMIT 3
  `, [playerId,new Date().toISOString()]);
  for (const evening of rows) {
    const context=await loadVotingContext(db,String(evening.id),playerId);
    if(context.error||!context.votingOpen)continue;
    const deadlineMs=context.deadlineMs;
    const attendees = Number((await db.get("SELECT COUNT(*) AS n FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'", [evening.id]))?.n || 0);
    if (attendees < 2) continue;
    const mine = await db.get(`
      SELECT p.nickname FROM evening_player_votes v JOIN players p ON p.id = v.nominee_player_id
       WHERE v.evening_id = ? AND v.voter_player_id = ? AND v.category = ? LIMIT 1
    `, [evening.id, playerId, context.voteCategory]);
    const voters = Number((await db.get('SELECT COUNT(*) AS n FROM evening_player_votes WHERE evening_id = ? AND category = ?', [evening.id, context.voteCategory]))?.n || 0);
    return { round:context.round,evening_id: String(evening.id), title: String(evening.title || 'Игровой вечер'), deadline: new Date(deadlineMs).toISOString(), voted: Boolean(mine), my_vote_nickname: mine ? String(mine.nickname || '') : null, voters, attendees };
  }
  return null;
};
