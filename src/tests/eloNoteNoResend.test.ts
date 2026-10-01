import { afterEach, describe, expect, it, vi } from 'vitest';

const timeline: any[] = [];
vi.mock('../server/services/playerEloHistoryService.ts', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  loadPlayerEloHistory: async () => timeline,
}));

const { createApp } = await import('../app.ts');
const { createDatabaseConnection } = await import('../db/index.ts');
const { ensurePersonalNotificationRoutingSchema } = await import('../db/ensurePersonalNotificationRoutingSchema.ts');
const { reconcilePersonalNotifications } = await import('../server/services/personalTelegramNotificationService.ts');

const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); timeline.length = 0; });

const tournamentGame = (id: string, sortAt: string, eloAfter: number) => ({
  source: 'tournament', sourceId: id, sortAt,
  players: [{ playerId: 'hero', totalDelta: eloAfter - 1000, eloBefore: 1000, eloAfter }],
});
const notes = (db: any) => db.all("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'elo_change'");

describe('tournament Elo note', () => {
  it('is sent once per game: a recalculation with new numbers does not send it again', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,created_at,updated_at) VALUES ('hero','Герой','100','normal','telegram',?,?)`, [now, now]);

    timeline.push(tournamentGame('g1', now, 1010));
    await reconcilePersonalNotifications(db);
    expect(await notes(db)).toHaveLength(1);

    // The ×5 scale rebuild: same game, other numbers.
    timeline.splice(0, 1, tournamentGame('g1', now, 1050));
    await reconcilePersonalNotifications(db);
    expect(await notes(db)).toHaveLength(1);
  });

  it('skips a game already noted under the old key and games older than a week', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,created_at,updated_at) VALUES ('hero','Герой','100','normal','telegram',?,?)`, [now, now]);
    await ensurePersonalNotificationRoutingSchema(db);
    await db.run(`INSERT INTO personal_notification_deliveries (notification_key, player_id, category, event_type, entity_id, selected_channel, text, status, created_at, updated_at)
      VALUES ('elo:tournament:g1:hero:101000', 'hero', 'results', 'elo_change', 'tournament:g1', 'telegram', 'old', 'queued', ?, ?)`, [now, now]);

    timeline.push(tournamentGame('g1', now, 1050), tournamentGame('old', '2026-08-01T18:00:00.000Z', 1020));
    await reconcilePersonalNotifications(db);
    expect((await notes(db)).map((row: any) => row.notification_key)).toEqual(['elo:tournament:g1:hero:101000']);
  });
});
