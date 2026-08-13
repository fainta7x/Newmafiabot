import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { findPlayersByNickname } from './playerRegistrationService.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';

const CLAIM_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_COUNT = 3;

const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

type ClaimRow = {
  token_hash: string;
  vk_user_id: string;
  player_id: string;
  evening_id: string;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  nickname?: string;
  title?: string;
};

const claimError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

const sendTelegramConfirmation = async (input: {
  telegramUserId: string;
  nickname: string;
  eveningTitle: string;
  confirmationUrl: string;
}) => {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!botToken) {
    throw claimError('Подтверждение через MafiaBot сейчас не настроено. Попросите организатора привязать VK.', 503, 'telegram_unavailable');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.telegramUserId,
      text: [
        '🔗 Подтверждение профиля 2LA Noire',
        '',
        `VK просит связать аккаунт с игровым профилем «${input.nickname}» для записи на «${input.eveningTitle}».`,
        '',
        'Если это вы — подтвердите связь. Если нет, просто проигнорируйте сообщение.',
      ].join('\n'),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{
          text: '✅ Это я — связать VK',
          url: input.confirmationUrl,
        }]],
      },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean };
  if (!response.ok || payload.ok !== true) {
    throw claimError(
      'MafiaBot не смог отправить подтверждение. Откройте бота, нажмите «Старт» и повторите попытку.',
      409,
      'telegram_delivery_failed',
    );
  }
};

export async function createVkIdentityClaim(
  db: DatabaseWrapper,
  input: { vkUserId: string; nickname: unknown; eveningId: string; baseUrl: string },
) {
  const vkUserId = String(input.vkUserId || '').trim();
  const nickname = String(input.nickname || '').trim().replace(/\s+/g, ' ');
  const eveningId = String(input.eveningId || '').trim();
  if (!/^\d+$/.test(vkUserId) || !nickname || !eveningId) {
    throw claimError('Некорректные данные привязки', 400, 'claim_invalid');
  }

  const existingLink = await db.get<{ player_id: string }>(`
    SELECT player_id FROM player_external_identities
     WHERE platform='vk' AND external_user_id=? LIMIT 1
  `, [vkUserId]);
  if (existingLink?.player_id) {
    return { pending: false, linked: true, playerId: String(existingLink.player_id) };
  }

  const matches = await findPlayersByNickname(db, nickname);
  if (matches.length !== 1) {
    throw claimError(
      matches.length > 1
        ? 'В базе найдено несколько профилей с таким ником. Попросите организатора выбрать нужный.'
        : 'Игрок с таким ником не найден.',
      409,
      matches.length > 1 ? 'nickname_ambiguous' : 'nickname_not_found',
    );
  }
  const player = matches[0];
  if (!player.telegram_user_id) {
    throw claimError(
      'У этого профиля ещё нет подтверждённого Telegram. Попросите организатора привязать VK вручную.',
      409,
      'telegram_link_unavailable',
    );
  }

  const [evening, playerVk, recent] = await Promise.all([
    db.get<{ title: string }>('SELECT title FROM game_evenings WHERE id=? LIMIT 1', [eveningId]),
    db.get<{ external_user_id: string }>(`
      SELECT external_user_id FROM player_external_identities
       WHERE platform='vk' AND player_id=? LIMIT 1
    `, [player.id]),
    db.get<{ count: number }>(`
      SELECT COUNT(*) AS count FROM vk_identity_link_requests
       WHERE (vk_user_id=? OR player_id=?) AND created_at>?
    `, [vkUserId, player.id, new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()]),
  ]);
  if (!evening) throw claimError('Игровой вечер не найден', 404, 'evening_not_found');
  if (playerVk && String(playerVk.external_user_id) !== vkUserId) {
    throw claimError('Этот игровой профиль уже связан с другим VK.', 409, 'player_vk_conflict');
  }
  if (Number(recent?.count || 0) >= RATE_LIMIT_COUNT) {
    throw claimError('Подтверждение уже отправлялось. Проверьте MafiaBot или повторите через 15 минут.', 429, 'claim_rate_limited');
  }

  const now = new Date();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS).toISOString();
  await db.run(`
    INSERT INTO vk_identity_link_requests (
      token_hash, vk_user_id, player_id, evening_id, created_at, expires_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)
  `, [hashToken(rawToken), vkUserId, player.id, eveningId, now.toISOString(), expiresAt]);

  const baseUrl = String(input.baseUrl || '').replace(/\/$/, '');
  const confirmationUrl = `${baseUrl}/api/integrations/vk/link/confirm/${encodeURIComponent(rawToken)}`;
  try {
    await sendTelegramConfirmation({
      telegramUserId: String(player.telegram_user_id),
      nickname: player.nickname,
      eveningTitle: evening.title,
      confirmationUrl,
    });
  } catch (error) {
    await db.run('DELETE FROM vk_identity_link_requests WHERE token_hash=?', [hashToken(rawToken)]);
    throw error;
  }

  return {
    pending: true,
    linked: false,
    playerId: player.id,
    nickname: player.nickname,
    expiresAt,
  };
}

export async function getPendingVkIdentityClaim(db: DatabaseWrapper, vkUserId: string, eveningId: string) {
  return db.get<{ player_id: string; nickname: string; expires_at: string }>(`
    SELECT request.player_id, player.nickname, request.expires_at
      FROM vk_identity_link_requests request
      JOIN players player ON player.id=request.player_id
     WHERE request.vk_user_id=? AND request.evening_id=?
       AND request.confirmed_at IS NULL AND request.expires_at>?
     ORDER BY request.created_at DESC
     LIMIT 1
  `, [String(vkUserId || ''), String(eveningId || ''), new Date().toISOString()]);
}

export async function peekVkIdentityClaim(db: DatabaseWrapper, rawToken: unknown) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return db.get<ClaimRow>(`
    SELECT request.*, player.nickname, evening.title
      FROM vk_identity_link_requests request
      JOIN players player ON player.id=request.player_id
      JOIN game_evenings evening ON evening.id=request.evening_id
     WHERE request.token_hash=? AND request.expires_at>?
     LIMIT 1
  `, [hashToken(token), new Date().toISOString()]);
}

export async function confirmVkIdentityClaim(db: DatabaseWrapper, rawToken: unknown) {
  const claim = await peekVkIdentityClaim(db, rawToken);
  if (!claim) throw claimError('Ссылка подтверждения устарела. Начните привязку ещё раз.', 410, 'claim_expired');
  await linkVkIdentity(db, { vkUserId: claim.vk_user_id, playerId: claim.player_id });
  if (!claim.confirmed_at) {
    await db.run('UPDATE vk_identity_link_requests SET confirmed_at=? WHERE token_hash=?', [
      new Date().toISOString(),
      claim.token_hash,
    ]);
  }
  return {
    vkUserId: claim.vk_user_id,
    playerId: claim.player_id,
    eveningId: claim.evening_id,
    nickname: claim.nickname || '',
  };
}
