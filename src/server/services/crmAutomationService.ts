import { DatabaseWrapper } from '../../db/index.ts';
import crypto from 'crypto';

export async function runCrmAutomations(db: DatabaseWrapper, now: Date = new Date()) {
  const nowIso = now.toISOString();
  const uuid = () => crypto.randomUUID();
  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return nowIso;
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  const firstTimers = await db.all(`
    SELECT p.id as player_id, ep.evening_id, ge.starts_at, ge.title as evening_title, p.nickname
    FROM players p
    JOIN evening_participants ep ON ep.player_id = p.id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.attendance_status = 'attended' AND ge.status = 'completed'
      AND (
        SELECT COUNT(*)
        FROM evening_participants ep2
        JOIN game_evenings ge2 ON ge2.id = ep2.evening_id
        WHERE ep2.player_id = p.id AND ep2.attendance_status = 'attended' AND ge2.status = 'completed'
      ) = 1
  `);

  for (const ft of firstTimers) {
    await db.run(`
      INSERT OR IGNORE INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, automation_key,
        player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `tsk_${uuid()}`,
      'Спросить впечатления после первой игры',
      `Игрок ${ft.nickname} впервые посетил клуб на вечере "${ft.evening_title}". Спросить обратную связь.`,
      'feedback', 'todo', 'medium', addDays(ft.starts_at, 1),
      `feedback-first-visit:${ft.player_id}:${ft.evening_id}`,
      ft.player_id, ft.evening_id, nowIso, nowIso,
    ]);
  }

  // Неответ на анонс, "подтверждение", обычное напоминание и повторное
  // приглашение не являются задачами организатора. Рассылка остаётся у бота.

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const lapsed = await db.all(`
    SELECT p.id as player_id, p.nickname, MAX(ge.starts_at) as last_visit
    FROM players p
    JOIN evening_participants ep ON ep.player_id = p.id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.attendance_status = 'attended' AND ge.status = 'completed'
      AND p.lifecycle_status != 'blocked'
    GROUP BY p.id
    HAVING MAX(ge.starts_at) < ?
      AND NOT EXISTS (
        SELECT 1
        FROM evening_participants ep2
        JOIN game_evenings ge2 ON ge2.id = ep2.evening_id
        WHERE ep2.player_id = p.id AND ge2.starts_at > ?
          AND ep2.registration_status NOT IN ('cancelled', 'declined')
      )
  `, [thirtyDaysAgo.toISOString(), thirtyDaysAgo.toISOString()]);

  for (const lp of lapsed) {
    await db.run(`
      INSERT OR IGNORE INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, automation_key,
        player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `tsk_${uuid()}`, 'Вернуть игрока в клуб',
      `Игрок ${lp.nickname} не посещал игры более 30 дней. Связаться и понять, планирует ли он возвращаться.`,
      'call', 'todo', 'medium', nowIso, `lapsed-return:${lp.player_id}`,
      lp.player_id, null, nowIso, nowIso,
    ]);
  }
}
