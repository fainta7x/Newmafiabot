import { DatabaseWrapper } from '../../db/index.ts';
import crypto from 'crypto';
import { registerGoingParticipantsForAllGames } from './eveningParticipantState.ts';
import { ensureInviteAudienceSchema } from '../../db/ensureInviteAudienceSchema.ts';
import { decidedAboveNoviceSql, noviceLevelSql } from '../../lib/noviceRule.ts';

export async function runCrmAutomations(db: DatabaseWrapper, now: Date = new Date()) {
  await ensureInviteAudienceSchema(db);
  const nowIso = now.toISOString();
  const uuid = () => crypto.randomUUID();
  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return nowIso;
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  // Only novices by the organizer's level are asked about their first game; a player set to club or tournament level
  // already played elsewhere (owner, 2026-10-13).
  const firstTimers = await db.all(`
    SELECT p.id as player_id, ep.evening_id, ge.starts_at, ge.title as evening_title, p.nickname
    FROM players p
    JOIN evening_participants ep ON ep.player_id = p.id
    JOIN game_evenings ge ON ge.id = ep.evening_id
    WHERE ep.attendance_status = 'attended' AND ge.status = 'completed'
      AND ${noviceLevelSql('p')}
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

  // Old «Иду» answers without games become «all games» too (owner, 2026-10-13).
  await registerGoingParticipantsForAllGames(db).catch((error) => console.warn('[CRM AUTOMATION] games not registered:', error instanceof Error ? error.message : String(error)));

  // Novice tasks of a player the organizer has since set to club or tournament level are no longer needed:
  // the feedback question is cancelled, «Определить игровой уровень» is done (the level is decided).
  await db.run(`
    UPDATE organizer_tasks SET status='cancelled', updated_at=?
     WHERE automation_key LIKE 'feedback-first-visit:%' AND status NOT IN ('done', 'cancelled')
       AND player_id IN (SELECT p.id FROM players p WHERE ${decidedAboveNoviceSql('p')})
  `, [nowIso]);
  await db.run(`
    UPDATE organizer_tasks SET status='done', completed_at=COALESCE(completed_at, ?), updated_at=?
     WHERE automation_key LIKE 'verified-onboarding:new-player:%' AND status NOT IN ('done', 'cancelled')
       AND player_id IN (SELECT p.id FROM players p WHERE ${decidedAboveNoviceSql('p')})
  `, [nowIso, nowIso]);

  // Неответ на анонс, "подтверждение", обычное напоминание и повторное
  // приглашение не являются задачами организатора. Рассылка остаётся у бота.

  // «Вернуть игрока в клуб» is no longer a task per player: «Дела» lists who has been away
  // (organizerAgendaService.ts, owner thresholds 2026-09-30).

  // A close-out task is an obligation only while its evening is open. Keep this
  // compatible with both the new close-out endpoint and the older simple settle path.
  await db.run(`
    UPDATE organizer_tasks
       SET status='done', completed_at=COALESCE(completed_at, ?), updated_at=?
     WHERE automation_key LIKE 'evening-close:%'
       AND status NOT IN ('done', 'cancelled')
       AND evening_id IN (
         SELECT id FROM game_evenings WHERE status='completed' OR settled_at IS NOT NULL
       )
  `, [nowIso, nowIso]);
}
