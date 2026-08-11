import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureInviteAudienceSchema } from '../../db/ensureInviteAudienceSchema.ts';

export class PlayerRegistrationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PlayerRegistrationError';
    this.code = code;
    this.status = status;
  }
}

export type RegisteredPlayer = {
  id: string;
  nickname: string;
  full_name: string | null;
  telegram_user_id: string | null;
  telegram_username: string | null;
  game_level: string;
  judge_level: string;
  elo: number;
  elo_seed: number;
  tokens: number;
};

const normalizeNickname = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');
const compareNickname = (value: unknown) => normalizeNickname(value).toLocaleLowerCase('ru-RU');
const normalizeUsername = (value: unknown) => String(value ?? '').trim().replace(/^@/, '').slice(0, 64) || null;
const normalizeFullName = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) || null;

const selectPlayer = async (db: DatabaseWrapper, playerId: string): Promise<RegisteredPlayer> => {
  const player = await db.get<any>(
    `SELECT id, nickname, full_name, telegram_user_id, telegram_username,
            game_level, judge_level, elo, elo_seed, tokens
       FROM players
      WHERE id = ?
      LIMIT 1`,
    [playerId],
  );
  if (!player) throw new Error('Созданный профиль игрока не найден');
  return {
    id: String(player.id),
    nickname: String(player.nickname),
    full_name: player.full_name ?? null,
    telegram_user_id: player.telegram_user_id == null ? null : String(player.telegram_user_id),
    telegram_username: player.telegram_username ?? null,
    game_level: String(player.game_level || 'novice'),
    judge_level: String(player.judge_level || 'none'),
    elo: Number(player.elo || 1000),
    elo_seed: Number(player.elo_seed || 1000),
    tokens: Number(player.tokens || 0),
  };
};

export async function getPlayerByTelegramId(db: DatabaseWrapper, telegramUserId: string | number) {
  const id = String(telegramUserId ?? '').trim();
  if (!id) return null;
  const row = await db.get<{ id: string }>('SELECT id FROM players WHERE telegram_user_id = ? LIMIT 1', [id]);
  return row ? selectPlayer(db, String(row.id)) : null;
}

export async function findPlayersByNickname(db: DatabaseWrapper, nickname: string) {
  const target = compareNickname(nickname);
  if (!target) return [] as RegisteredPlayer[];
  const rows = await db.all<any>(
    `SELECT id, nickname
       FROM players
      WHERE TRIM(COALESCE(nickname, '')) <> ''
      ORDER BY created_at ASC, id ASC`,
  );
  const matches = rows.filter((row: any) => compareNickname(row.nickname) === target);
  return Promise.all(matches.map((row: any) => selectPlayer(db, String(row.id))));
}

export async function registerNewPlayer(
  db: DatabaseWrapper,
  input: {
    telegramUserId: string | number;
    telegramUsername?: string | null;
    fullName?: string | null;
    nickname: string;
    source?: string;
  },
): Promise<{ created: boolean; player: RegisteredPlayer }> {
  // Registration is also used directly by bot/service tests and maintenance paths,
  // so it must not depend on createApp having already added the access column.
  await ensureInviteAudienceSchema(db);

  const telegramUserId = String(input.telegramUserId ?? '').trim();
  if (!/^\d+$/.test(telegramUserId)) {
    throw new PlayerRegistrationError('invalid_telegram', 'Некорректный Telegram ID');
  }

  const alreadyLinked = await getPlayerByTelegramId(db, telegramUserId);
  if (alreadyLinked) return { created: false, player: alreadyLinked };

  const nickname = normalizeNickname(input.nickname);
  if (!nickname) throw new PlayerRegistrationError('nickname_required', 'Введите игровой ник');
  if (nickname.length > 60) throw new PlayerRegistrationError('nickname_too_long', 'Игровой ник не должен быть длиннее 60 символов');
  if (/[\u0000-\u001f\u007f]/.test(nickname)) {
    throw new PlayerRegistrationError('nickname_invalid', 'Игровой ник содержит недопустимые символы');
  }

  const matches = await findPlayersByNickname(db, nickname);
  if (matches.length > 0) {
    throw new PlayerRegistrationError(
      'nickname_taken',
      'Игрок с таким ником уже есть в клубе. Если это ваш старый профиль, его нужно привязать, а не создавать заново.',
      409,
    );
  }

  const now = new Date().toISOString();
  const playerId = crypto.randomUUID();
  const telegramUsername = normalizeUsername(input.telegramUsername);
  const fullName = normalizeFullName(input.fullName);

  await db.run(
    `INSERT INTO players (
      id, telegram_user_id, nickname, full_name, telegram_username,
      phone, contact_status, lifecycle_status, source, notes,
      game_level, judge_level, elo, elo_seed, elo_seed_reason, elo_seed_set_at,
      tokens, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 'normal', 'normal', ?, NULL, 'novice', 'none', 1000, 1000, ?, ?, 0, ?, ?)`,
    [
      playerId,
      telegramUserId,
      nickname,
      fullName,
      telegramUsername,
      input.source || 'telegram_self_registration',
      'Новый игрок',
      now,
      now,
      now,
    ],
  );

  return { created: true, player: await selectPlayer(db, playerId) };
}