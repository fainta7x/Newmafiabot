import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';

/**
 * The «MVP вечера» vote as buttons in the bot (owner, 2026-10-05): after an evening is closed every attendee who is
 * reached through Telegram gets one message with a button per other attendee. A tap is the vote, tapping another
 * player changes it. Players reached through VK keep voting in the app (Клуб → Истории).
 */

const CALLBACK_LIMIT = 64;

const utf8Length = (value: string) => Buffer.byteLength(value, 'utf8');

/** `evv:<evening>:<start of the player id>` — as much of the id as fits Telegram's 64-byte callback data. */
export const voteCallbackData = (eveningId: string, nomineeId: string): string | null => {
  const head = `evv:${eveningId}:`;
  const room = CALLBACK_LIMIT - utf8Length(head);
  if (room < 4) return null;
  return `${head}${nomineeId.slice(0, Math.min(nomineeId.length, room))}`;
};

const buttonLabel = (nickname: string) => {
  const clean = nickname.trim() || 'Игрок';
  return clean.length > 24 ? `${clean.slice(0, 23)}…` : clean;
};

/**
 * `nudge`: the reminder for attendees who have not voted yet (owner, 2026-10-13: the vote was missed). It goes through
 * the same personal channel — buttons in Telegram, a message with the app link in VK — and never to someone who voted.
 */
export async function queueEveningVoteMessages(db: DatabaseWrapper, eveningId: string, title: string, options: { nudge?: boolean } = {}): Promise<number> {
  const nudge = Boolean(options.nudge);
  const voted = nudge
    ? new Set((await db.all<any>("SELECT voter_player_id FROM evening_player_votes WHERE evening_id = ? AND category = 'best_player'", [eveningId]).catch(() => [])).map((row: any) => String(row.voter_player_id)))
    : new Set<string>();
  const attendees = await db.all<any>(`
    SELECT p.id, p.nickname
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);
  if (attendees.length < 2) return 0;
  let queued = 0;
  for (const voter of attendees) {
    if (voted.has(String(voter.id))) continue;
    const routing = await resolvePersonalNotificationRouting(db, String(voter.id));
    if (!routing.personal_enabled || !routing.selected_channel) continue;
    if (routing.selected_channel === 'vk') {
      // Players reached through VK vote in the app: the message carries the link (owner, 2026-10-13).
      if (!nudge) continue;
      const sent = await queuePersonalNotification(db, {
        notificationKey: `evening-vote-nudge:${eveningId}:${voter.id}`,
        playerId: String(voter.id), eventType: 'evening_vote_nudge', entityId: eveningId,
        text: `🏆 «${title}»: вы ещё не проголосовали за MVP вечера. Это 10 секунд — откройте приложение, главная страница, карточка «MVP вечера».`,
        actionPath: '/player',
      });
      if (sent.created) queued += 1;
      continue;
    }
    if (routing.selected_channel !== 'telegram') continue;
    const buttons = attendees
      .filter((other) => String(other.id) !== String(voter.id))
      .flatMap((other) => {
        const data = voteCallbackData(eveningId, String(other.id));
        return data ? [{ text: buttonLabel(String(other.nickname || '')), callback_data: data }] : [];
      });
    if (!buttons.length) continue;
    const rows: Array<typeof buttons> = [];
    for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
    const result = await queuePersonalNotification(db, {
      notificationKey: `${nudge ? 'evening-vote-nudge' : 'evening-vote'}:${eveningId}:${voter.id}`,
      playerId: String(voter.id),
      eventType: nudge ? 'evening_vote_nudge' : 'evening_vote',
      entityId: eveningId,
      text: `${nudge ? '⏰ Ты ещё не проголосовал.\n' : ''}🏆 «${title}»: кто сыграл лучше всех?\nНажми на игрока — это твой голос за «Игрока вечера». Передумал? Нажми на другого, голос заменится. Голосование открыто 3 дня.`,
      telegramReplyMarkup: { inline_keyboard: rows },
    });
    if (result.created) queued += 1;
  }
  return queued;
}
