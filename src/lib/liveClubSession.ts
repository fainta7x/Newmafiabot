import { determineVotingResult, type VotingRound } from '../shared/tournamentVoting';
import type { ShotEntry } from './api';
import type { LiveGameEvent } from '../shared/liveGameEvents';
import { appendLiveGameEvents, deriveLiveGameEvents, type LiveEventSnapshot } from './liveGameEventLog';

export const LEGACY_LIVE_SESSION_KEY = 'mafia_live_session';
export const LEGACY_DEATH_PROTOCOL_KEY = 'mafia_live_death_protocols';
export const LEGACY_PROTOCOL_NOTES_KEY = 'mafia_live_protocol_notes';

export const clubLiveSessionKey = (gameId: number | string) => `${LEGACY_LIVE_SESSION_KEY}:club:${String(gameId)}`;
export const clubLiveEvidenceKey = (gameId: number | string) => `${clubLiveSessionKey(gameId)}:protocol`;
export const clubLiveDeathProtocolKey = (gameId: number | string) => `${clubLiveSessionKey(gameId)}:death-protocols`;
export const clubLiveProtocolNotesKey = (gameId: number | string) => `${clubLiveSessionKey(gameId)}:notes`;

let activeClubLiveGameId: number | null = null;

/**
 * Runtime-only identity of the club game currently mounted in Live Game.
 * Betting start uses this canonical numeric game id instead of localStorage,
 * polling or nickname matching. It is intentionally not persisted.
 */
export const getActiveClubLiveGameId = (): number | null => activeClubLiveGameId;

