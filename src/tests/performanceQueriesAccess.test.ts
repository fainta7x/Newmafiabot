import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { recordSlowQuery, resetPerformanceProbeForTesting } from '../lib/performanceProbe.ts';
import { summariseCpuProfile } from '../server/services/cpuProfileService.ts';

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

  it('serves a short CPU profile to organizers only, with the busy stretch and its stack', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    expect((await request(app).get('/api/health/performance/profile?seconds=5')).status).toBe(401);
    const organizer = await request(app).get('/api/health/performance/profile?seconds=5').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(organizer.status).toBe(200);
    expect(organizer.body.seconds).toBe(5);
    expect(organizer.body.profile.sampled_ms).toBeGreaterThan(1000);
  }, 20_000);
});

describe('CPU profile summary', () => {
  it('adds self time per function and finds the longest busy stretch with its callers', () => {
    const frame = (functionName: string, url = '') => ({ functionName, url, lineNumber: 9 });
    const summary = summariseCpuProfile({
      nodes: [
        { id: 1, callFrame: frame('(root)'), children: [2, 3] },
        { id: 2, callFrame: frame('(idle)') },
        { id: 3, callFrame: frame('runScan', 'file:///app/src/server/services/scan.ts'), children: [4] },
        { id: 4, callFrame: frame('renderPng', 'file:///app/src/server/services/images.ts') },
      ],
      samples: [2, 4, 4, 3, 2, 4],
      timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000],
    });
    expect(summary.top_self[0]).toEqual({ fn: 'renderPng src/server/services/images.ts:10', ms: 3 });
    expect(summary.longest_busy[0].ms).toBe(3);
    expect(summary.longest_busy[0].hottest[0].stack).toEqual(['renderPng src/server/services/images.ts:10', 'runScan src/server/services/scan.ts:10']);
  });
});

