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

/** What happened this night, as the judge records it (owner 2026-10-01: viewers see it at once). */
export type LiveBroadcastNight = {
  shotSeat: number | null;
  donCheck: { seat: number; isSheriff: boolean | null } | null;
  sheriffCheck: { seat: number; isBlack: boolean | null } | null;
};

/** «Лучший ход»: the seats named by the first killed player (or the zero-round voted player). */
export type LiveBroadcastBestMove = {
  bySeat: number | null;
  seats: number[];
};

/**
 * «Ход игры»: one entry per night and per day that changed the table, built from the
 * engine's own game log so it survives a phone reload (owner, 2026-10-01: what happened
 * stays on screen until the end of the game).
 */
export type LiveBroadcastTimelineEntry =
  | {
      kind: 'night';
      round: number;
      /** The night that is still going on: facts are shown as the judge records them. */
      current: boolean;
      shotSeat: number | null;
      killed: boolean;
      donCheck: LiveBroadcastNight['donCheck'];
      sheriffCheck: LiveBroadcastNight['sheriffCheck'];
    }
  | {
      kind: 'day';
      round: number;
      left: number[];
      note: 'voted' | 'table' | 'stay' | 'cancelled' | 'single';
    };

/** A fixed vote of a past day: who voted for whom (the last fixed round of that day). */
export type LiveBroadcastDayVote = {
  round: number;
  assignments: Record<number, number>;
};

/** A killed player's «протокол»: whom they named red, black and sheriff. */
export type LiveBroadcastProtocol = {
  seat: number;
  red: number[];
  black: number[];
  sheriff: number[];
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
  night?: LiveBroadcastNight | null;
  bestMove?: LiveBroadcastBestMove | null;
  timeline?: LiveBroadcastTimelineEntry[];
  dayVotes?: LiveBroadcastDayVote[];
  protocols?: LiveBroadcastProtocol[];
  /** Red and black wins in the evening's finished games; the server fills it in. */
  eveningScore?: { red: number; black: number } | null;
  updatedAt: string;
};

/** Overlay block sizes in percent and visibility, adjusted live from «OBS и трансляция». */
export type LiveBroadcastLayout = {
  top: number;
  timeline: number;
  players: number;
  showTop: boolean;
  showTimeline: boolean;
  showPlayers: boolean;
};

export const LIVE_BROADCAST_LAYOUT_LIMITS = { min: 60, max: 140 } as const;

export const DEFAULT_LIVE_BROADCAST_LAYOUT: LiveBroadcastLayout = {
  top: 100,
  timeline: 100,
  players: 100,
  showTop: true,
  showTimeline: true,
  showPlayers: true,
};

export const normalizeLiveBroadcastLayout = (input: unknown): LiveBroadcastLayout => {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const percent = (value: unknown, fallback: number) => {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(LIVE_BROADCAST_LAYOUT_LIMITS.max, Math.max(LIVE_BROADCAST_LAYOUT_LIMITS.min, number));
  };
  const flag = (value: unknown) => value !== false;
  return {
    top: percent(source.top, DEFAULT_LIVE_BROADCAST_LAYOUT.top),
    timeline: percent(source.timeline, DEFAULT_LIVE_BROADCAST_LAYOUT.timeline),
    players: percent(source.players, DEFAULT_LIVE_BROADCAST_LAYOUT.players),
    showTop: flag(source.showTop),
    showTimeline: flag(source.showTimeline),
    showPlayers: flag(source.showPlayers),
  };
};

