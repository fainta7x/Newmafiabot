import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { loadEveningRoute } from '../server/services/eveningRouteService.ts';
import { weeklyAnnouncementDueMs } from '../lib/weeklyAnnouncementDue.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

describe('evening route: open registration is not an announcement', () => {
  it('says the Friday announcement goes out on Monday at 19:00 until it is due', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev', 'Вечер', '2026-10-02T21:00:00+03:00', 'Europe/Moscow', 'CASUAL', 'published', 20, 100, ?, ?)`,
      [now, now],
    );
    expect(new Date(weeklyAnnouncementDueMs('2026-10-02T21:00:00+03:00')).toISOString()).toBe('2026-09-28T16:00:00.000Z');

    const before = await loadEveningRoute(db, 'ev', Date.parse('2026-09-28T11:00:00Z'));
    const steps = before.stages.flatMap((stage) => stage.steps) as Array<{ id: string; title: string; detail?: string; status: string }>;
    expect(steps.find((step) => step.id === 'publish')?.title).toBe('Запись в приложении открыта');
    const posts = steps.find((step) => step.id === 'posts');
    expect(posts?.detail).toBe('Ещё не отправлен. Уйдёт сам 28 сентября в 19:00');
    expect(posts?.status).toBe('todo');

    const after = await loadEveningRoute(db, 'ev', Date.parse('2026-09-28T17:00:00Z'));
    const late = (after.stages.flatMap((stage) => stage.steps) as Array<{ id: string; status: string }>).find((step) => step.id === 'posts');
    expect(late?.status).toBe('attention');

    await db.run("UPDATE game_evenings SET status = 'draft' WHERE id = 'ev'");
    const draft = await loadEveningRoute(db, 'ev', Date.parse('2026-09-28T11:00:00Z'));
    const draftPosts = (draft.stages.flatMap((stage) => stage.steps) as Array<{ id: string; detail?: string }>).find((step) => step.id === 'posts');
    expect(draftPosts?.detail).toBe('Уйдёт сам после открытия записи');
  });
});
