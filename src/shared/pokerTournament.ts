/**
 * Poker MTT rules that need no database (owner, 2026-10-10): the turbo blind schedule, the tournament clock,
 * the flexible settings with their limits, and balanced table planning for any number of players.
 * The tournament chips are nominal: they are never cashed out, only places pay (in club tokens).
 */
export type PokerBlindLevel = { small: number; big: number };

export type PokerTournamentConfig = {
  startAt: string;
  minPlayers: number;
  /** null = no upper limit on registrations */
  maxPlayers: number | null;
  startingStack: number;
  levelMinutes: number;
  levels: PokerBlindLevel[];
  /** A busted player may buy back in until this level ends (0 = no re-buy). */
  rebuyUntilLevel: number;
  /** A new player may still enter the running tournament until this level ends (0 or missing = registration closes at the start). */
  lateRegUntilLevel?: number;
  rebuyCostTokens: number;
  rebuyChips: number;
  seatsPerTable: number;
  /** Club tokens paid for places 1, 2, 3… */
  prizeTokens: number[];
};

export const POKER_TOURNAMENT_MAX_SEATS = 8; // the table engine seats at most eight
export const POKER_TOURNAMENT_DEFAULT_MIN_PLAYERS = 4;

/** Turbo schedule: the first level is the cash-game 10/20, every level raises the blinds by roughly half. */
export const TURBO_BLIND_LEVELS: PokerBlindLevel[] = [
  [10, 20], [15, 30], [20, 40], [30, 60], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
  [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000],
].map(([small, big]) => ({ small, big }));

export const DEFAULT_TURBO_SETTINGS = {
  minPlayers: POKER_TOURNAMENT_DEFAULT_MIN_PLAYERS,
  maxPlayers: null as number | null,
  startingStack: 1000,
  levelMinutes: 6,
  rebuyUntilLevel: 6,
  rebuyCostTokens: 1000,
  rebuyChips: 1000,
  lateRegUntilLevel: 6,
  seatsPerTable: 6,
  prizeTokens: [] as number[],
};

const whole = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

export type PokerTournamentConfigResult = { ok: true; config: PokerTournamentConfig } | { ok: false; error: string };

/** Validates organizer input against the defaults. Unknown or missing fields fall back to the turbo defaults. */
export function normalizePokerTournamentConfig(input: Record<string, unknown>, nowMs = Date.now()): PokerTournamentConfigResult {
  const startMs = Date.parse(String(input.startAt ?? input.start_at ?? ''));
  if (!Number.isFinite(startMs)) return { ok: false, error: 'Укажите время начала турнира' };
  if (startMs < nowMs - 60_000) return { ok: false, error: 'Время начала уже прошло' };

  const pick = (camel: keyof typeof DEFAULT_TURBO_SETTINGS, snake: string) => {
    const raw = input[camel] ?? input[snake];
    return raw === undefined || raw === null || raw === '' ? undefined : raw;
  };
  const int = (camel: keyof typeof DEFAULT_TURBO_SETTINGS, snake: string, label: string, min: number, max: number) => {
    const raw = pick(camel, snake);
    if (raw === undefined) return { value: DEFAULT_TURBO_SETTINGS[camel] as number };
    const value = whole(raw);
    if (value === null || value < min || value > max) return { error: `${label}: от ${min} до ${max}` };
    return { value };
  };

  const minPlayers = int('minPlayers', 'min_players', 'Минимум участников', 2, 200);
  const startingStack = int('startingStack', 'starting_stack', 'Стартовый стек', 100, 1_000_000);
  const levelMinutes = int('levelMinutes', 'level_minutes', 'Длина уровня (минут)', 1, 60);
  const rebuyUntilLevel = int('rebuyUntilLevel', 'rebuy_until_level', 'Докупка до уровня', 0, TURBO_BLIND_LEVELS.length);
  const lateRegUntilLevel = int('lateRegUntilLevel', 'late_reg_until_level', 'Поздняя запись до уровня', 0, TURBO_BLIND_LEVELS.length);
  const rebuyCostTokens = int('rebuyCostTokens', 'rebuy_cost_tokens', 'Цена докупки (жетоны)', 0, 1_000_000);
  const rebuyChips = int('rebuyChips', 'rebuy_chips', 'Фишки за докупку', 100, 1_000_000);
  const seatsPerTable = int('seatsPerTable', 'seats_per_table', 'Мест за столом', 2, POKER_TOURNAMENT_MAX_SEATS);
  for (const part of [minPlayers, startingStack, levelMinutes, rebuyUntilLevel, lateRegUntilLevel, rebuyCostTokens, rebuyChips, seatsPerTable]) {
    if ('error' in part && part.error) return { ok: false, error: part.error };
  }

  let maxPlayers: number | null = null;
  const rawMax = pick('maxPlayers', 'max_players');
  if (rawMax !== undefined) {
    const value = whole(rawMax);
    if (value === null || value < (minPlayers as { value: number }).value || value > 1000) return { ok: false, error: 'Максимум участников не меньше минимума и не больше 1000' };
    maxPlayers = value;
  }

  const rawPrizes = input.prizeTokens ?? input.prize_tokens ?? [];
  if (!Array.isArray(rawPrizes) || rawPrizes.length > 10) return { ok: false, error: 'Призы: до 10 призовых мест' };
  const prizeTokens = rawPrizes.map((entry) => whole(entry));
  if (prizeTokens.some((entry) => entry === null || entry < 0 || entry > 10_000_000)) return { ok: false, error: 'Призы — целые неотрицательные суммы жетонов' };

  return {
    ok: true,
    config: {
      startAt: new Date(startMs).toISOString(),
      minPlayers: (minPlayers as { value: number }).value,
      maxPlayers,
      startingStack: (startingStack as { value: number }).value,
      levelMinutes: (levelMinutes as { value: number }).value,
      levels: TURBO_BLIND_LEVELS.map((level) => ({ ...level })),
      rebuyUntilLevel: (rebuyUntilLevel as { value: number }).value,
      lateRegUntilLevel: (lateRegUntilLevel as { value: number }).value,
      rebuyCostTokens: (rebuyCostTokens as { value: number }).value,
      rebuyChips: (rebuyChips as { value: number }).value,
      seatsPerTable: (seatsPerTable as { value: number }).value,
      prizeTokens: prizeTokens as number[],
    },
  };
}

