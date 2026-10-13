/**
 * One rule for «новичок» (owner, 2026-10-13): the organizer's own level decides, not visit counting.
 * A player is a novice while the level is «Новичок» or not set yet («unrated»). Once the organizer sets «Клубный» or
 * «Турнирный», no novice task, filter or queue may pick the player up, however few visits they have in the app.
 */
export const NOVICE_LEVELS = ['novice', 'unrated'] as const;
export const isNoviceLevel = (level: unknown) => (NOVICE_LEVELS as readonly string[]).includes(String(level || 'unrated').trim().toLowerCase() || 'unrated');

/** SQL: the player row `alias` is a novice by level (a missing level counts as not set). */
export const noviceLevelSql = (alias = 'p') => `COALESCE(NULLIF(${alias}.game_level, ''), 'unrated') IN ('novice', 'unrated')`;
/** SQL: the player row `alias` was given a club-level or tournament-level status by the organizer. */
export const decidedAboveNoviceSql = (alias = 'p') => `COALESCE(NULLIF(${alias}.game_level, ''), 'unrated') IN ('club', 'tournament')`;
