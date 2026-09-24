import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { isUnfinishedEveningGame } from './eveningCloseoutService.ts';
import { loadAnnouncementOverview } from './eveningAnnouncementTrackingService.ts';
import { loadGatheredPost } from './eveningGatheredPostService.ts';

/**
 * The evening route (user-approved 2026-09-24): one ordered path from preparation to «after»,
 * computed from the evening's real data so every step shows what is done and where to act.
 */
export type RouteStageId = 'prepare' | 'gather' | 'day' | 'live' | 'closeout' | 'after';
export type RouteTarget = 'overview' | 'participants' | 'management' | 'tables' | 'closeout' | 'games';
export type RouteStepStatus = 'done' | 'todo' | 'attention' | 'info';
export type RouteStep = {
  id: string;
  title: string;
  detail?: string;
  status: RouteStepStatus;
  target?: RouteTarget;
  action?: 'publish' | 'start' | 'create_next' | 'gathered_post';
  task_id?: string;
};
export type RouteStage = { id: RouteStageId; title: string; hint: string; state: 'done' | 'current' | 'upcoming'; steps: RouteStep[] };

const STAGES: Array<{ id: RouteStageId; title: string; hint: string }> = [
  { id: 'prepare', title: 'Подготовка', hint: 'Вечер создан, игры настроены, анонс опубликован.' },
  { id: 'gather', title: 'Сбор', hint: 'Собираем ответы и закрываем недобор по играм.' },
  { id: 'day', title: 'День вечера', hint: 'Столы, судьи и старт вечера.' },
  { id: 'live', title: 'Вечер идёт', hint: 'Отмечаем пришедших, проводим игры, задания вечера.' },
  { id: 'closeout', title: 'Закрытие', hint: 'Игры завершены, явка и оплаты проверены — закрываем вечер.' },
  { id: 'after', title: 'После вечера', hint: 'Следующий вечер и итоги.' },
];

const moscowDate = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const players = (n: number) => `${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`;

async function tables(db: DatabaseWrapper) {
  const rows = await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((row: any) => String(row.name)));
}

/** Which stage the evening is in now. */
export function currentRouteStage(evening: any, games: { total: number; unfinished: number }, now = Date.now()): RouteStageId {
  if (evening.status === 'completed' || evening.settled_at) return 'after';
  if (evening.status === 'active') {
    const start = new Date(String(evening.starts_at)).getTime();
    const late = Number.isFinite(start) && now - start > 5 * 60 * 60 * 1000;
    return (games.total > 0 && games.unfinished === 0) || late ? 'closeout' : 'live';
  }
  if (evening.status === 'draft') return 'prepare';
  const start = new Date(String(evening.starts_at)).getTime();
  return Number.isFinite(start) && moscowDate(start) <= moscowDate(now) ? 'day' : 'gather';
}

const taskStage = (task: any): RouteStageId => {
  const key = String(task.automation_key || '');
  if (key.startsWith('evening-template:preparation:') || key.startsWith('evening-manual:preparation:')) return 'day';
  if (key.startsWith('evening-template:during:') || key.startsWith('evening-manual:during:')) return 'live';
  return 'closeout';
};

