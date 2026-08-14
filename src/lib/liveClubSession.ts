import { determineVotingResult, type VotingRound } from '../shared/tournamentVoting';
import type { ShotEntry } from './api';

export const LEGACY_LIVE_SESSION_KEY = 'mafia_live_session';
export const LEGACY_DEATH_PROTOCOL_KEY = 'mafia_live_death_protocols';

export const clubLiveSessionKey = (gameId: number | string) => `${LEGACY_LIVE_SESSION_KEY}:club:${String(gameId)}`;
export const clubLiveEvidenceKey = (gameId: number | string) => `${clubLiveSessionKey(gameId)}:protocol`;
export const clubLiveDeathProtocolKey = (gameId: number | string) => `${clubLiveSessionKey(gameId)}:death-protocols`;

export type LiveProtocolEvidence = {
  votes: VotingRound[];
  shots: ShotEntry[];
};

type LiveSessionSnapshot = {
  phase?: string;
  roundNumber?: number;
  nightSubPhase?: string;
  postNightStage?: string;
  shotPlayerSlot?: number | null;
  nightLogs?: Array<{ round?: number; log?: string }>;
  activePlayers?: Array<{ slot_num?: number; alive?: boolean }>;
  votingRounds?: VotingRound[];
  activeVotingRoundIndex?: number;
  tableLeaveVotesInput?: number | null;
};

const cloneRound = (round: VotingRound): VotingRound => ({
  ...round,
  nominated_seats: [...(round.nominated_seats || [])],
  vote_counts: { ...(round.vote_counts || {}) },
  parent_nominated_seats: round.parent_nominated_seats ? [...round.parent_nominated_seats] : undefined,
  parent_vote_counts: round.parent_vote_counts ? { ...round.parent_vote_counts } : undefined,
  eliminated_seats: [...(round.eliminated_seats || [])],
});

const roundKey = (round: VotingRound) => `${Number(round.day_number ?? 0)}:${Number(round.round_number ?? 0)}`;

export const mergeLiveVotingRounds = (existing: VotingRound[], incoming: VotingRound[]): VotingRound[] => {
  const byKey = new Map(existing.map((round) => [roundKey(round), cloneRound(round)]));
  for (const round of incoming) {
    const key = roundKey(round);
    const previous = byKey.get(key);
    const next = cloneRound(round);
    if (!previous || previous.outcome === 'pending' || next.outcome !== 'pending') byKey.set(key, next);
  }
  return [...byKey.values()].sort((a, b) => {
    const dayDiff = Number(a.day_number ?? 0) - Number(b.day_number ?? 0);
    return dayDiff || Number(a.round_number ?? 0) - Number(b.round_number ?? 0);
  });
};

export const finalizeLiveVotingRounds = (snapshot: LiveSessionSnapshot | null | undefined): VotingRound[] => {
  const rounds = (snapshot?.votingRounds || []).map(cloneRound);
  if (!rounds.length) return rounds;
  const index = Math.max(0, Math.min(Number(snapshot?.activeVotingRoundIndex ?? rounds.length - 1), rounds.length - 1));
  const current = rounds[index];
  if (!current || current.outcome !== 'pending') return rounds;

  const withDecision: VotingRound = snapshot?.tableLeaveVotesInput == null
    ? current
    : { ...current, table_leave_votes: Number(snapshot.tableLeaveVotesInput) };
  const result = determineVotingResult(withDecision);

  if (result.outcome === 'single_eliminated') {
    rounds[index] = { ...withDecision, outcome: 'single_eliminated', eliminated_seats: [...result.eliminatedSeats] };
  } else if (result.outcome === 'needs_revote') {
    rounds[index] = { ...withDecision, outcome: 'tie_revote', eliminated_seats: [] };
  } else if (result.outcome === 'auto_no_elimination') {
    rounds[index] = { ...withDecision, outcome: 'no_elimination', eliminated_seats: [] };
  } else if (result.outcome === 'requires_table_decision' && result.resolvedOutcome) {
    rounds[index] = {
      ...withDecision,
      outcome: result.resolvedOutcome,
      eliminated_seats: [...result.eliminatedSeats],
    };
  }
  return rounds;
};

const shouldCommitPreviousVoting = (previous: LiveSessionSnapshot | null, current: LiveSessionSnapshot) =>
  previous?.phase === 'day_voting' && current.phase !== 'day_voting';

const nightResolutionHappened = (previous: LiveSessionSnapshot | null, current: LiveSessionSnapshot) => {
  if (!previous || previous.phase !== 'night' || previous.nightSubPhase !== 'morning') return false;
  const previousLogs = Array.isArray(previous.nightLogs) ? previous.nightLogs.length : 0;
  const currentLogs = Array.isArray(current.nightLogs) ? current.nightLogs.length : 0;
  return currentLogs > previousLogs || current.phase !== 'night' || current.postNightStage === 'farewell' || current.postNightStage === 'death_protocol';
};