export type PokerTournamentClock = {
  /** 1-based; stays on the last level once the schedule runs out */
  level: number;
  small: number;
  big: number;
  secondsToNextLevel: number | null;
  isLastLevel: boolean;
  /** 1-based count of levels that have passed, NOT clamped: the blinds stop at the last level, the count goes on. */
  elapsedLevel: number;
};

export function pokerTournamentClock(config: Pick<PokerTournamentConfig, 'levels' | 'levelMinutes'>, startedAtMs: number, nowMs: number): PokerTournamentClock {
  const levelMs = config.levelMinutes * 60_000;
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const elapsedIndex = Math.floor(elapsed / levelMs);
  const index = Math.min(config.levels.length - 1, elapsedIndex);
  const isLastLevel = index >= config.levels.length - 1;
  const { small, big } = config.levels[index];
  return {
    level: index + 1,
    small,
    big,
    secondsToNextLevel: isLastLevel ? null : Math.max(0, Math.ceil(((index + 1) * levelMs - elapsed) / 1000)),
    isLastLevel,
    elapsedLevel: elapsedIndex + 1,
  };
}

/** A busted player may re-buy until the chosen level ends. It counts elapsed levels, so even a cutoff at the last blind level expires. */
export const pokerTournamentRebuyOpen = (config: Pick<PokerTournamentConfig, 'rebuyUntilLevel'>, clock: Pick<PokerTournamentClock, 'elapsedLevel'>): boolean =>
  config.rebuyUntilLevel > 0 && clock.elapsedLevel <= config.rebuyUntilLevel;

/** A new player may still enter a running tournament until the chosen level ends. Tournaments saved before this setting existed never allow it. */
export const pokerTournamentLateRegOpen = (config: Pick<PokerTournamentConfig, 'lateRegUntilLevel'>, clock: Pick<PokerTournamentClock, 'elapsedLevel'>): boolean =>
  (config.lateRegUntilLevel ?? 0) > 0 && clock.elapsedLevel <= (config.lateRegUntilLevel ?? 0);

export type PokerTournamentScheduleRow = {
  level: number;
  small: number;
  big: number;
  /** Minutes from the start of the tournament to the start of this level. */
  startMinute: number;
  /** The same moment as a clock time (ISO), when the tournament start is known. */
  startsAt: string | null;
  /** The stack the tournament starts with, in big blinds at this level. */
  startingStackBb: number;
  lateRegOpen: boolean;
  rebuyOpen: boolean;
};

/**
 * The table of levels: when each one starts and what is still possible then (owner, 2026-10-11: «табличка, чтобы было
 * понимание, насколько времени пройдёт»). The times are exact for the blind clock; how long the tournament lasts
 * depends on the players and is not promised here.
 */
export function pokerTournamentSchedule(
  config: Pick<PokerTournamentConfig, 'levels' | 'levelMinutes' | 'startingStack' | 'rebuyUntilLevel' | 'lateRegUntilLevel'>,
  startAtMs: number | null = null,
): PokerTournamentScheduleRow[] {
  return config.levels.map((blinds, index) => ({
    level: index + 1,
    small: blinds.small,
    big: blinds.big,
    startMinute: index * config.levelMinutes,
    startsAt: startAtMs !== null && Number.isFinite(startAtMs) ? new Date(startAtMs + index * config.levelMinutes * 60_000).toISOString() : null,
    startingStackBb: Math.round((config.startingStack / blinds.big) * 10) / 10,
    lateRegOpen: (config.lateRegUntilLevel ?? 0) > 0 && index + 1 <= (config.lateRegUntilLevel ?? 0),
    rebuyOpen: config.rebuyUntilLevel > 0 && index + 1 <= config.rebuyUntilLevel,
  }));
}

/**
 * Table sizes for `players` people at tables of at most `seatsPerTable`: as few tables as possible, filled evenly
 * (10 players, 6 seats -> 5 + 5; 20 -> 4 tables of 5; 4 -> one table of 4). Larger tables first.
 */
export function planPokerTournamentTables(players: number, seatsPerTable: number): number[] {
  if (players <= 0) return [];
  const seats = Math.max(2, Math.min(POKER_TOURNAMENT_MAX_SEATS, Math.trunc(seatsPerTable) || 2));
  const tables = Math.ceil(players / seats);
  const base = Math.floor(players / tables);
  const extra = players % tables;
  return Array.from({ length: tables }, (_, index) => base + (index < extra ? 1 : 0));
}
