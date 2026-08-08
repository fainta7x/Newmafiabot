import type { CrmOverview } from './api.ts';

export type OrganizerPrimaryTab = 'overview' | 'evenings' | 'players' | 'more';

export const ORGANIZER_PRIMARY_NAV: Array<{ id: OrganizerPrimaryTab; label: string }> = [
  { id: 'overview', label: 'Сегодня' },
  { id: 'evenings', label: 'События' },
  { id: 'players', label: 'Игроки' },
  { id: 'more', label: 'Ещё' },
];

export type TodayActionKind = 'overdue_task' | 'today_task' | 'unpaid' | 'newcomer_followup' | 'lapsed_player' | 'undated_task';

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

export function buildTodayActionQueue(overview: CrmOverview | null): TodayActionItem[] {
  if (!overview) return [];
  const { actionLists } = overview;
  const queue: TodayActionItem[] = [];
  const seen = new Set<string>();
  const push = (item: TodayActionItem, dedupeKey = item.key) => {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    queue.push(item);
  };

  for (const task of actionLists.overdueTasks || []) push({ key: `task:${task.id}`, kind: 'overdue_task', priority: 0, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Просроченная задача', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.due_at || task.created_at) });
  for (const task of actionLists.todayTasks || []) push({ key: `task:${task.id}`, kind: 'today_task', priority: 1, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Задача на сегодня', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.due_at || task.created_at) });
  for (const participant of actionLists.unpaidParticipants || []) push({ key: `payment:${participant.id}`, kind: 'unpaid', priority: 2, title: participant.nickname || 'Игрок', reason: `Не оплачено ${Math.max(0, Number(participant.amount_due || 0) - Number(participant.amount_paid || 0))} ₽`, actionLabel: 'Оплачено', playerId: participant.player_id, eveningId: participant.evening_id, payload: participant, sortAt: toTime(participant.evening_date || participant.created_at) });

  for (const player of actionLists.newcomersAfterFirst || []) {
    const playerId = player.id || player.player_id;
    push({ key: `newcomer:${playerId}`, kind: 'newcomer_followup', priority: 3, title: player.nickname || 'Игрок', reason: 'После первой игры нужен короткий фидбек', actionLabel: 'Связаться', playerId, payload: player, sortAt: toTime(player.last_visit || player.updated_at) }, `followup:${playerId}`);
  }
  for (const player of actionLists.lapsedPlayers || []) {
    const playerId = player.id || player.player_id;
    push({ key: `lapsed:${playerId}`, kind: 'lapsed_player', priority: 4, title: player.nickname || 'Игрок', reason: 'Давно не был в клубе', actionLabel: 'Связаться', playerId, payload: player, sortAt: toTime(player.last_visit || player.updated_at) }, `followup:${playerId}`);
  }
  for (const task of actionLists.noDeadlineTasks || []) push({ key: `task:${task.id}`, kind: 'undated_task', priority: 5, title: task.player_nickname || task.title, reason: task.player_nickname ? task.title : 'Задача без срока', actionLabel: 'Выполнить', playerId: task.player_id, eveningId: task.evening_id, payload: task, sortAt: toTime(task.created_at) });

  return queue.sort((a, b) => a.priority - b.priority || a.sortAt - b.sortAt || a.title.localeCompare(b.title, 'ru'));
}
