import { createHmac, timingSafeEqual } from 'crypto';
import type { LiveBroadcastEnvelope, LiveBroadcastState } from '../../lib/liveBroadcast.ts';

export type CanonicalBroadcastGame = {
  gameId: number;
  globalGameNumber: number;
  eveningGameNumber: number;
  tableName: string | null;
  players: Array<{
    seat: number;
    playerId: string | null;
    nickname: string;
  }>;
};

type StoredBroadcast = {
  receivedAtMs: number;
  state: LiveBroadcastState;
};

const CHANNEL_PURPOSE = '2la-noire:live-broadcast:v1:main';
const CONNECTED_WINDOW_MS = 12_000;
let currentBroadcast: StoredBroadcast | null = null;

const signingSecret = () => (
  process.env.LIVE_BROADCAST_SECRET
  || process.env.JWT_SECRET
  || 'dev-only-jwt-secret-key-for-local-testing'
);

export const getLiveBroadcastToken = (): string => (
  createHmac('sha256', signingSecret()).update(CHANNEL_PURPOSE).digest('base64url')
);

export const isValidLiveBroadcastToken = (candidate: string): boolean => {
  const expected = Buffer.from(getLiveBroadcastToken());
  const actual = Buffer.from(String(candidate || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const finiteInteger = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};

const boundedText = (value: unknown, fallback: string, maxLength = 120): string => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
};

const toSeat = (value: unknown): number | null => {
  const seat = Number(value);
  return Number.isInteger(seat) && seat >= 1 && seat <= 10 ? seat : null;
};

const sanitizeSeatRecord = (
  value: unknown,
  validTargets: Set<number>,
  valueKind: 'seat' | 'count',
): Record<number, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<number, number> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = toSeat(rawKey);
    if (!key) continue;
    if (valueKind === 'seat') {
      const target = toSeat(rawValue);
      if (target && validTargets.has(target)) result[key] = target;
    } else if (validTargets.has(key)) {
      result[key] = Math.max(0, finiteInteger(rawValue));
    }
  }
  return result;
};

/**
 * Treat the phone payload as untrusted even though publishing is authenticated.
 * Dynamic game facts are accepted by seat; player identity and game numbering
 * are always replaced with canonical database values.
 */
export const normalizeLiveBroadcastState = (
  input: unknown,
  game: CanonicalBroadcastGame,
  receivedAt = new Date(),
): LiveBroadcastState | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, any>;
  if (Number(source.version) !== 1 || !Array.isArray(source.players)) return null;

  const submittedPlayers = new Map<number, Record<string, any>>();
  for (const value of source.players) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const player = value as Record<string, any>;
    const seat = toSeat(player.seat);
    if (seat && !submittedPlayers.has(seat)) submittedPlayers.set(seat, player);
  }
  if (submittedPlayers.size !== 10 || game.players.length !== 10) return null;

  const allowedStatusKinds = new Set(['alive', 'killed', 'voted', 'removed', 'ppk', 'out']);
  const players = game.players
    .slice()
    .sort((left, right) => left.seat - right.seat)
    .map((canonical) => {
      const submitted = submittedPlayers.get(canonical.seat)!;
      const alive = submitted.alive !== false;
      const rawStatusKind = String(submitted.statusKind || 'out');
      const statusKind = alive
        ? 'alive'
        : allowedStatusKinds.has(rawStatusKind) ? rawStatusKind : 'out';
      return {
        seat: canonical.seat,
        playerId: canonical.playerId,
        nickname: boundedText(canonical.nickname, `Игрок ${canonical.seat}`, 80),
        role: boundedText(submitted.role, '—', 24),
        team: boundedText(submitted.team, '—', 24),
        alive,
        status: boundedText(submitted.status, alive ? 'В игре' : 'Покинул стол', 100),
        statusKind: statusKind as LiveBroadcastState['players'][number]['statusKind'],
        fouls: Math.max(0, finiteInteger(submitted.fouls)),
        minorTech: Math.max(0, finiteInteger(submitted.minorTech)),
        majorTech: Math.max(0, finiteInteger(submitted.majorTech)),
        ppk: Boolean(submitted.ppk),
      };
    });

  const nominations = Array.isArray(source.nominations)
    ? source.nominations
        .map((value: any) => {
          const seat = toSeat(value?.seat);
          if (!seat) return null;
          return {
            seat,
            order: Math.max(1, finiteInteger(value?.order, 1)),
            nominatedBy: toSeat(value?.nominatedBy),
          };
        })
        .filter(Boolean)
        .slice(0, 10)
    : [];

  let vote: LiveBroadcastState['vote'] = null;
  if (source.vote && typeof source.vote === 'object' && !Array.isArray(source.vote)) {
    const candidates = Array.isArray(source.vote.candidates)
      ? source.vote.candidates.map(toSeat).filter((seat: number | null): seat is number => seat !== null).slice(0, 10)
      : [];
    const targets = new Set<number>(candidates);
    const published = source.vote.published === true;
    vote = {
      roundNumber: Math.max(1, finiteInteger(source.vote.roundNumber, 1)),
      isRevote: Boolean(source.vote.isRevote),
      candidates,
      published,
      counts: published ? sanitizeSeatRecord(source.vote.counts, targets, 'count') : {},
      assignments: published ? sanitizeSeatRecord(source.vote.assignments, targets, 'seat') : {},
      outcome: published && source.vote.outcome ? boundedText(source.vote.outcome, '', 40) : null,
    };
  }

  const timerSeconds = source.timerSeconds == null ? null : Math.max(0, finiteInteger(source.timerSeconds));
  const timerMaxSeconds = source.timerMaxSeconds == null ? null : Math.max(0, finiteInteger(source.timerMaxSeconds));

  return {
    version: 1,
    gameId: game.gameId,
    globalGameNumber: game.globalGameNumber,
    eveningGameNumber: game.eveningGameNumber,
    tableName: game.tableName,
    phaseKey: boundedText(source.phaseKey, 'setup', 32),
    phaseTitle: boundedText(source.phaseTitle, 'Игра в процессе', 80),
    phaseDetail: boundedText(source.phaseDetail, 'Игра в процессе', 120),
    roundNumber: Math.max(1, finiteInteger(source.roundNumber, 1)),
    currentSpeakerSeat: toSeat(source.currentSpeakerSeat),
    timerSeconds,
    timerMaxSeconds,
    timerRunning: Boolean(source.timerRunning),
    timerLabel: source.timerLabel ? boundedText(source.timerLabel, '', 100) : null,
    players,
    nominations: nominations as LiveBroadcastState['nominations'],
    vote,
    updatedAt: receivedAt.toISOString(),
  };
};

export const publishLiveBroadcastState = (state: LiveBroadcastState, now = Date.now()): void => {
  currentBroadcast = { state, receivedAtMs: now };
};

export const readLiveBroadcastEnvelope = (now = Date.now()): LiveBroadcastEnvelope => ({
  connected: Boolean(currentBroadcast && now - currentBroadcast.receivedAtMs <= CONNECTED_WINDOW_MS),
  receivedAt: currentBroadcast ? new Date(currentBroadcast.receivedAtMs).toISOString() : null,
  state: currentBroadcast?.state || null,
});

export const resetLiveBroadcastForTests = (): void => {
  currentBroadcast = null;
};
