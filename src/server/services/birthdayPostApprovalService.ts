import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';

const dayMs = 86_400_000;

/** Creates approval tasks for birthdays today or missed within the last week.
 * Does not publish anything; messages are addressed only to organizers.
 */
export async function queueBirthdayPostApprovalTasks(db: DatabaseWrapper, now = Date.now()) {
  const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
  const year = Number(today.slice(0, 4));
  const todayStart = Date.parse(today + 'T00:00:00Z');
  const people = await db.all<any>(`SELECT id, nickname, birth_day, birth_month
    FROM players WHERE birth_day IS NOT NULL AND birth_month IS NOT NULL
      AND COALESCE(birthday_visibility, 'private') NOT IN ('private', 'hidden')
      AND COALESCE(contact_status, 'normal') NOT IN ('blocked', 'paused')
      AND COALESCE(from_other_city, 0) = 0 AND COALESCE(stopped_attending, 0) = 0
      AND COALESCE(source, '') <> 'legacy_guest_migrated'`);
  let created = 0;
  for (const player of people) {
    const day = Number(player.birth_day);
    const month = Number(player.birth_month);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    let birthdayYear = year;
    let birthday = Date.UTC(birthdayYear, month - 1, day);
    if (birthday > todayStart) { birthdayYear -= 1; birthday = Date.UTC(birthdayYear, month - 1, day); }
    if (new Date(birthday).getUTCDate() !== day || new Date(birthday).getUTCMonth() !== month - 1) continue;
    if (todayStart - birthday > 7 * dayMs) continue;
    const key = `birthday-post-approval:${player.id}:${birthdayYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (await db.get('SELECT id FROM organizer_tasks WHERE automation_key=? LIMIT 1', [key])) continue;
    const time = new Date(now).toISOString();
    const label = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
    const taskId = randomUUID();
    await db.run(`INSERT OR IGNORE INTO organizer_tasks
      (id,title,description,type,status,priority,due_at,automation_key,player_id,created_at,updated_at)
      VALUES (?,?,?,'general','todo','high',?,?,?,?,?)`, [
        taskId, `Подготовить поздравление — ${player.nickname} (ДР ${label})`,
        'Откройте черновик с аватаркой и текстом в «Ещё → Сбор на подарок». Перед публикацией проверьте приглашение на игровой вечер. Публикация только по вашему подтверждению.',
        time, key, String(player.id), time, time,
      ]);
    created += 1;
    await enqueueOrganizerNotification(db, {
      messageKey: key, eventType: 'birthday_post_approval', entityId: String(player.id),
      text: `🎂 У ${player.nickname} день рождения ${label}. Подготовлен предпросмотр поздравления: откройте карточку, проверьте текст и подтвердите публикацию.`,
      openPath: `/admin/more/gifts?birthday_post=${encodeURIComponent(String(player.id))}`,
    });
  }
  return created;
}
