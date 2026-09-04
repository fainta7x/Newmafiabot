import { buildLiveGameStateView, parseLiveGameSnapshot } from './liveGameState';
import { determineVotingResult, type VotingRound } from '../shared/tournamentVoting';

export const LIVE_BROADCAST_VERSION = 1 as const;

export type LiveBroadcastPlayerStatus = 'alive' | 'killed' | 'voted' | 'removed' | 'ppk' | 'out';

export type LiveBroadcastPlayer = {
  seat: number;
  playerId: string | null;
  nickname: string;
  role: string;
  team: string;
  alive: boolean;
  status: string;
  statusKind: LiveBroadcastPlayerStatus;
  fouls: number;
  minorTech: number;
  majorTech: number;
  ppk: boolean;
};

export type LiveBroadcastNomination = {
  seat: number;
  order: number;
  nominatedBy: number | null;
};

export type LiveBroadcastVote = {
  roundNumber: number;
  isRevote: boolean;
  candidates: number[];
  highlightedCandidates: number[];
  published: boolean;
  counts: Record<number, number>;
  assignments: Record<number, number>;
  outcome: string | null;
};

export type LiveBroadcastState = {
  version: typeof LIVE_BROADCAST_VERSION;
  gameId: number;
  globalGameNumber: number;
  eveningGameNumber: number | null;
  tableName: string | null;
  phaseKey: string;
  phaseTitle: string;
  phaseDetail: string;
  roundNumber: number;
  currentSpeakerSeat: number | null;
  timerSeconds: number | null;
  timerMaxSeconds: number | null;
  timerRunning: boolean;
  timerLabel: string | null;
  players: LiveBroadcastPlayer[];
  nominations: LiveBroadcastNomination[];
  vote: LiveBroadcastVote | null;
  updatedAt: string;
};

export type LiveBroadcastEnvelope = {
  connected: boolean;
  receivedAt: string | null;
  state: LiveBroadcastState | null;
};

export type LiveBroadcastGameMetadata = {
  gameId: number;
  globalGameNumber: number;
  eveningGameNumber?: number | null;
  tableName?: string | null;
  players: Array<{
    seat: number;
    playerId?: string | null;
    nickname: string;
  }>;
};

const asObject = (value: unknown): Record<string, any> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null
);

const toSeat = (value: unknown): number | null => {
  const seat = Number(value);
  return Number.isInteger(seat) && seat >= 1 && seat <= 10 ? seat : null;
};

const toNonNegativeInteger = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
};

const playerStatusKind = (player: Record<string, any>): LiveBroadcastPlayerStatus => {
  if (player.alive !== false) return 'alive';
  if (player.ppk) return 'ppk';
  if (player.exit_reason === 'killed') return 'killed';
  if (player.exit_reason === 'voted_zero_round' || player.exit_reason === 'voted_day') return 'voted';
  if (player.exit_reason === 'removed' || player.kick) return 'removed';
  return 'out';
};

const resultIsPublished = (stage: unknown): boolean => (
  stage === 'round_result'
  || stage === 'revote_speeches'
  || stage === 'table_decision'
  || stage === 'resolved'
);

const recordSeats = (value: unknown, allowedTargets?: Set<number>): Record<number, number> => {
  const object = asObject(value) || {};
  const result: Record<number, number> = {};
  for (const [rawKey, rawValue] of Object.entries(object)) {
    const key = toSeat(rawKey);
    const target = toSeat(rawValue);
    if (!key || !target || (allowedTargets && !allowedTargets.has(target))) continue;
    result[key] = target;
  }
  return result;
};

/**
 * Produces the small, audience-safe state sent to the OBS bridge. The complete
 * judge snapshot (history, checks, notes and pending interactions) never leaves
 * the phone through this path.
 */
