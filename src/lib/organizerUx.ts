import type { CrmOverview } from './api.ts';

export type OrganizerPrimaryTab = 'overview' | 'evenings' | 'players' | 'more';

export const ORGANIZER_PRIMARY_NAV: Array<{ id: OrganizerPrimaryTab; label: string }> = [
  { id: 'overview', label: 'Сегодня' },
  { id: 'evenings', label: 'События' },
  { id: 'players', label: 'Игроки' },
  { id: 'more', label: 'Ещё' },
];

export type TodayActionKind =
  | 'evening_publish'
  | 'evening_announce'
  | 'evening_delivery'
  | 'evening_responses'
  | 'evening_seating'
  | 'evening_payments'
  | 'evening_live'
  | 'overdue_task'
  | 'today_task'
  | 'club_access_review'
  | 'unpaid'
  | 'newcomer_followup'
  | 'lapsed_player'
  | 'undated_task';

export interface TodayActionItem {
  key: string;
  kind: TodayActionKind;
  priority: number;
  title: string;
  reason: string;
  actionLabel: string;
  playerId?: string | null;
  eveningId?: string | null;
  payload: any;
  sortAt: number;
}

const toTime = (value?: string | null) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export function buildNextEveningAction(overview: CrmOverview | null): TodayActionItem | null {
  const evening: any = overview?.nextEvening;
  if (!evening) return null;
  const sortAt = toTime(evening.starts_at);
  const payload = evening;
  const announcement = evening.announcementSummary || {};
  const failed = Number(announcement.failed || 0);
  const notSent = Number(announcement.not_sent || 0);
  const unanswered = Number(announcement.unanswered || 0);
  const unseated = Number(evening.unseatedExpectedCount || 0);
  const games = Number(evening.gamesCount || 0);
  const completedGames = Number(evening.completedGamesCount || 0);
  const unpaidParticipants = (overview?.actionLists?.unpaidParticipants || []).filter(
    (participant: any) => String(participant.evening_id || '') === String(evening.id || ''),
  );
  const unpaidCount = unpaidParticipants.length;
  const unpaidAmount = unpaidParticipants.reduce(
    (sum: number, participant: any) => sum + Math.max(0, Number(participant.amount_due || 0) - Number(participant.amount_paid || 0)),
    0,
  );

  if (evening.status === 'draft') {
    return {
      key: `evening:${evening.id}:publish`, kind: 'evening_publish', priority: -6,
      title: 'Опубликовать ближайший вечер',
      reason: 'Пока это черновик: игроки и Telegram ещё не видят событие.',
      actionLabel: 'Открыть', eveningId: evening.id, payload, sortAt,
    };
  }
  if (evening.status === 'active') {
    return {
      key: `evening:${evening.id}:live`, kind: 'evening_live', priority: -6,
      title: games > completedGames ? 'Продолжить текущий вечер' : 'Вечер идёт сейчас',
      reason: games > completedGames
        ? `Завершено ${completedGames} из ${games} созданных игр.`
        : games > 0
          ? `Все ${games} созданных игр завершены — можно запускать следующую.`
          : 'Игры ещё не созданы — пора запускать первую.',
      actionLabel: 'К вечеру', eveningId: evening.id, payload, sortAt,
    };
  }
  if (failed > 0) {
    return {
      key: `evening:${evening.id}:delivery`, kind: 'evening_delivery', priority: -5,
      title: `Не доставлено: ${failed}`,
      reason: 'Бот не смог отправить этим игрокам анонс — их стоит проверить или написать лично.',
      actionLabel: 'Разобрать', eveningId: evening.id, payload, sortAt,
    };
  }
  if (notSent > 0) {
    return {
      key: `evening:${evening.id}:announce`, kind: 'evening_announce', priority: -4,
      title: `Разослать личный анонс · ${notSent}`,
      reason: 'Эти игроки подходят под формат вечера, ещё не ответили и пока не получили личное приглашение.',
      actionLabel: 'Разослать', eveningId: evening.id, payload, sortAt,
    };
  }
  if (unanswered > 0) {
    return {
      key: `evening:${evening.id}:responses`, kind: 'evening_responses', priority: -3,
      title: `Ждём ответ: ${unanswered}`,
      reason: 'Анонс доставлен, но решения пока нет. В карточке вечера можно посмотреть людей и при необходимости напомнить.',
      actionLabel: 'Проверить', eveningId: evening.id, payload, sortAt,
    };
  }
  if (unseated > 0) {
    return {
      key: `evening:${evening.id}:seating`, kind: 'evening_seating', priority: -2,
      title: `Рассадить игроков · ${unseated}`,
      reason: 'Эти игроки идут или придут позже, но ещё не привязаны к столу.',
      actionLabel: 'Рассадить', eveningId: evening.id, payload, sortAt,
    };
  }
  if (unpaidCount > 0) {
    return {
      key: `evening:${evening.id}:payments`, kind: 'evening_payments', priority: -1,
      title: `Проверить оплаты · ${unpaidCount}`,
      reason: `По ближайшему вечеру не закрыто ${Math.round(unpaidAmount)} ₽. Проверь оплаты перед началом вечера.`,
      actionLabel: 'К оплатам', eveningId: evening.id, payload, sortAt,
    };
  }
  return null;
}

