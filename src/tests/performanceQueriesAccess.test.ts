import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { recordSlowQuery, resetPerformanceProbeForTesting } from '../lib/performanceProbe.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); resetPerformanceProbeForTesting(); });

describe('slow SQL statements are shown to organizers only', () => {
  it('keeps SQL text off the open probe and serves it behind the organizer session', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    recordSlowQuery('SELECT * FROM players WHERE id = ?', 120);

    const open = await request(app).get('/api/health/performance');
    expect(open.status).toBe(200);
    expect(JSON.stringify(open.body)).not.toContain('SELECT');

    expect((await request(app).get('/api/health/performance/queries')).status).toBe(401);

    const organizer = await request(app).get('/api/health/performance/queries').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(organizer.status).toBe(200);
    expect(organizer.body.slow_queries.some((item: any) => item.sql === 'SELECT * FROM players WHERE id = ?')).toBe(true);
  });
});