export type LiveBroadcastEnvelope = {
  connected: boolean;
  receivedAt: string | null;
  state: LiveBroadcastState | null;
  layout?: LiveBroadcastLayout;
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
 * Produces the small state sent to the OBS bridge. Viewers see the roles, so the
 * current night's shot and checks and the best move are shown as they happen
 * (owner, 2026-10-01). History, notes and pending interactions never leave the
 * phone through this path, and vote choices stay hidden until the judge fixes them.
 */
const seatsIn = (text: string): number[] => [...text.matchAll(/#(\d+)/g)]
  .map((match) => Number(match[1]))
  .filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10);

/** Reads the engine's game log lines («Н2: выстрел в #4 — убит. Дон: #7 — Шериф. …»). */
/**
 * The engine forgets a day's votes when the next day starts, so the judge's device keeps
 * each day's last fixed vote: the stream shows by whose hands a player left.
 */
export const mergeBroadcastDayVotes = (
  previous: LiveBroadcastDayVote[],
  state: Pick<LiveBroadcastState, 'roundNumber' | 'vote'>,
): LiveBroadcastDayVote[] => {
  if (!state.vote?.published || !Object.keys(state.vote.assignments).length) return previous;
  return [
    ...previous.filter((vote) => vote.round !== state.roundNumber),
    { round: state.roundNumber, assignments: { ...state.vote.assignments } },
  ].sort((left, right) => left.round - right.round);
};

export const parseBroadcastTimeline = (rawLogs: unknown): LiveBroadcastTimelineEntry[] => {
  const entries: LiveBroadcastTimelineEntry[] = [];
  for (const raw of Array.isArray(rawLogs) ? rawLogs : []) {
    const text = String((raw as any)?.log || '');
    const night = /^Н(\d+):/.exec(text);
    if (night) {
      const shot = /выстрел в #(\d+) — (убит|промах)/.exec(text);
      const don = /Дон: #(\d+) — (не )?Шериф/.exec(text);
      const sheriff = /Шериф: #(\d+) — ([^.]*)/.exec(text);
      entries.push({
        kind: 'night',
        round: Number(night[1]),
        current: false,
        shotSeat: shot ? Number(shot[1]) : null,
        killed: shot?.[2] === 'убит',
        donCheck: don ? { seat: Number(don[1]), isSheriff: !don[2] } : null,
        sheriffCheck: sheriff
          ? { seat: Number(sheriff[1]), isBlack: /ч[её]рн/i.test(sheriff[2]) ? true : /красн/i.test(sheriff[2]) ? false : null }
          : null,
      });
      continue;
    }
    const day = /^Д(\d+):/.exec(text);
    if (!day) continue;
    const round = Number(day[1]);
    if (/отменено/.test(text)) entries.push({ kind: 'day', round, left: [], note: 'cancelled' });
    else if (/одна кандидатура/.test(text)) entries.push({ kind: 'day', round, left: [], note: 'single' });
    else if (/заголосован игрок/.test(text)) entries.push({ kind: 'day', round, left: seatsIn(text.split(';')[0]), note: 'voted' });
    else if (/спорные/.test(text)) entries.push({ kind: 'day', round, left: seatsIn(text.split('заголосованы')[0]), note: 'table' });
    else if (/все остаются|никто не покидает/.test(text)) entries.push({ kind: 'day', round, left: [], note: 'stay' });
  }
  return entries;
};

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

  // The engine clears these marks when a night starts and when the day starts, so they
  // describe the current night only.
  const phaseKey = String(snapshot.phase || 'setup');
  const shotSeat = toSeat(snapshot.shotPlayerSlot);
  const donSeat = toSeat(snapshot.donCheckSlot);
  const sheriffSeat = toSeat(snapshot.sheriffCheckSlot);
  const night: LiveBroadcastNight | null = phaseKey === 'night' && (shotSeat || donSeat || sheriffSeat)
    ? {
        shotSeat,
        donCheck: donSeat ? { seat: donSeat, isSheriff: typeof snapshot.donCheckResult === 'boolean' ? snapshot.donCheckResult : null } : null,
        sheriffCheck: sheriffSeat
          ? { seat: sheriffSeat, isBlack: snapshot.sheriffCheckResult ? /ч[её]рн/i.test(String(snapshot.sheriffCheckResult)) : null }
          : null,
      }
    : null;

  const markers = asObject(snapshot.protocolMarkers) || {};
  const bestMoveSeats = (Array.isArray(markers.bestMoveSeats) ? markers.bestMoveSeats : [])
    .map(toSeat)
    .filter((seat: number | null): seat is number => seat !== null);
  const bestMove: LiveBroadcastBestMove | null = bestMoveSeats.length
    ? {
        bySeat: markers.bestMoveSource === 'zero_round_voted' ? toSeat(markers.zeroRoundVotedSlot) : toSeat(markers.firstKilledSlot),
        seats: bestMoveSeats,
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
    phaseKey,
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
    night,
    bestMove,
    timeline: night
      ? [...parseBroadcastTimeline(snapshot.nightLogs), { kind: 'night', round: view.roundNumber, current: true, shotSeat: night.shotSeat, killed: false, donCheck: night.donCheck, sheriffCheck: night.sheriffCheck }]
      : parseBroadcastTimeline(snapshot.nightLogs),
    // The server replaces this with its receive time. Keeping the field in the
    // client contract makes the public response shape stable and easy to test.
    updatedAt: '',
  };
};