export const buildLiveBroadcastState = (
  rawSnapshot: unknown,
  metadata: LiveBroadcastGameMetadata,
): LiveBroadcastState | null => {
  const snapshot = parseLiveGameSnapshot(rawSnapshot);
  const view = buildLiveGameStateView(rawSnapshot);
  if (!snapshot || !view) return null;

  const metadataBySeat = new Map(metadata.players.map((player) => [player.seat, player]));
  const rawPlayers = new Map<number, Record<string, any>>();
  for (const rawPlayer of snapshot.activePlayers) {
    const player = asObject(rawPlayer);
    const seat = toSeat(player?.slot_num);
    if (player && seat) rawPlayers.set(seat, player);
  }

  const players = view.players.map((player) => {
    const rawPlayer = rawPlayers.get(player.seat) || {};
    const identity = metadataBySeat.get(player.seat);
    return {
      seat: player.seat,
      playerId: identity?.playerId ? String(identity.playerId) : null,
      nickname: identity?.nickname || player.nickname,
      role: player.role,
      team: player.team,
      alive: player.alive,
      status: player.status,
      statusKind: playerStatusKind(rawPlayer),
      fouls: player.fouls,
      minorTech: player.minorTech,
      majorTech: player.majorTech,
      ppk: player.ppk,
    } satisfies LiveBroadcastPlayer;
  });

  const nominationsMap = asObject(snapshot.nominationsMap) || {};
  const nominations = view.nominations.map((seat, index) => ({
    seat,
    order: index + 1,
    nominatedBy: toSeat(nominationsMap[String(seat)]),
  }));

  const votingRounds = Array.isArray(snapshot.votingRounds) ? snapshot.votingRounds : [];
  const activeRoundIndex = Math.max(0, Number(snapshot.activeVotingRoundIndex || 0));
  const activeRound = asObject(votingRounds[activeRoundIndex]);
  const candidates = (activeRound?.nominated_seats || [])
    .map(toSeat)
    .filter((seat: number | null): seat is number => seat !== null);
  const published = snapshot.phase === 'day_voting' && resultIsPublished(snapshot.votingStage);
  const allowedCandidates = new Set<number>(candidates);
  const resolvedCandidates = published && activeRound
    ? determineVotingResult(activeRound as VotingRound).winners
        .map(toSeat)
        .filter((seat: number | null): seat is number => seat !== null && allowedCandidates.has(seat))
    : [];
  const rawCounts = asObject(activeRound?.vote_counts) || {};
  const counts: Record<number, number> = {};
  if (published) {
    for (const candidate of candidates) {
      counts[candidate] = toNonNegativeInteger(rawCounts[String(candidate)]) ?? 0;
    }
  }

  const vote: LiveBroadcastVote | null = snapshot.phase === 'day_voting' && activeRound
    ? {
        roundNumber: Math.max(1, Number(activeRound.round_number || activeRoundIndex + 1)),
        isRevote: Boolean(activeRound.is_revote),
        candidates,
        highlightedCandidates: resolvedCandidates.length ? resolvedCandidates : candidates,
        published,
        counts,
        assignments: published ? recordSeats(snapshot.votesByPlayer, allowedCandidates) : {},
        outcome: published && activeRound.outcome ? String(activeRound.outcome) : null,
      }
    : null;

  const timerSeconds = toNonNegativeInteger(snapshot.timeLeft);
  const timerMaxSeconds = toNonNegativeInteger(snapshot.timerMax);

  return {
    version: LIVE_BROADCAST_VERSION,
    gameId: Number(metadata.gameId),
    globalGameNumber: Number(metadata.globalGameNumber),
    eveningGameNumber: metadata.eveningGameNumber == null ? null : Number(metadata.eveningGameNumber),
    tableName: metadata.tableName ? String(metadata.tableName) : null,
    phaseKey: String(snapshot.phase || 'setup'),
    phaseTitle: view.phaseTitle,
    phaseDetail: view.phaseDetail,
    roundNumber: view.roundNumber,
    currentSpeakerSeat: view.currentSpeakerSeat,
    timerSeconds,
    timerMaxSeconds,
    timerRunning: Boolean(snapshot.isTimerRunning),
    timerLabel: snapshot.customTimerLabel ? String(snapshot.customTimerLabel) : null,
    players,
    nominations,
    vote,
    // The server replaces this with its receive time. Keeping the field in the
    // client contract makes the public response shape stable and easy to test.
    updatedAt: '',
  };
};
