import type { DatabaseWrapper } from '../../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from './clubGameAnalyticsService.ts';

/**
 * The single «MVP вечера» of an evening (owner, 2026-10-14). The player with the most votes; on a tie the one with more game
 * wins that evening; then more wins as Дон or Шериф; if it is still equal the club owner decides (`evening_mvp_decisions`).
 * Nobody is chosen without a vote.
 */
export const MVP_VOTE_CATEGORY = 'best_player';
const MVP_CALLBACK_LIMIT = 64;

export type MvpCandidate = { player_id: string; nickname: string; votes: number; wins: number; key_role_wins: number };
export type MvpResolution =
  | { status: 'none'; total_votes: 0; candidates: [] }
  | { status: 'winner'; source: 'votes' | 'wins' | 'key_roles' | 'owner'; winner: MvpCandidate; total_votes: number; candidates: MvpCandidate[] }
  | { status: 'tie'; total_votes: number; candidates: MvpCandidate[] };

export async function ensureMvpDecisionSchema(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_mvp_decisions (
      evening_id TEXT PRIMARY KEY,
      winner_player_id TEXT NOT NULL,
      decided_by TEXT,
      decided_at TEXT NOT NULL
    )
  `);
}

const tableExists = async (db: DatabaseWrapper, name: string) =>
  Boolean(await db.get<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", [name]));

/** Wins of every player in the club games of one evening, in total and as Дон / Шериф. */
const winsOfEvening = (snapshots: CompletedGameSnapshot[], eveningId: string) => {
  const result = new Map<string, { wins: number; key: number }>();
  for (const snapshot of snapshots) {
    if (snapshot.source !== 'club' || String(snapshot.event_id) !== eveningId) continue;
    for (const player of snapshot.players) {
      if (!player.player_id || !player.won) continue;
      const current = result.get(String(player.player_id)) || { wins: 0, key: 0 };
      current.wins += 1;
      if (player.role === 'don' || player.role === 'sheriff') current.key += 1;
      result.set(String(player.player_id), current);
    }
  }
  return result;
};

export type SnapshotSource = CompletedGameSnapshot[] | (() => Promise<CompletedGameSnapshot[]>);

/** `snapshots`: the completed games, or a loader called only when a tie needs them (so a scan of many evenings reads them at most once). */
export async function resolveEveningMvp(db: DatabaseWrapper, eveningId: string, snapshots?: SnapshotSource): Promise<MvpResolution> {
  if (!(await tableExists(db, 'evening_player_votes'))) return { status: 'none', total_votes: 0, candidates: [] };
  const rows = await db.all<any>(
    `SELECT v.nominee_player_id AS player_id, p.nickname, COUNT(*) AS votes
       FROM evening_player_votes v JOIN players p ON p.id = v.nominee_player_id
      WHERE v.evening_id = ? AND v.category = ?
      GROUP BY v.nominee_player_id, p.nickname`,
    [eveningId, MVP_VOTE_CATEGORY],
  );
  if (!rows.length) return { status: 'none', total_votes: 0, candidates: [] };
  const totalVotes = rows.reduce((sum, row) => sum + Number(row.votes || 0), 0);
  const best = Math.max(...rows.map((row) => Number(row.votes || 0)));
  const top = rows.filter((row) => Number(row.votes || 0) === best);

  let wins = new Map<string, { wins: number; key: number }>();
  if (top.length > 1) wins = winsOfEvening(typeof snapshots === 'function' ? await snapshots() : (snapshots ?? await loadCompletedGameSnapshots(db)), eveningId);
  const toCandidate = (row: any): MvpCandidate => ({
    player_id: String(row.player_id), nickname: String(row.nickname || 'Игрок'), votes: Number(row.votes || 0),
    wins: wins.get(String(row.player_id))?.wins || 0, key_role_wins: wins.get(String(row.player_id))?.key || 0,
  });
  const candidates = top.map(toCandidate);
  if (candidates.length === 1) return { status: 'winner', source: 'votes', winner: candidates[0], total_votes: totalVotes, candidates };

  await ensureMvpDecisionSchema(db);
  const decision = await db.get<any>('SELECT winner_player_id FROM evening_mvp_decisions WHERE evening_id = ?', [eveningId]);
  const decided = decision ? candidates.find((item) => item.player_id === String(decision.winner_player_id)) : null;
  if (decided) return { status: 'winner', source: 'owner', winner: decided, total_votes: totalVotes, candidates };

  const mostWins = Math.max(...candidates.map((item) => item.wins));
  const byWins = candidates.filter((item) => item.wins === mostWins);
  if (byWins.length === 1) return { status: 'winner', source: 'wins', winner: byWins[0], total_votes: totalVotes, candidates };
  const mostKey = Math.max(...byWins.map((item) => item.key_role_wins));
  const byKey = byWins.filter((item) => item.key_role_wins === mostKey);
  if (byKey.length === 1) return { status: 'winner', source: 'key_roles', winner: byKey[0], total_votes: totalVotes, candidates };
  return { status: 'tie', total_votes: totalVotes, candidates: byKey };
}

/** `mvw:<evening>:<start of the player id>` — the owner's button under the «who is MVP» question. */
export const mvpDecisionCallbackData = (eveningId: string, playerId: string): string | null => {
  const head = `mvw:${eveningId}:`;
  const room = MVP_CALLBACK_LIMIT - Buffer.byteLength(head, 'utf8');
  if (room < 4) return null;
  return `${head}${playerId.slice(0, Math.min(playerId.length, room))}`;
};

export type MvpDecisionResult = { ok: true; winner: { player_id: string; nickname: string } } | { ok: false; code: 'forbidden' | 'not_found' | 'not_tie' | 'bad_nominee' };

/** The club owner picks the winner among the tied candidates (the nominee may be the start of a player id). */
export async function decideEveningMvp(db: DatabaseWrapper, eveningId: string, deciderPlayerId: string, nominee: string): Promise<MvpDecisionResult> {
  if (deciderPlayerId !== PRIMARY_ORGANIZER_PLAYER_ID) return { ok: false, code: 'forbidden' };
  const resolution = await resolveEveningMvp(db, eveningId);
  if (resolution.status === 'none') return { ok: false, code: 'not_found' };
  // Only a tie on votes needs (or allows) a decision; a clear winner by votes is final.
  const pool = resolution.candidates;
  if (pool.length < 2) return { ok: false, code: 'not_tie' };
  const wanted = String(nominee || '').trim();
  const matches = wanted ? pool.filter((item) => item.player_id === wanted || (wanted.length >= 4 && item.player_id.startsWith(wanted))) : [];
  const exact = matches.find((item) => item.player_id === wanted);
  const chosen = exact || (matches.length === 1 ? matches[0] : null);
  if (!chosen) return { ok: false, code: 'bad_nominee' };
  await ensureMvpDecisionSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_mvp_decisions (evening_id, winner_player_id, decided_by, decided_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET winner_player_id = excluded.winner_player_id, decided_by = excluded.decided_by, decided_at = excluded.decided_at`,
    [eveningId, chosen.player_id, deciderPlayerId, now],
  );
  return { ok: true, winner: { player_id: chosen.player_id, nickname: chosen.nickname } };
}

/** Why this player won, in plain words for the post. */
export const mvpReasonText = (resolution: Extract<MvpResolution, { status: 'winner' }>): string => {
  if (resolution.source === 'wins') return 'Голоса разделились поровну — решили победы в играх вечера.';
  if (resolution.source === 'key_roles') return 'Голоса разделились поровну, побед поровну — решили победы за Дона и Шерифа.';
  if (resolution.source === 'owner') return 'Голоса разделились поровну — решение организатора.';
  return '';
};
