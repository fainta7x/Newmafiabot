import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';

/**
 * The «Игрок вечера» vote as buttons in the bot (owner, 2026-10-05): after an evening is closed every attendee who is
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

export async function queueEveningVoteMessages(db: DatabaseWrapper, eveningId: string, title: string): Promise<number> {
  const attendees = await db.all<any>(`
    SELECT p.id, p.nickname
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);
  if (attendees.length < 2) return 0;
  let queued = 0;
  for (const voter of attendees) {
    const routing = await resolvePersonalNotificationRouting(db, String(voter.id));
    if (!routing.personal_enabled || routing.selected_channel !== 'telegram') continue;
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
      notificationKey: `evening-vote:${eveningId}:${voter.id}`,
      playerId: String(voter.id),
      eventType: 'evening_vote',
      entityId: eveningId,
      text: `🏆 «${title}»: кто сыграл лучше всех?\nНажми на игрока — это твой голос за «Игрока вечера». Передумал? Нажми на другого, голос заменится. Голосование открыто 3 дня.`,
      telegramReplyMarkup: { inline_keyboard: rows },
    });
    if (result.created) queued += 1;
  }
  return queued;
}
