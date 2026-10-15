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

/** Decode role names used by the existing judge engine at the presentation boundary. */
export function normalizeGameRole(role: string | null | undefined): GameRole | null {
  if (!role) return null;
  const value = role.trim().toLowerCase();
  const direct = getGameRoleDefinition(value);
  if (direct) return direct.key;
  return GAME_ROLE_KEYS.find(key => GAME_ROLES[key].label.toLowerCase() === value)
    ?? (value === 'мирный житель' ? 'citizen' : null);
}
