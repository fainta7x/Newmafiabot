import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';

const mocks = vi.hoisted(() => ({ queuePersonalNotification: vi.fn() }));
vi.mock('../server/services/personalNotificationRouterService.ts', () => ({
  queuePersonalNotification: mocks.queuePersonalNotification,
}));

import { notifyBettingSpectators } from '../server/services/bettingNotificationService.ts';

const roleSnapshot = Array.from({ length: 10 }, (_, index) => ({
  seat_number: index + 1,
  participant_id: `participant-${index + 1}`,
  player_id: `playing-${index + 1}`,
  nickname: `Playing ${index + 1}`,
  role: index === 0 ? 'sheriff' as const : index === 1 ? 'don' as const : index < 4 ? 'mafia' as const : 'citizen' as const,
  team: index > 0 && index < 4 ? 'black' as const : 'red' as const,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queuePersonalNotification.mockImplementation(async (_db: unknown, input: any) => ({
    created: true,
    delivery: { selected_channel: input.playerId === 'vk-only' ? 'vk' : 'telegram', status: input.playerId === 'vk-only' ? 'pending_channel' : 'queued' },
  }));
});

describe('betting-open personal channel routing', () => {
  it('includes VK-only spectators, excludes players/judge, and queues once per canonical player', async () => {
    const db = {
      exec: vi.fn(async () => {}),
      run: vi.fn(async () => ({ changes: 1, lastID: null })),
      get: vi.fn(async () => null),
      all: vi.fn(async (sql: string) => {
        if (sql.includes('FROM players p')) {
          return [
            { id: 'playing-1', nickname: 'In game' },
            { id: 'judge', nickname: 'Judge' },
            { id: 'vk-only', nickname: 'VK only' },
            { id: 'dual-linked', nickname: 'Dual' },
          ];
        }
        if (sql.includes('FROM personal_notification_deliveries')) {
          return [
            { selected_channel: 'vk', status: 'pending_channel', reason: null },
            { selected_channel: 'telegram', status: 'queued', reason: null },
          ];
        }
        if (sql.includes('FROM telegram_message_outbox')) return [{ status: 'pending' }];
        if (sql.includes('FROM vk_message_outbox')) return [{ status: 'pending', failure_kind: null }];
        return [];
      }),
      transaction: vi.fn(),
      sqlite: {} as any,
      drizzle: {} as any,
      dbPath: ':memory:',
    } as unknown as DatabaseWrapper;

    const result = await notifyBettingSpectators(db, {
      poolId: 'pool-1',
      gameId: 42,
      gameNumber: 7,
      closesAt: new Date(Date.now() + 90_000).toISOString(),
      judgePlayerId: 'judge',
      roleSnapshot,
      webAppUrl: 'https://club.example/player',
    });

    expect(mocks.queuePersonalNotification).toHaveBeenCalledTimes(2);
    const queued = mocks.queuePersonalNotification.mock.calls.map((call) => call[1]);
    expect(queued.map((item) => item.playerId).sort()).toEqual(['dual-linked', 'vk-only']);
    expect(queued.map((item) => item.notificationKey).sort()).toEqual([
      'betting-open:pool-1:dual-linked',
      'betting-open:pool-1:vk-only',
    ]);
    expect(queued.every((item) => item.actionPath === '/player')).toBe(true);
    expect(queued.every((item) => item.telegramReplyMarkup?.inline_keyboard?.[0]?.[0]?.web_app?.url === 'https://club.example/player')).toBe(true);
    expect(result).toMatchObject({ eligible: 2, queued: 2, sent: 0, failed: 0 });
  });

  it('uses the canonical router instead of direct Telegram outbox delivery', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync('src/server/services/bettingNotificationService.ts', 'utf8'));
    expect(source).toContain('queuePersonalNotification');
    expect(source).not.toContain('enqueueTelegramMessage');
    expect(source).not.toContain("WHERE telegram_user_id IS NOT NULL");
  });
});
