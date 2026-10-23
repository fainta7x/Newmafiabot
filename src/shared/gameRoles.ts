/** Canonical identity and presentation of the four sporting Mafia roles. No UI dependencies. */
export const GAME_ROLES = {
  citizen: { key: 'citizen', label: 'Мирный', shortLabel: 'Мир', genitive: 'Мирного', team: 'red', icon: 'heart', accent: '#e5384f', foreground: '#e5384f', ink: '#e5384f', standardCount: 6 },
  sheriff: { key: 'sheriff', label: 'Шериф', shortLabel: 'Шер', genitive: 'Шерифа', team: 'red', icon: 'star', accent: '#facc15', foreground: '#facc15', ink: '#0b0b0e', standardCount: 1 },
  mafia: { key: 'mafia', label: 'Мафия', shortLabel: 'Маф', genitive: 'Мафию', team: 'black', icon: 'pistol', accent: '#050506', foreground: '#e2e8f0', ink: '#050506', standardCount: 2 },
  don: { key: 'don', label: 'Дон', shortLabel: 'Дон', genitive: 'Дона', team: 'black', icon: 'hat', accent: '#8b5cf6', foreground: '#a78bfa', ink: '#0b0b0e', standardCount: 1 },
} as const;

export type GameRole = keyof typeof GAME_ROLES;
export const UNKNOWN_GAME_ROLE_LABEL = 'Роль не указана';
export type GameRoleDefinition = typeof GAME_ROLES[GameRole];
export const GAME_ROLE_KEYS = ['citizen', 'sheriff', 'mafia', 'don'] as const;
export const GAME_ROLE_LABELS = Object.fromEntries(GAME_ROLE_KEYS.map(key => [key, GAME_ROLES[key].label])) as Record<GameRole, string>;

/** Strict API keys: a team colour is never enough to infer a player's actual role. */
export function getGameRoleDefinition(role: string | null | undefined): GameRoleDefinition | null {
  return role && Object.hasOwn(GAME_ROLES, role) ? GAME_ROLES[role as GameRole] : null;
}

const gameToken = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

/**
 * Every spelling a stored or typed role may have: API keys, the judge engine's Russian names and legacy aliases.
 * The one place roles are parsed (domain model, 2026-10-22). A team colour is not a role (black may be the don);
 * colours are read only by `gameTeamOfRole`.
 */
const GAME_ROLE_ALIASES: Record<string, GameRole> = {
  citizen: 'citizen', 'мирный': 'citizen', 'мирный житель': 'citizen', 'мирянин': 'citizen',
  sheriff: 'sheriff', 'шериф': 'sheriff',
  mafia: 'mafia', 'мафия': 'mafia', 'маф': 'mafia',
  don: 'don', 'дон': 'don',
};

/** Role key of any stored or typed role spelling; null when it is not a role. */
export function normalizeGameRole(role: unknown): GameRole | null {
  const token = gameToken(role);
  return Object.hasOwn(GAME_ROLE_ALIASES, token) ? GAME_ROLE_ALIASES[token] : null;
}

export type GameTeam = 'red' | 'black';

/** Team of a role in any spelling (red: мирный, шериф; black: мафия, дон), or of a team colour stored instead of a role. */
export function gameTeamOfRole(role: unknown): GameTeam | null {
  const key = normalizeGameRole(role);
  if (key) return GAME_ROLES[key].team;
  const token = gameToken(role);
  if (token === 'red' || token === 'красный') return 'red';
  if (token === 'black' || token === 'черный') return 'black';
  return null;
}

/** Winning team of a stored result in any spelling: `red`/`black`, «Красные»/«Чёрные», «Город»/«Мафия». */
export function normalizeWinnerTeam(value: unknown): GameTeam | null {
  const token = gameToken(value);
  if (['red', 'красные', 'красная', 'город'].includes(token)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(token)) return 'black';
  return null;
}

/** Human-readable team names at UI/result boundaries; engine state uses canonical role/team keys. */
export const ENGINE_TEAM_NAMES = { red: 'Красные', black: 'Чёрные' } as const;
export type EngineRoleName = GameRoleDefinition['label'];

/** The team of a player of the engine or of a protocol: its team label first, else its role. */
export function teamOfPlayer(player: { team?: unknown; role?: unknown } | null | undefined): GameTeam | null {
  return normalizeWinnerTeam(player?.team) ?? gameTeamOfRole(player?.role);
}
