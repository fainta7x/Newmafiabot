import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { notifyTournamentResultsPublished } from '../server/services/tournamentResultsNotificationService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('results published notification', () => {
  it('tells each participant his place once', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?,?,?,?)', ['p1', 'Игрок', now, now]);
    const rows = [{ player_id: 'p1', place: 2, total_points: 7.5 }, { player_id: null, place: 3, total_points: 1 }];
    expect(await notifyTournamentResultsPublished(db, 't', 'Кубок', 'tok', rows)).toBe(1);
    expect(await notifyTournamentResultsPublished(db, 't', 'Кубок', 'tok', rows)).toBe(0);
    const text = (await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE event_type = 'tournament_results_published'"))?.text;
    expect(text).toContain('Ваше место: 2, баллов: 7.5');
  });
});