export const shotFromResolvedNight = (snapshot: LiveSessionSnapshot): ShotEntry => {
  const nightNumber = Math.max(1, Number(snapshot.roundNumber || 1));
  const targetSeat = Number(snapshot.shotPlayerSlot || 0);
  if (!targetSeat) return { night_number: nightNumber, target_seat: 0, result: 'agreement_failed' };
  const target = (snapshot.activePlayers || []).find((player) => Number(player.slot_num) === targetSeat);
  return {
    night_number: nightNumber,
    target_seat: targetSeat,
    result: target?.alive === false ? 'miss' : 'killed',
  };
};

const mergeShots = (existing: ShotEntry[], incoming: ShotEntry): ShotEntry[] => {
  const next = existing.filter((shot) => Number(shot.night_number) !== Number(incoming.night_number));
  next.push(incoming);
  return next.sort((a, b) => Number(a.night_number) - Number(b.night_number));
};

export const updateLiveProtocolEvidence = (
  evidence: LiveProtocolEvidence,
  current: LiveSessionSnapshot,
  previous: LiveSessionSnapshot | null,
): LiveProtocolEvidence => {
  let votes = mergeLiveVotingRounds(evidence.votes, current.votingRounds || []);
  let shots = [...evidence.shots];

  if (shouldCommitPreviousVoting(previous, current) && previous) {
    votes = mergeLiveVotingRounds(votes, finalizeLiveVotingRounds(previous));
  }
  if (nightResolutionHappened(previous, current) && previous) {
    shots = mergeShots(shots, shotFromResolvedNight(previous));
  }
  return { votes, shots };
};

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

export class ClubLiveSessionRecorder {
  readonly gameId: number;
  readonly sessionKey: string;
  readonly evidenceKey: string;
  readonly deathProtocolKey: string;
  private evidence: LiveProtocolEvidence = { votes: [], shots: [] };
  private previousSnapshot: LiveSessionSnapshot | null = null;
  private intervalId: number | null = null;
  private mounted = false;

  constructor(gameId: number) {
    this.gameId = gameId;
    this.sessionKey = clubLiveSessionKey(gameId);
    this.evidenceKey = clubLiveEvidenceKey(gameId);
    this.deathProtocolKey = clubLiveDeathProtocolKey(gameId);
  }

  mount() {
    if (typeof window === 'undefined' || this.mounted) return;
    this.mounted = true;
    this.evidence = parseJson<LiveProtocolEvidence>(localStorage.getItem(this.evidenceKey), { votes: [], shots: [] });
    const scoped = localStorage.getItem(this.sessionKey);
    if (scoped) localStorage.setItem(LEGACY_LIVE_SESSION_KEY, scoped);
    else localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    const scopedDeathProtocol = localStorage.getItem(this.deathProtocolKey);
    if (scopedDeathProtocol) localStorage.setItem(LEGACY_DEATH_PROTOCOL_KEY, scopedDeathProtocol);
    else localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    this.sync();
    this.intervalId = window.setInterval(() => this.sync(), 75);
  }

  sync() {
    if (typeof window === 'undefined') return;
    const rawDeathProtocol = localStorage.getItem(LEGACY_DEATH_PROTOCOL_KEY);
    if (rawDeathProtocol) localStorage.setItem(this.deathProtocolKey, rawDeathProtocol);

    const raw = localStorage.getItem(LEGACY_LIVE_SESSION_KEY);
    if (!raw) return;
    const snapshot = parseJson<LiveSessionSnapshot | null>(raw, null);
    if (!snapshot) return;
    localStorage.setItem(this.sessionKey, raw);
    this.evidence = updateLiveProtocolEvidence(this.evidence, snapshot, this.previousSnapshot);
    this.previousSnapshot = snapshot;
    localStorage.setItem(this.evidenceKey, JSON.stringify(this.evidence));
  }

  getEvidence(): LiveProtocolEvidence {
    this.sync();
    return {
      votes: this.evidence.votes.map(cloneRound),
      shots: this.evidence.shots.map((shot) => ({ ...shot })),
    };
  }

  unmount() {
    if (typeof window === 'undefined') return;
    this.sync();
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    this.mounted = false;
  }

  finish() {
    if (typeof window === 'undefined') return;
    this.sync();
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    localStorage.removeItem(this.sessionKey);
    localStorage.removeItem(this.evidenceKey);
    localStorage.removeItem(this.deathProtocolKey);
    this.mounted = false;
  }
}
