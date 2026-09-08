import type { DatabaseWrapper } from '../../db/index.ts';
import type { BettingRoleSnapshot } from './bettingPoolService.ts';
import {
  enqueueTelegramMessage,
  getTelegramEntityDeliverySummary,
  kickTelegramMessageOutbox,
} from './telegramMessageOutboxService.ts';

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
    `🎲 <b>СТАВКИ НА ИГРУ №${input.gameNumber || input.gameId}</b>`,
    '',
    '🔴 <b>КРАСНЫЕ</b>',
    ...red.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    '⚫ <b>ЧЁРНЫЕ</b>',
    ...black.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    'Коэффициенты меняются от ставок игроков.',
    'Окно ставок — 90 секунд после старта игры.',
  ].join('\n');
};

/**
 * Persists one deduplicated message per eligible spectator. Delivery is handled by
 * the direct-message outbox worker and therefore does not block or roll back game start.
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
    SELECT id, nickname, telegram_user_id
      FROM players
     WHERE telegram_user_id IS NOT NULL AND TRIM(telegram_user_id) != ''
     ORDER BY nickname COLLATE NOCASE ASC
  `);
  const recipients = linkedPlayers.filter((recipient: any) => !excluded.has(String(recipient.id)));
  const text = buildBettingText(input);

  for (const recipient of recipients) {
    await enqueueTelegramMessage(db, {
      messageKey: `betting-open:${input.poolId}:${recipient.id}`,
      category: 'betting',
      eventType: 'betting_pool_opened',
      entityId: input.poolId,
      playerId: String(recipient.id),
      chatId: String(recipient.telegram_user_id),
      text,
      replyMarkup: {
        inline_keyboard: [[{
          text: '🎲 Сделать ставку',
          web_app: { url: input.webAppUrl },
        }]],
      },
    });
  }

  // Durable enqueue happens first; delivery begins immediately and concurrently.
  kickTelegramMessageOutbox(db);
  const delivery = await getTelegramEntityDeliverySummary(db, 'betting', input.poolId);
  console.info('[BETS][TELEGRAM] queued', {
    pool_id: input.poolId,
    game_id: input.gameId,
    eligible_recipients: recipients.length,
    sent: delivery.sent,
    failed: delivery.failed,
  });
  return {
    eligible: recipients.length,
    queued: recipients.length,
    sent: delivery.sent,
    failed: delivery.failed,
    skipped: recipients.length === 0,
    reason: recipients.length === 0 ? 'zero_eligible_recipients' : null,
  };
}

export async function getBettingNotificationDiagnostics(db: DatabaseWrapper, poolId: string) {
  return getTelegramEntityDeliverySummary(db, 'betting', poolId);
}