export type LiveProtocolEvidence = {
  votes: VotingRound[];
  shots: ShotEntry[];
  /** Chronology of the game (owner, 2026-10-03). Optional: evidence saved by an older build has none. */
  events?: LiveGameEvent[];
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

/**
 * The live engine numbers voting rounds from 1 on every day, but a tournament protocol needs round numbers that are
 * unique across the whole game (and revotes point to their parent by that number). Renumbers the rounds one after
 * another in game order and re-points `parent_round_number` inside the same day.
 */
export const renumberVotingRoundsSequentially = (rounds: VotingRound[]): VotingRound[] => {
  const ordered = rounds.map(cloneRound).sort((a, b) => {
    const dayDiff = Number(a.day_number ?? 0) - Number(b.day_number ?? 0);
    return dayDiff || Number(a.round_number ?? 0) - Number(b.round_number ?? 0);
  });
  const newNumberByKey = new Map<string, number>();
  ordered.forEach((round, index) => newNumberByKey.set(roundKey(round), index + 1));
  return ordered.map((round, index) => {
    const parent = round.parent_round_number;
    const parentKey = parent === null || parent === undefined ? null : `${Number(round.day_number ?? 0)}:${Number(parent)}`;
    return {
      ...round,
      round_number: index + 1,
      parent_round_number: parentKey === null ? (parent ?? null) : (newNumberByKey.get(parentKey) ?? parent ?? null),
    };
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
  const existingEvents = evidence.events || [];
  const nextSeq = (existingEvents.length ? existingEvents[existingEvents.length - 1].seq : 0) + 1;
  const at = new Date().toISOString();
  const derived = deriveLiveGameEvents(previous as LiveEventSnapshot | null, current as LiveEventSnapshot, nextSeq, at);
  // A round decided in the same step that leaves the voting (no-elimination, a table decision, an auto result) never
  // shows its outcome in a saved snapshot: take it from the finalized rounds of the last voting snapshot.
  if (previous && shouldCommitPreviousVoting(previous, current)) {
    for (const round of finalizeLiveVotingRounds(previous)) {
      const before = (previous.votingRounds || []).find((item) => item.round_number === round.round_number);
      if (round.outcome && round.outcome !== 'pending' && (!before || before.outcome === 'pending')) {
        derived.push({
          seq: nextSeq + derived.length, at, round: Number(previous.roundNumber || 0), phase: 'day_voting',
          kind: 'vote_round_result', value: `${round.round_number}:${round.outcome}`,
        });
      }
    }
  }
  let events = appendLiveGameEvents(existingEvents, derived);
  if (!previous && !existingEvents.length) {
    events = [{ seq: 1, at, round: Number(current.roundNumber || 0), phase: String(current.phase || ''), kind: 'game_start', value: String(current.phase || '') }];
  }
  return { votes, shots, events };
};

/** A cheap fingerprint of the evidence, so the (growing) log is written to storage only when it changed. */
export const liveEvidenceSignature = (evidence: LiveProtocolEvidence): string =>
  `${evidence.events?.length ?? 0}:${evidence.events?.[evidence.events.length - 1]?.seq ?? 0}|${JSON.stringify(evidence.votes)}|${JSON.stringify(evidence.shots)}`;

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

export class ClubLiveSessionRecorder {
  readonly gameId: number;
  readonly sessionKey: string;
  readonly evidenceKey: string;
  readonly deathProtocolKey: string;
  readonly protocolNotesKey: string;
  private evidence: LiveProtocolEvidence = { votes: [], shots: [] };
  private previousSnapshot: LiveSessionSnapshot | null = null;
  private lastEvidenceSignature = '';
  private intervalId: number | null = null;
  private mounted = false;
  private readonly flushOnPageHide = () => this.sync();
  private readonly flushWhenHidden = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.sync();
  };

  constructor(gameId: number) {
    this.gameId = gameId;
    this.sessionKey = clubLiveSessionKey(gameId);
    this.evidenceKey = clubLiveEvidenceKey(gameId);
    this.deathProtocolKey = clubLiveDeathProtocolKey(gameId);
    this.protocolNotesKey = clubLiveProtocolNotesKey(gameId);
  }

  mount() {
    if (typeof window === 'undefined' || this.mounted) return;
    this.mounted = true;
    activeClubLiveGameId = this.gameId;
    this.evidence = parseJson<LiveProtocolEvidence>(localStorage.getItem(this.evidenceKey), { votes: [], shots: [] });
    const scoped = localStorage.getItem(this.sessionKey);
    if (scoped) localStorage.setItem(LEGACY_LIVE_SESSION_KEY, scoped);
    else localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    const scopedDeathProtocol = localStorage.getItem(this.deathProtocolKey);
    if (scopedDeathProtocol) localStorage.setItem(LEGACY_DEATH_PROTOCOL_KEY, scopedDeathProtocol);
    else localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    const scopedProtocolNotes = localStorage.getItem(this.protocolNotesKey);
    if (scopedProtocolNotes !== null) localStorage.setItem(LEGACY_PROTOCOL_NOTES_KEY, scopedProtocolNotes);
    else localStorage.removeItem(LEGACY_PROTOCOL_NOTES_KEY);
    this.sync();
    window.addEventListener('pagehide', this.flushOnPageHide);
    document.addEventListener('visibilitychange', this.flushWhenHidden);
    this.intervalId = window.setInterval(() => this.sync(), 75);
  }

  sync() {
    if (typeof window === 'undefined') return;
    const rawDeathProtocol = localStorage.getItem(LEGACY_DEATH_PROTOCOL_KEY);
    if (rawDeathProtocol) localStorage.setItem(this.deathProtocolKey, rawDeathProtocol);
    const rawProtocolNotes = localStorage.getItem(LEGACY_PROTOCOL_NOTES_KEY);
    if (rawProtocolNotes !== null) localStorage.setItem(this.protocolNotesKey, rawProtocolNotes);

    const raw = localStorage.getItem(LEGACY_LIVE_SESSION_KEY);
    if (!raw) return;
    const snapshot = parseJson<LiveSessionSnapshot | null>(raw, null);
    if (!snapshot) return;
    localStorage.setItem(this.sessionKey, raw);
    this.evidence = updateLiveProtocolEvidence(this.evidence, snapshot, this.previousSnapshot);
    this.previousSnapshot = snapshot;
    const signature = liveEvidenceSignature(this.evidence);
    if (signature !== this.lastEvidenceSignature) {
      this.lastEvidenceSignature = signature;
      localStorage.setItem(this.evidenceKey, JSON.stringify(this.evidence));
    }
  }

  /** The last engine snapshot the recorder saw (the engine drops its session when the game ends). */
  getLastSnapshot(): LiveSessionSnapshot | null {
    return this.previousSnapshot;
  }

  getEvidence(): LiveProtocolEvidence {
    this.sync();
    return {
      votes: this.evidence.votes.map(cloneRound),
      shots: this.evidence.shots.map((shot) => ({ ...shot })),
      events: (this.evidence.events || []).map((event) => ({ ...event })),
    };
  }

  private stopLifecycleSync() {
    if (typeof window === 'undefined') return;
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    window.removeEventListener('pagehide', this.flushOnPageHide);
    document.removeEventListener('visibilitychange', this.flushWhenHidden);
  }

  private clearActiveIdentity() {
    if (activeClubLiveGameId === this.gameId) activeClubLiveGameId = null;
  }

  unmount() {
    if (typeof window === 'undefined') return;
    this.sync();
    this.stopLifecycleSync();
    this.clearActiveIdentity();
    localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    localStorage.removeItem(LEGACY_PROTOCOL_NOTES_KEY);
    this.mounted = false;
  }

  finish() {
    if (typeof window === 'undefined') return;
    this.sync();
    this.stopLifecycleSync();
    this.clearActiveIdentity();
    localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    localStorage.removeItem(LEGACY_DEATH_PROTOCOL_KEY);
    localStorage.removeItem(LEGACY_PROTOCOL_NOTES_KEY);
    localStorage.removeItem(this.sessionKey);
    localStorage.removeItem(this.evidenceKey);
    localStorage.removeItem(this.deathProtocolKey);
    localStorage.removeItem(this.protocolNotesKey);
    this.mounted = false;
  }
}