export async function loadEveningRoute(db: DatabaseWrapper, eveningId: string, now = Date.now()) {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const has = await tables(db);
  const format = normalizeEveningFormat(evening.format);

  const participants = await db.all<any>('SELECT * FROM evening_participants WHERE evening_id = ?', [eveningId]);
  const answers = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0 };
  for (const participant of participants) {
    const answer = getEveningResponse(participant) as keyof typeof answers;
    if (answer in answers) answers[answer] += 1; else answers.unanswered += 1;
  }
  const attended = participants.filter((item: any) => item.attendance_status === 'attended').length;
  const pendingExpected = participants.filter((item: any) => ['going', 'late'].includes(getEveningResponse(item)) && item.attendance_status === 'pending').length;
  const debtors = participants.filter((item: any) => item.attendance_status === 'attended' && item.payment_status !== 'waived' && Number(item.amount_due || 0) > Number(item.amount_paid || 0)).length;

  const slots = has.has('evening_game_slots')
    ? await db.all<any>(`SELECT s.id, s.slot_number, s.target_players,
        (SELECT COUNT(*) FROM evening_slot_registrations r WHERE r.slot_id = s.id) AS registered
        FROM evening_game_slots s WHERE s.evening_id = ? ORDER BY s.slot_number`, [eveningId])
    : [];
  // «Иду» without an exact plan counts for every game, as in the slot plan.
  const wholeEvening = participants.filter((item: any) => ['going', 'late'].includes(getEveningResponse(item))).length
    - (has.has('evening_slot_registrations')
      ? Number((await db.get<any>(`SELECT COUNT(DISTINCT r.participant_id) AS count FROM evening_slot_registrations r
          JOIN evening_game_slots s ON s.id = r.slot_id WHERE s.evening_id = ?`, [eveningId]))?.count || 0)
      : 0);
  const underfilled = slots.filter((slot: any) => Number(slot.registered || 0) + Math.max(0, wholeEvening) < Number(slot.target_players || 11));

  const games = await db.all<any>('SELECT id, winner_team, protocol_text, archived_at FROM games WHERE evening_id = ? AND archived_at IS NULL', [eveningId]);
  const unfinishedGames = games.filter(isUnfinishedEveningGame).length;

  const telegramPosts = has.has('evening_telegram_publications')
    ? Number((await db.get<any>('SELECT COUNT(*) AS count FROM evening_telegram_publications WHERE evening_id = ?', [eveningId]))?.count || 0) : 0;
  const vkPosts = has.has('vk_evening_publications')
    ? Number((await db.get<any>("SELECT COUNT(*) AS count FROM vk_evening_publications WHERE evening_id = ? AND status = 'published'", [eveningId]))?.count || 0) : 0;
  const invitesSent = has.has('evening_announcement_dm_tracking')
    ? Number((await db.get<any>('SELECT COUNT(*) AS count FROM evening_announcement_dm_tracking WHERE evening_id = ? AND first_sent_at IS NOT NULL', [eveningId]))?.count || 0) : 0;
  const eveningTables = has.has('evening_tables')
    ? Number((await db.get<any>('SELECT COUNT(*) AS count FROM evening_tables WHERE evening_id = ?', [eveningId]))?.count || 0) : 0;
  const staff = has.has('evening_staff_assignments')
    ? await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]) : null;
  const tasks = has.has('organizer_tasks')
    ? await db.all<any>("SELECT id, title, status, automation_key FROM organizer_tasks WHERE evening_id = ? AND status != 'cancelled' ORDER BY created_at", [eveningId]) : [];
  const nextEvening = await db.get<any>(
    "SELECT id FROM game_evenings WHERE starts_at > ? AND status NOT IN ('cancelled') AND id != ? LIMIT 1",
    [evening.starts_at, eveningId],
  );

  const stageNow = currentRouteStage(evening, { total: games.length, unfinished: unfinishedGames }, now);
  const published = evening.status !== 'draft';
  const steps: Record<RouteStageId, RouteStep[]> = { prepare: [], gather: [], day: [], live: [], closeout: [], after: [] };

  steps.prepare.push(
    { id: 'created', title: 'Вечер создан', status: 'done' },
    { id: 'games', title: 'Игры настроены', detail: slots.length ? `${slots.length} ${plural(slots.length, 'игра', 'игры', 'игр')}` : 'Игры ещё не настроены', status: slots.length ? 'done' : 'todo', target: 'games' },
    published
      ? { id: 'publish', title: 'Вечер опубликован', status: 'done' }
      : { id: 'publish', title: 'Опубликовать вечер', detail: 'Игроки увидят его и смогут записаться', status: 'todo', action: 'publish' },
    { id: 'posts', title: 'Анонс в Telegram и ВК', detail: [telegramPosts ? 'Telegram ✓' : 'Telegram —', vkPosts ? 'ВК ✓' : 'ВК —'].join(' · '), status: telegramPosts || vkPosts ? 'done' : published ? 'attention' : 'todo', target: 'overview' },
    { id: 'invites', title: 'Личные приглашения', detail: invitesSent ? `Отправлено: ${invitesSent}` : 'Ещё не отправлены', status: invitesSent ? 'done' : published ? 'attention' : 'todo', target: 'overview' },
  );

  const coming = answers.going + answers.late;
  // «Молчат» is everyone invited who has not answered, not only players already in the roster.
  const overview = await loadAnnouncementOverview(db, eveningId).catch(() => null);
  const silent = overview ? Number(overview.summary.unanswered || 0) + Number(overview.summary.not_sent || 0) + Number(overview.summary.failed || 0) : answers.unanswered;
  steps.gather.push(
    { id: 'answers', title: 'Ответы игроков', detail: `Идут: ${coming} · думают: ${answers.thinking} · не идут: ${answers.declined} · молчат: ${silent}`, status: silent || answers.thinking ? 'attention' : coming ? 'done' : 'todo', target: 'participants' },
    { id: 'shortfall', title: 'Набор на игры', detail: slots.length ? (underfilled.length ? `Недобор в ${underfilled.length} из ${slots.length} ${plural(slots.length, 'игры', 'игр', 'игр')}` : 'Все игры набраны') : 'Игры не настроены', status: slots.length && !underfilled.length ? 'done' : 'attention', target: 'participants' },
  );
  if (format === 'NOVICE') {
    steps.gather.push({ id: 'novice-decision', title: 'Решение по вечеру новичков', detail: 'Проверка группы в четверг в 20:00, решение до пятницы 15:00. Автоотмены нет.', status: 'info' });
  }

  steps.day.push(
    { id: 'staff', title: 'Организатор вечера назначен', detail: staff?.organizer_player_id ? 'Назначен' : 'Не назначен', status: staff?.organizer_player_id ? 'done' : 'attention', target: 'management' },
    { id: 'tables', title: 'Столы и судьи', detail: eveningTables ? `Столов: ${eveningTables}` : 'Столы не созданы', status: eveningTables ? 'done' : 'todo', target: 'tables' },
    evening.status === 'active' || stageNow === 'closeout' || stageNow === 'after'
      ? { id: 'start', title: 'Вечер начат', status: 'done' }
      : { id: 'start', title: 'Начать вечер', detail: 'Нажимают, когда игроки собираются', status: stageNow === 'day' ? 'todo' : 'info', action: published ? 'start' : undefined },
  );

  const gathered = await loadGatheredPost(db, eveningId);
  steps.live.push(
    gathered.state === 'published'
      ? { id: 'gathered', title: 'Пост «Мы собрались»', detail: [
        (gathered as any).telegram_status === 'published' ? 'Telegram ✓' : 'Telegram —',
        (gathered as any).vk_status === 'published' ? 'ВК ✓' : 'ВК —',
      ].join(' · '), status: 'done' }
      : gathered.state === 'skipped'
        ? { id: 'gathered', title: 'Пост «Мы собрались» пропущен', detail: 'Можно выложить позже', status: 'attention', action: 'gathered_post' }
        : { id: 'gathered', title: 'Пост «Мы собрались»', detail: 'Фото в Telegram и ВК — после него открываются игры', status: evening.status === 'active' ? 'todo' : 'info', action: evening.status === 'active' ? 'gathered_post' : undefined },
    { id: 'attendance', title: 'Отметить пришедших', detail: `Пришли: ${attended}${pendingExpected ? ` · ждём ещё ${players(pendingExpected)}` : ''}`, status: attended && !pendingExpected ? 'done' : attended ? 'attention' : 'todo', target: 'management' },
    { id: 'play', title: 'Игры вечера', detail: games.length ? `Сыграно: ${games.length - unfinishedGames}${unfinishedGames ? ` · идут/не завершены: ${unfinishedGames}` : ''}` : 'Ещё не начаты', status: games.length && !unfinishedGames ? 'done' : games.length ? 'attention' : 'todo', target: 'games' },
  );

  steps.closeout.push(
    { id: 'unfinished', title: 'Все игры завершены', detail: unfinishedGames ? `Не завершено: ${unfinishedGames}` : games.length ? 'Да' : 'Игр не было', status: unfinishedGames ? 'attention' : games.length ? 'done' : 'todo', target: 'games' },
    { id: 'reconcile', title: 'Явка сверена', detail: pendingExpected ? `Без отметки: ${players(pendingExpected)}` : 'Все отмечены', status: pendingExpected ? 'attention' : 'done', target: 'closeout' },
    { id: 'money', title: 'Оплаты', detail: debtors ? `Не оплатили: ${players(debtors)}` : 'Все оплатили', status: debtors ? 'attention' : 'done', target: 'closeout' },
    stageNow === 'after'
      ? { id: 'close', title: 'Вечер закрыт', status: 'done' }
      : { id: 'close', title: 'Закрыть вечер', detail: 'Итоги, долги и статистика сохранятся', status: stageNow === 'closeout' ? 'todo' : 'info', target: 'closeout' },
  );

  steps.after.push(
    { id: 'next', title: 'Следующий вечер создан', status: nextEvening ? 'done' : 'todo', action: nextEvening ? undefined : 'create_next' },
  );

  for (const task of tasks) {
    const stage = taskStage(task);
    steps[stage].push({ id: `task-${task.id}`, title: String(task.title), status: task.status === 'done' ? 'done' : 'todo', task_id: String(task.id) });
  }

  const order = STAGES.map((stage) => stage.id);
  const currentIndex = order.indexOf(stageNow);
  const stages: RouteStage[] = STAGES.map((stage, index) => ({
    ...stage,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    steps: steps[stage.id],
  }));

  return {
    evening: { id: String(evening.id), title: String(evening.title || ''), status: String(evening.status), format, starts_at: evening.starts_at },
    current_stage: stageNow,
    stages,
  };
}
