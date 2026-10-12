import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureGoMafiaSchema } from '../db/ensureGoMafiaSchema.ts';
import { loadClubOrder } from '../server/services/clubOrderService.ts';

describe('GoMafia requests in «Порядок в клубе»', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); await ensureGoMafiaSchema(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('lists a pending request for the organizer and drops it once confirmed', async () => {
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,game_level,created_at,updated_at) VALUES ('p1','Чагин','normal','normal','club','2026-10-12','2026-10-12')`);
    await db.run(`INSERT INTO gomafia_player_links (player_id,external_player_id,profile_url,status,linked_by,linked_at,updated_at) VALUES ('p1','1202','https://gomafia.pro/stats/1202','pending','player','2026-10-12','2026-10-12')`);
    const item = (await loadClubOrder(db)).items.find((entry) => entry.id === 'gomafia-requests');
    expect(item).toMatchObject({ category: 'profiles', action: { type: 'player', player_id: 'p1' }, action_label: 'Подтвердить' });
    expect(item!.people![0]).toMatchObject({ nickname: 'Чагин', detail: 'https://gomafia.pro/stats/1202' });
    await db.run(`UPDATE gomafia_player_links SET status='verified' WHERE player_id='p1'`);
    expect((await loadClubOrder(db)).items.some((entry) => entry.id === 'gomafia-requests')).toBe(false);
  });
});
