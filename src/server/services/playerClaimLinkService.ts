import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { attachExternalIdentity, type OrganizerOnboardingPlatform } from './playerOnboardingOrganizerService.ts';

/**
 * «Ссылка для привязки» (owner, 2026-09-30): the organizer creates a profile and sends the player a personal
 * one-time link. Opening it in Telegram (bot /start claim_<code>) or signing in through VK with it links that
 * account to the profile at once — the organizer's link is the proof, so no nickname and no approval are needed.
 */
export const CLAIM_LINK_TTL_DAYS = 14;
export const CLAIM_START_PREFIX = 'claim_';
const DAY_MS = 86_400_000;
const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
const claimError = (code: string, message: string, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
// Telegram /start payloads allow only [A-Za-z0-9_-] up to 64 characters.
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,40}$/;

export async function ensurePlayerClaimLinkSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS player_claim_links (
    code_hash TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_by TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_platform TEXT,
    used_external_user_id TEXT
  )`);
}

let cachedBotUsername: string | null | undefined;
/** The bot's @username for t.me links (Telegram getMe), remembered after the first success. */
export async function telegramBotUsername(fetcher: typeof fetch = fetch): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  const configured = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  if (configured) return (cachedBotUsername = configured);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/getMe`);
    const body: any = await response.json().catch(() => null);
    const username = body?.ok && body?.result?.username ? String(body.result.username) : null;
    if (username) cachedBotUsername = username;
    return username;
  } catch {
    return null;
  }
}

export async function createPlayerClaimLink(db: DatabaseWrapper, input: { playerId: string; actorId?: string | null; baseUrl: string; now?: Date }) {
  await ensurePlayerClaimLinkSchema(db);
  const player = await db.get<any>('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [input.playerId]);
  if (!player) throw claimError('player_not_found', 'Игрок не найден', 404);
  const now = input.now || new Date();
  const code = crypto.randomBytes(18).toString('base64url');
  const expiresAt = new Date(now.getTime() + CLAIM_LINK_TTL_DAYS * DAY_MS).toISOString();
  // One live link per profile: a new link replaces the old one.
  await db.run('DELETE FROM player_claim_links WHERE player_id = ? AND used_at IS NULL', [player.id]);
  await db.run(
    'INSERT INTO player_claim_links (code_hash, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [hash(code), player.id, input.actorId || null, now.toISOString(), expiresAt],
  );
  const bot = await telegramBotUsername();
  return {
    code,
    nickname: String(player.nickname),
    expires_at: expiresAt,
    telegram_url: bot ? `https://t.me/${bot}?start=${CLAIM_START_PREFIX}${code}` : null,
    web_url: `${input.baseUrl.replace(/\/+$/, '')}/player?claim=${encodeURIComponent(code)}`,
  };
}

async function loadLiveClaim(db: DatabaseWrapper, codeInput: unknown, now: Date) {
  await ensurePlayerClaimLinkSchema(db);
  const code = String(codeInput || '').trim();
  if (!CODE_PATTERN.test(code)) throw claimError('claim_invalid', 'Ссылка для привязки неверная', 404);
  const row = await db.get<any>(
    `SELECT l.code_hash, l.player_id, l.expires_at, l.used_at, p.nickname
       FROM player_claim_links l JOIN players p ON p.id = l.player_id
      WHERE l.code_hash = ? LIMIT 1`,
    [hash(code)],
  );
  if (!row) throw claimError('claim_invalid', 'Ссылка для привязки неверная или заменена новой — попросите у организатора новую', 404);
  if (row.used_at) throw claimError('claim_used', 'Эта ссылка уже использована — попросите у организатора новую', 410);
  if (new Date(row.expires_at).getTime() <= now.getTime()) throw claimError('claim_expired', 'Срок ссылки истёк — попросите у организатора новую', 410);
  return row;
}

/** Whose profile the link opens; safe to show before sign-in. */
export async function previewPlayerClaimLink(db: DatabaseWrapper, code: unknown, now = new Date()) {
  const row = await loadLiveClaim(db, code, now);
  return { nickname: String(row.nickname) };
}

/** Links the verified account to the profile and spends the link. Returns the player id. */
export async function redeemPlayerClaimLink(db: DatabaseWrapper, input: {
  code: unknown; platform: OrganizerOnboardingPlatform; externalUserId: string; now?: Date;
}) {
  const now = input.now || new Date();
  const externalUserId = String(input.externalUserId || '').trim();
  if (!/^\d+$/.test(externalUserId)) throw claimError('external_identity_invalid', 'Не удалось определить аккаунт', 400);
  return db.transaction(async (tx) => {
    const row = await loadLiveClaim(tx, input.code, now);
    const player = await tx.get<any>('SELECT id, nickname, telegram_user_id FROM players WHERE id = ? LIMIT 1', [row.player_id]);
    if (!player) throw claimError('player_not_found', 'Игрок не найден', 404);
    const stamp = now.toISOString();
    await attachExternalIdentity(tx, {
      platform: input.platform, externalUserId, playerId: String(player.id),
      telegramUserIdOnPlayer: player.telegram_user_id ? String(player.telegram_user_id) : null, now: stamp,
    });
    await tx.run(
      'UPDATE player_claim_links SET used_at = ?, used_platform = ?, used_external_user_id = ? WHERE code_hash = ? AND used_at IS NULL',
      [stamp, input.platform, externalUserId, row.code_hash],
    );
    return { playerId: String(player.id), nickname: String(player.nickname) };
  });
}
