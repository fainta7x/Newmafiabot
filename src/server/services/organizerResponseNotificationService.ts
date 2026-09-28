import type { DatabaseWrapper } from '../../db/index.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';

const COMING = new Set(['going', 'late']);

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Tells the organizer, right away, when a player signs up for an evening or cancels after «Иду».
 * Only answers the player gives themselves (bot buttons, the app, VK) come here; organizer edits
 * in the cabinet do not. Switching between «Иду» and «Приду позже» is not news.
 */
export async function notifyOrganizerAboutResponse(
  db: DatabaseWrapper,
  participantId: string,
  previous: string | null | undefined,
  next: string,
) {
  const wasComing = COMING.has(String(previous || ''));
  const isComing = COMING.has(next);
  if (wasComing === isComing) return;
  if (!isComing && next !== 'declined') return;

  const row = await db.get<any>(
    `SELECT p.id AS player_id, p.nickname, p.game_level, e.id AS evening_id, e.title, e.starts_at,
            (SELECT COUNT(*) FROM evening_participants past
               WHERE past.player_id = p.id AND past.attendance_status = 'attended') AS visits
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       JOIN game_evenings e ON e.id = ep.evening_id
      WHERE ep.id = ?
      LIMIT 1`,
    [participantId],
  );
  if (!row) return;

  const when = new Date(row.starts_at).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
  const visits = Number(row.visits || 0);
  const who = visits === 0
    ? 'придёт впервые'
    : ['novice', 'unrated'].includes(String(row.game_level || '')) ? `новичок, был ${visits} раз` : `был ${visits} раз`;
  const text = isComing
    ? `✅ ${escapeHtml(row.nickname)} записался на «${escapeHtml(row.title)}» (${when}) · ${who}`
    : `❌ ${escapeHtml(row.nickname)} отказался от «${escapeHtml(row.title)}» (${when}) — раньше отвечал «Иду»`;

  await enqueueOrganizerNotification(db, {
    messageKey: `evening-response:${participantId}:${isComing ? 'in' : 'out'}:${Date.now()}`,
    eventType: isComing ? 'evening_signed_up' : 'evening_cancelled_by_player',
    entityId: String(row.evening_id),
    text,
  }, { kick: false });
}
