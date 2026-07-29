import { DatabaseWrapper } from '../../db/index.ts';
import crypto from 'crypto';

export async function runCrmAutomations(db: DatabaseWrapper, now: Date = new Date()) {
  const nowIso = now.toISOString();

  // Helper to generate UUID
  const uuid = () => crypto.randomUUID();

  // Helper to add days to a date string
  const addDays = (dateStr: string, days: number): string => {
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    } catch (_) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString();
    }
  };

  // 1. After first completed visit: ask feedback on the next day
  // Find players who have exactly 1 attended evening which is completed
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
    const taskId = `tsk_${uuid()}`;
    const automationKey = `feedback-first-visit:${ft.player_id}:${ft.evening_id}`;
    const dueAt = addDays(ft.starts_at, 1); // next day

    await db.run(`
      INSERT OR IGNORE INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskId,
      'Спросить впечатления после первой игры',
      `Игрок ${ft.nickname} впервые посетил клуб на вечере "${ft.evening_title}". Спросить обратную связь.`,
      'feedback',
      'todo',
      'medium',
      dueAt,
      automationKey,
      ft.player_id,
      ft.evening_id,
      nowIso,
      nowIso
    ]);
  }

  // 2. Unanswered invite for 2 days -> Clarify participation
  // Find participants with status 'invited' where invitation is >= 2 days old and evening in future
  const unanswered = await db.all(`
    SELECT ep.player_id, ep.evening_id, ge.starts_at, ge.title as evening_title, p.nickname, ep.created_at as participation_created
    FROM evening_participants ep
    JOIN players p ON p.id = ep.player_id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.registration_status = 'invited' 
      AND ge.status NOT IN ('completed', 'cancelled')
  `);

  for (const ua of unanswered) {
    const inviteDate = new Date(ua.participation_created || nowIso);
    const diffDays = (now.getTime() - inviteDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 2) {
      const inviteFollowupKey = `invite-followup:${ua.evening_id}:${ua.player_id}`;
      const existingFollowupTask = await db.get(
        `SELECT id FROM organizer_tasks WHERE automation_key IN (?, ?) AND status NOT IN ('done', 'cancelled')`,
        [inviteFollowupKey, `clarify-participation:${ua.evening_id}:${ua.player_id}`]
      );
      if (existingFollowupTask) {
        continue;
      }

      const taskId = `tsk_${uuid()}`;
      const automationKey = `clarify-participation:${ua.evening_id}:${ua.player_id}`;
      // Since it's already overdue or due, set due_at to now
      await db.run(`
        INSERT OR IGNORE INTO organizer_tasks (
          id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        'Уточнить участие',
        `Игрок ${ua.nickname} приглашен на вечер "${ua.evening_title}" и не ответил в течение 2 дней. Уточнить статус участия.`,
        'invite',
        'todo',
        'medium',
        nowIso,
        automationKey,
        ua.player_id,
        ua.evening_id,
        nowIso,
        nowIso
      ]);
    }
  }

  // 3. Confirmed reminder 1 day before evening
  // Find participants with status 'confirmed' where evening starts in future
  const confirmed = await db.all(`
    SELECT ep.player_id, ep.evening_id, ge.starts_at, ge.title as evening_title, p.nickname
    FROM evening_participants ep
    JOIN players p ON p.id = ep.player_id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.registration_status = 'confirmed' 
      AND ge.status NOT IN ('completed', 'cancelled')
      AND ge.starts_at > ?
  `, [nowIso]);

  for (const c of confirmed) {
    const startsAtDate = new Date(c.starts_at);
    const oneDayBefore = new Date(startsAtDate.getTime() - 24 * 60 * 60 * 1000);
    // Only create if we are within or close to the reminder window, or just create it with due_at = 1 day before evening starts
    const taskId = `tsk_${uuid()}`;
    const automationKey = `reminder-confirmed:${c.evening_id}:${c.player_id}`;
    await db.run(`
      INSERT OR IGNORE INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskId,
      'Напоминание о вечере',
      `Напомнить игроку ${c.nickname} о предстоящем вечере "${c.evening_title}" завтра.`,
      'reminder',
      'todo',
      'medium',
      oneDayBefore.toISOString(),
      automationKey,
      c.player_id,
      c.evening_id,
      nowIso,
      nowIso
    ]);
  }

  // 4. One visit ever and no registration/booking for any future evening -> "Пригласить повторно" (3 days after first visit)
  const oneVisitNoNext = await db.all(`
    SELECT p.id as player_id, p.nickname, MAX(ge.starts_at) as last_visit
    FROM players p
    JOIN evening_participants ep ON ep.player_id = p.id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.attendance_status = 'attended' AND ge.status = 'completed'
    GROUP BY p.id
    HAVING COUNT(CASE WHEN ep.attendance_status = 'attended' THEN 1 END) = 1
      AND NOT EXISTS (
        SELECT 1 
        FROM evening_participants ep2
        JOIN game_evenings ge2 ON ge2.id = ep2.evening_id
        WHERE ep2.player_id = p.id AND ge2.starts_at > (
          SELECT MAX(ge3.starts_at)
          FROM evening_participants ep3
          JOIN game_evenings ge3 ON ge3.id = ep3.evening_id
          WHERE ep3.player_id = p.id AND ep3.attendance_status = 'attended' AND ge3.status = 'completed'
        )
          AND ep2.registration_status != 'cancelled'
      )
  `);

  for (const ov of oneVisitNoNext) {
    const lastVisitDate = new Date(ov.last_visit);
    const diffDays = (now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 3) {
      const taskId = `tsk_${uuid()}`;
      const automationKey = `reinvite-second-visit:${ov.player_id}`;
      const dueAt = addDays(ov.last_visit, 3);
      await db.run(`
        INSERT OR IGNORE INTO organizer_tasks (
          id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        'Пригласить повторно',
        `Игрок ${ov.nickname} сыграл у нас 1 раз и до сих пор не записался на новые игры. Пригласить повторно.`,
        'invite',
        'todo',
        'medium',
        dueAt,
        automationKey,
        ov.player_id,
        null,
        nowIso,
        nowIso
      ]);
    }
  }

  // 5. Last visit 30+ days ago and no returns task -> "Вернуть игрока в клуб" (lapsed return)
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
          AND ep2.registration_status != 'cancelled'
      )
  `, [thirtyDaysAgo.toISOString(), thirtyDaysAgo.toISOString()]);

  for (const lp of lapsed) {
    const taskId = `tsk_${uuid()}`;
    const automationKey = `lapsed-return:${lp.player_id}`;
    await db.run(`
      INSERT OR IGNORE INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskId,
      'Вернуть игрока в клуб',
      `Игрок ${lp.nickname} не посещал игры более 30 дней. Связаться и вернуть его в клуб.`,
      'call',
      'todo',
      'medium',
      nowIso,
      automationKey,
      lp.player_id,
      null,
      nowIso,
      nowIso
    ]);
  }
}
