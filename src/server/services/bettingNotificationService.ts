import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePersonalNotificationRoutingSchema } from '../../db/ensurePersonalNotificationRoutingSchema.ts';
import { ensureTelegramDirectMessageSchema } from '../../db/ensureTelegramDirectMessageSchema.ts';
import { ensureVkPersonalMessageSchema } from '../../db/ensureVkPersonalMessageSchema.ts';
import type { BettingRoleSnapshot } from './bettingPoolService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

const roleLabel = (role: BettingRoleSnapshot['role']) => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

const buildBettingText = (input: {
  gameId: number;
  gameNumber: number | null;
  roleSnapshot: BettingRoleSnapshot[];
}) => {
  const red = input.roleSnapshot.filter((item) => item.team === 'red');
  const black = input.roleSnapshot.filter((item) => item.team === 'black');
  return [
    `🎲 СТАВКИ НА ИГРУ №${input.gameNumber || input.gameId}`,
    '',
    '🔴 КРАСНЫЕ',
    ...red.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    '⚫ ЧЁРНЫЕ',
    ...black.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    'Коэффициенты меняются от ставок игроков.',
    'Окно ставок — 90 секунд после старта игры.',
  ].join('\n');
};

/**
 * Persists one deduplicated canonical notification per eligible spectator.
 * The personal router selects exactly one linked external channel and keeps
 * Telegram/VK delivery idempotent without blocking game start.
 */
export async function notifyBettingSpectators(
  db: DatabaseWrapper,
  input: {
    poolId: string;
    gameId: number;
    gameNumber: number | null;
    closesAt: string;
    judgePlayerId: string | null;
    roleSnapshot: BettingRoleSnapshot[];
    webAppUrl: string;
  },
) {
  const excluded = new Set(input.roleSnapshot.map((item) => String(item.player_id)));
  if (input.judgePlayerId) excluded.add(String(input.judgePlayerId));
  const linkedPlayers = await db.all<any>(`
    SELECT DISTINCT p.id, p.nickname
      FROM players p
      LEFT JOIN player_external_identities vk
        ON vk.player_id=p.id AND vk.platform='vk'
     WHERE (p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) != '')
        OR (vk.external_user_id IS NOT NULL AND TRIM(vk.external_user_id) != '')
     ORDER BY p.nickname COLLATE NOCASE ASC
  `);
  const recipients = linkedPlayers.filter((recipient: any) => !excluded.has(String(recipient.id)));
  const text = buildBettingText(input);

  let queued = 0;
  for (const recipient of recipients) {
    const result = await queuePersonalNotification(db, {
      notificationKey: `betting-open:${input.poolId}:${recipient.id}`,
      playerId: String(recipient.id),
      eventType: 'betting_pool_opened',
      entityId: input.poolId,
      text,
      actionPath: '/player',
      telegramReplyMarkup: {
        inline_keyboard: [[{
          text: '🎲 Сделать ставку',
          web_app: { url: input.webAppUrl },
        }]],
      },
    });
    if (result.delivery?.selected_channel) queued += 1;
  }

  const delivery = await getBettingNotificationDiagnostics(db, input.poolId);
  console.info('[BETS][PERSONAL] queued', {
    pool_id: input.poolId,
    game_id: input.gameId,
    eligible_recipients: recipients.length,
    queued,
    telegram: delivery.telegram,
    vk: delivery.vk,
  });
  return {
    eligible: recipients.length,
    queued,
    sent: delivery.sent,
    failed: delivery.failed,
    skipped: recipients.length === 0,
    reason: recipients.length === 0 ? 'zero_eligible_recipients' : null,
  };
}

export async function getBettingNotificationDiagnostics(db: DatabaseWrapper, poolId: string) {
  await Promise.all([
    ensurePersonalNotificationRoutingSchema(db),
    ensureTelegramDirectMessageSchema(db),
    ensureVkPersonalMessageSchema(db),
  ]);
  const [deliveries, telegramRows, vkRows] = await Promise.all([
    db.all<any>(`
      SELECT selected_channel, status, reason
        FROM personal_notification_deliveries
       WHERE event_type='betting_pool_opened' AND entity_id=?
    `, [poolId]),
    db.all<any>(`
      SELECT status
        FROM telegram_message_outbox
       WHERE event_type='betting_pool_opened' AND entity_id=?
    `, [poolId]),
    db.all<any>(`
      SELECT status, failure_kind
        FROM vk_message_outbox
       WHERE event_type='betting_pool_opened' AND entity_id=?
    `, [poolId]),
  ]);
  const telegram = deliveries.filter((row: any) => row.selected_channel === 'telegram').length;
  const vk = deliveries.filter((row: any) => row.selected_channel === 'vk').length;
  const unroutable = deliveries.filter((row: any) => row.status === 'unroutable').length;
  const sent = telegramRows.filter((row: any) => row.status === 'sent').length
    + vkRows.filter((row: any) => row.status === 'sent').length;
  const failed = unroutable
    + telegramRows.filter((row: any) => row.status === 'failed').length
    + vkRows.filter((row: any) => row.status === 'failed').length;
  const pending = telegramRows.filter((row: any) => row.status === 'pending').length
    + vkRows.filter((row: any) => row.status === 'pending').length;
  return { total: deliveries.length, sent, failed, pending, telegram, vk };
}