export function buildTodayActionQueue(overview: CrmOverview | null): TodayActionItem[] {
  if (!overview) return [];
  const { actionLists } = overview;
  const extraLists = actionLists as any;
  const queue: TodayActionItem[] = [];
  const seen = new Set<string>();
  const push = (item: TodayActionItem, dedupeKey = item.key) => {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    queue.push(item);
  };

  const eveningAction = buildNextEveningAction(overview);
  if (eveningAction) push(eveningAction);

  for (const task of actionLists.overdueTasks || []) push({ key: `task:${task.id}`, kind: 'overdue_task', priority: 0, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Просроченная задача', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.due_at || task.created_at) });
  for (const task of actionLists.todayTasks || []) push({ key: `task:${task.id}`, kind: 'today_task', priority: 1, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Задача на сегодня', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.due_at || task.created_at) });

  for (const player of extraLists.clubAccessReview || []) {
    const playerId = player.id || player.player_id;
    const visits = Number(player.attendance_count || 0);
    push({
      key: `club-access:${playerId}`,
      kind: 'club_access_review',
      priority: 2,
      title: player.nickname || 'Новичок',
      reason: `${visits} посещения · всё ещё доступ только к Школе. Реши, готов ли игрок к основному клубу.`,
      actionLabel: 'Допустить',
      playerId,
      payload: player,
      sortAt: toTime(player.last_visit || player.updated_at),
    });
  }

  for (const participant of actionLists.unpaidParticipants || []) push({ key: `payment:${participant.id}`, kind: 'unpaid', priority: 3, title: participant.nickname || 'Игрок', reason: `Не оплачено ${Math.max(0, Number(participant.amount_due || 0) - Number(participant.amount_paid || 0))} ₽`, actionLabel: 'Оплачено', playerId: participant.player_id, eveningId: participant.evening_id, payload: participant, sortAt: toTime(participant.evening_date || participant.created_at) });

  for (const player of actionLists.newcomersAfterFirst || []) {
    const playerId = player.id || player.player_id;
    push({ key: `newcomer:${playerId}`, kind: 'newcomer_followup', priority: 4, title: player.nickname || 'Игрок', reason: 'После первой игры нужен короткий фидбек', actionLabel: 'Связаться', playerId, payload: player, sortAt: toTime(player.last_visit || player.updated_at) }, `followup:${playerId}`);
  }
  for (const player of actionLists.lapsedPlayers || []) {
    const playerId = player.id || player.player_id;
    push({ key: `lapsed:${playerId}`, kind: 'lapsed_player', priority: 5, title: player.nickname || 'Игрок', reason: 'Давно не был в клубе', actionLabel: 'Связаться', playerId, payload: player, sortAt: toTime(player.last_visit || player.updated_at) }, `followup:${playerId}`);
  }
  for (const task of actionLists.noDeadlineTasks || []) push({ key: `task:${task.id}`, kind: 'undated_task', priority: 6, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Задача без срока', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.created_at) });

  return queue.sort((a, b) => a.priority - b.priority || a.sortAt - b.sortAt || a.title.localeCompare(b.title, 'ru'));
}
