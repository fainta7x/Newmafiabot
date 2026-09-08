import type { DatabaseWrapper } from '../../db/index.ts';

const ensured = new WeakSet<object>();

export type PlayerProfileVisibility = {
  real_name: boolean;
  birthday_day_month: boolean;
  birth_year: boolean;
  telegram_username: boolean;
  phone: boolean;
  game_statistics: boolean;
  connections: boolean;
};

export const DEFAULT_PLAYER_PROFILE_VISIBILITY: PlayerProfileVisibility = {
  real_name: false,
  birthday_day_month: false,
  birth_year: false,
  telegram_username: false,
  phone: false,
  game_statistics: true,
  connections: true,
};

export const parsePlayerProfileVisibility = (raw: unknown): PlayerProfileVisibility => {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(String(raw || '{}')); } catch { value = {}; }
  return {
    real_name: value.real_name === true,
    birthday_day_month: value.birthday_day_month === true,
    birth_year: value.birth_year === true,
    telegram_username: value.telegram_username === true,
    phone: value.phone === true,
    game_statistics: value.game_statistics !== false,
    connections: value.connections !== false,
  };
};

export async function ensurePlayerProfileVisibilitySchema(db: DatabaseWrapper | any) {
  if (ensured.has(db as object)) return;
  try {
    await db.run("ALTER TABLE players ADD COLUMN profile_visibility_json TEXT NOT NULL DEFAULT '{}'");
  } catch (error: any) {
    const message = String(error?.message || error || '').toLowerCase();
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error;
  }
  ensured.add(db as object);
}
