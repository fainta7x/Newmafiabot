/** How a player left a game and why a removal happened: one list for the engine, both protocols and the CRM (domain model, 2026-10-22). */
export const GAME_EXIT_TYPES = ['alive', 'killed', 'voted_zero_round', 'voted_day', 'removed'] as const;
export type GameExitType = typeof GAME_EXIT_TYPES[number];

/** 4th_foul — the fourth regular foul; 2nd_tech — the second technical foul; direct — removed by the judge. */
export const REMOVAL_REASONS = ['4th_foul', '2nd_tech', 'direct'] as const;
export type RemovalReason = typeof REMOVAL_REASONS[number];

export const isGameExitType = (value: unknown): value is GameExitType => (GAME_EXIT_TYPES as readonly unknown[]).includes(value);
export const isRemovalReason = (value: unknown): value is RemovalReason => (REMOVAL_REASONS as readonly unknown[]).includes(value);
