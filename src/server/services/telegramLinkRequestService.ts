import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { attachExternalIdentity } from './playerOnboardingOrganizerService.ts';

/**
 * «Подтвердить через ВК» (owner, 2026-10-14): a person who signed up through VK opens the bot in Telegram and types their
 * nickname. The bot gives that Telegram account a one-time link; the link opens the app, VK ID proves the VK account, and the
 * Telegram account that asked for the link is attached to the signed-in profile. Both accounts are proven by their owner:
 * Telegram by the chat the link was sent to, VK by VK ID. No nickname and no organizer are involved.
 */
export const TELEGRAM_LINK_REQUEST_TTL_MS = 30 * 60 * 1000;
export const TELEGRAM_LINK_QUERY = 'tglink';
const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
const linkError = (code: string, message: string, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Cuts trailing slashes with a loop (a regular expression on a header-derived value can run slowly on long strings). */
export const stripTrailingSlashes = (value: string) => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
};

export async function ensureTelegramLinkRequestSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS telegram_link_requests (
    code_hash TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_player_id TEXT
  )`);
}

export async function createTelegramLinkRequest(db: DatabaseWrapper, input: { telegramUserId: unknown; baseUrl: string; now?: Date }) {
  await ensureTelegramLinkRequestSchema(db);
  const telegramUserId = String(input.telegramUserId || '').trim();
  if (!/^\d+$/.test(telegramUserId)) throw linkError('telegram_invalid', 'Не удалось определить Telegram', 400);
  const now = input.now || new Date();
  const code = crypto.randomBytes(18).toString('base64url');
  // One live request per Telegram account: a new one replaces the old one.
  await db.run('DELETE FROM telegram_link_requests WHERE telegram_user_id = ? AND used_at IS NULL', [telegramUserId]);
  await db.run(
    'INSERT INTO telegram_link_requests (code_hash, telegram_user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [hash(code), telegramUserId, now.toISOString(), new Date(now.getTime() + TELEGRAM_LINK_REQUEST_TTL_MS).toISOString()],
  );
  return { code, url: `${stripTrailingSlashes(String(input.baseUrl || '').slice(0, 300))}/player?${TELEGRAM_LINK_QUERY}=${encodeURIComponent(code)}`, expires_at: new Date(now.getTime() + TELEGRAM_LINK_REQUEST_TTL_MS).toISOString() };
}

/** The signed-in player (proven by VK ID or any other sign-in) takes the Telegram account that asked for the link. */
export async function redeemTelegramLinkRequest(db: DatabaseWrapper, input: { code: unknown; playerId: string; now?: Date }) {
  await ensureTelegramLinkRequestSchema(db);
  const code = String(input.code || '').trim();
  if (!CODE_PATTERN.test(code)) throw linkError('link_invalid', 'Ссылка недействительна. Откройте бота и запросите её заново.', 400);
  const now = input.now || new Date();
  return db.transaction(async (tx) => {
    const row = await tx.get<any>('SELECT * FROM telegram_link_requests WHERE code_hash = ?', [hash(code)]);
    if (!row) throw linkError('link_invalid', 'Ссылка недействительна. Откройте бота и запросите её заново.', 404);
    if (row.used_at) throw linkError('link_used', 'Эта ссылка уже использована.', 409);
    if (new Date(String(row.expires_at)).getTime() <= now.getTime()) throw linkError('link_expired', 'Ссылка устарела. Откройте бота и запросите её заново.', 410);
    const player = await tx.get<any>('SELECT id, nickname, telegram_user_id FROM players WHERE id = ? LIMIT 1', [input.playerId]);
    if (!player) throw linkError('player_not_found', 'Игрок не найден', 404);
    if (String(player.telegram_user_id || '').trim() && String(player.telegram_user_id) !== String(row.telegram_user_id)) {
      throw linkError('player_telegram_conflict', 'К этому профилю уже привязан другой Telegram', 409);
    }
    const stamp = now.toISOString();
    await attachExternalIdentity(tx, {
      platform: 'telegram', externalUserId: String(row.telegram_user_id), playerId: String(player.id),
      telegramUserIdOnPlayer: player.telegram_user_id ? String(player.telegram_user_id) : null, now: stamp,
    });
    await tx.run('UPDATE telegram_link_requests SET used_at = ?, used_player_id = ? WHERE code_hash = ? AND used_at IS NULL', [stamp, player.id, row.code_hash]);
    return { playerId: String(player.id), nickname: String(player.nickname) };
  });
}
