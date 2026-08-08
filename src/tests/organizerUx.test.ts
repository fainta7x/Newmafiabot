import { describe, expect, it } from 'vitest';
import type { CrmOverview } from '../lib/api.ts';
import { buildTodayActionQueue, ORGANIZER_PRIMARY_NAV } from '../lib/organizerUx.ts';

const makeOverview = (): CrmOverview => ({
  nextEvening: null,
  actionLists: {
    overdueTasks: [
      {
        id: 'task-overdue',
        title: 'Позвонить',
        type: 'call',
        status: 'todo',
        priority: 'high',
        due_at: '2026-08-07T12:00:00.000Z',
        player_id: 'p1',
        player_nickname: 'Alpha',
        created_at: '2026-08-06T12:00:00.000Z',
        updated_at: '2026-08-06T12:00:00.000Z',
      },
    ],
    todayTasks: [
      {
        id: 'task-today',
        title: 'Написать',
        type: 'feedback',
        status: 'todo',
        priority: 'medium',
        due_at: '2026-08-08T13:00:00.000Z',
        player_id: 'p2',
        player_nickname: 'Beta',
        created_at: '2026-08-08T08:00:00.000Z',
        updated_at: '2026-08-08T08:00:00.000Z',
      },
    ],
    noDeadlineTasks: [],
    unconfirmedRegistered: [
      { id: 'ep-registered', player_id: 'p3', nickname: 'Gamma', evening_id: 'e1', registered_at: '2026-08-08T09:00:00.000Z' },
    ],
    unansweredInvites: [
      { id: 'ep-invite', player_id: 'p4', nickname: 'Delta', evening_id: 'e1', created_at: '2026-08-08T10:00:00.000Z' },
    ],
    unpaidParticipants: [
      { id: 'ep-unpaid', player_id: 'p5', nickname: 'Epsilon', evening_id: 'e0', amount_due: 500, amount_paid: 100, evening_date: '2026-08-01T18:00:00.000Z' },
    ],
    newcomersAfterFirst: [
      { id: 'p6', nickname: 'Zeta', last_visit: '2026-08-01T18:00:00.000Z' },
    ],
    lapsedPlayers: [
      { id: 'p6', nickname: 'Zeta duplicate', last_visit: '2026-06-01T18:00:00.000Z' },
      { id: 'p7', nickname: 'Eta', last_visit: '2026-05-01T18:00:00.000Z' },
    ],
    waitlistParticipants: [],
  } as any,
  summary: {
    overdueTasksCount: 1,
    todayTasksCount: 1,
    noDeadlineTasksCount: 0,
    newcomersWithoutFollowupCount: 1,
    lapsedPlayersCount: 2,
    unpaidParticipantsCount: 1,
    totalUnpaidAmount: 400,
  },
});

describe('organizer action-first UX helpers', () => {
  it('keeps exactly four primary navigation destinations', () => {
    expect(ORGANIZER_PRIMARY_NAV.map((item) => item.label)).toEqual(['Сегодня', 'События', 'Игроки', 'Ещё']);
    expect(ORGANIZER_PRIMARY_NAV).toHaveLength(4);
  });

  it('builds one prioritized action queue and removes duplicate player follow-ups', () => {
    const queue = buildTodayActionQueue(makeOverview());

    expect(queue.map((item) => item.kind)).toEqual([
      'overdue_task',
      'today_task',
      'unconfirmed_registration',
      'unanswered_invite',
      'unpaid',
      'newcomer_followup',
      'lapsed_player',
    ]);
    expect(queue.filter((item) => item.playerId === 'p6')).toHaveLength(1);
    expect(queue.find((item) => item.kind === 'unconfirmed_registration')?.actionLabel).toBe('Подтвердить');
    expect(queue.find((item) => item.kind === 'unpaid')?.reason).toContain('400 ₽');
  });

  it('returns an empty queue when overview is not loaded', () => {
    expect(buildTodayActionQueue(null)).toEqual([]);
  });
});
