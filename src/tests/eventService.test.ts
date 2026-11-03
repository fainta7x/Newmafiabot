import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { customEventStatus, eveningEventStatus, listEvents, pokerEventStatus, tournamentEventStatus } from '../server/services/eventService.ts';

// «Событие» — one entity over four tables (docs/ARCHITECTURE_REVIEW_2026-11-03.md).
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('one «Событие» status', () => {
  it('maps every kind onto draft → published → running → completed / cancelled', () => {
    expect([eveningEventStatus({ status: 'draft' }), eveningEventStatus({ status: 'published' }), eveningEventStatus({ status: 'active' }), eveningEventStatus({ status: 'active', settled_at: 'x' }), eveningEventStatus({ status: 'cancelled' })])
      .toEqual(['draft', 'published', 'running', 'completed', 'cancelled']);
    expect([tournamentEventStatus({ status: 'draft' }), tournamentEventStatus({ status: 'draft', published_at: 'x' }), tournamentEventStatus({ status: 'correction' }), tournamentEventStatus({ status: 'completed' })])
      .toEqual(['draft', 'published', 'running', 'completed']);
    expect([customEventStatus({ status: 'published' }), customEventStatus({ status: 'weird' })]).toEqual(['published', 'draft']);
    expect([pokerEventStatus({ status: 'registration' }), pokerEventStatus({ status: 'finished' })]).toEqual(['published', 'completed']);
  });

  it('lists events of every kind in a range, filtered by status', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = '2026-11-03T10:00:00.000Z';
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES
      ('e1','Пятница','2026-11-06T18:00:00.000Z','Europe/Moscow','CASUAL','published',20,0,?,?), ('e2','Черновик','2026-11-07T18:00:00.000Z','Europe/Moscow','CASUAL','draft',20,0,?,?)`, [now, now, now, now]);
    await db.run(`INSERT INTO tournaments (id,title,date,status,published_at,created_at,updated_at) VALUES ('t1','Кубок','2026-11-08','draft',?,?,?)`, [now, now, now]);
    const all = await listEvents(db, { since: '2026-11-01T00:00:00.000Z', until: '2026-12-01T00:00:00.000Z' });
    expect(all.map((e) => [e.key, e.status])).toEqual([['evening:e1', 'published'], ['evening:e2', 'draft'], ['tournament:t1', 'published']]);
    const open = await listEvents(db, { since: '2026-11-01T00:00:00.000Z', until: '2026-12-01T00:00:00.000Z', statuses: ['published', 'running'] });
    expect(open.map((e) => e.key)).toEqual(['evening:e1', 'tournament:t1']);
  });
});
