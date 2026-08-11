import type { DatabaseWrapper } from '../../db/index.ts';
import type { BettingRoleSnapshot } from './bettingPoolService.ts';

const roleLabel = (role: BettingRoleSnapshot['role']) => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

export async function notifyBettingSpectators(
  db: DatabaseWrapper,
  input: {
    gameId: number;
    gameNumber: number | null;
    closesAt: string;
    judgePlayerId: string | null;
    roleSnapshot: BettingRoleSnapshot[];
    webAppUrl: string;
  },
) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { sent: 0, failed: 0, skipped: true, reason: 'telegram_token_missing' };

  const excluded = new Set(input.roleSnapshot.map((item) => item.player_id));
  if (input.judgePlayerId) excluded.add(input.judgePlayerId);
  const recipients = await db.all<any>(`
    SELECT id, nickname, telegram_user_id
      FROM players
     WHERE telegram_user_id IS NOT NULL AND TRIM(telegram_user_id) != ''
     ORDER BY nickname COLLATE NOCASE ASC
  `);

  const red = input.roleSnapshot.filter((item) => item.team === 'red');
  const black = input.roleSnapshot.filter((item) => item.team === 'black');
  const lines = [
    `🎲 СТАВКИ НА ИГРУ №${input.gameNumber || input.gameId}`,
    '',
    '🔴 КРАСНЫЕ',
    ...red.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    '⚫ ЧЁРНЫЕ',
    ...black.map((item) => `#${item.seat_number} ${item.nickname} — ${roleLabel(item.role)}`),
    '',
    'Коэффициенты меняются от ставок игроков. Если все грузят одну сторону, её прибыль стремится к нулю.',
    'Окно ставок — 90 секунд после старта игры.',
  ];
  const text = lines.join('\n');

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    if (excluded.has(String(recipient.id))) continue;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(recipient.telegram_user_id),
          text,
          reply_markup: {
            inline_keyboard: [[{
              text: '🎲 Сделать ставку',
              web_app: { url: input.webAppUrl },
            }]],
          },
        }),
      });
      if (response.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed, skipped: false };
}
