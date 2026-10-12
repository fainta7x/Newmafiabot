import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { colourOf } from '../server/services/projectBoardService.ts';

describe('project board API (read-only CRM screen)', () => {
  let db: DatabaseWrapper;
  let app: any;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); app = await createApp(db); });
  afterEach(() => { vi.unstubAllGlobals(); try { db.sqlite.close(); } catch {} });
  const organizer = () => `organizer_token=${generateOrganizerToken()}`;

  it('is for the organizer only and returns cards from docs/PROJECT_STATE.md', async () => {
    expect((await request(app).get('/api/project-board')).status).toBe(401);
    const response = await request(app).get('/api/project-board').set('Cookie', organizer());
    expect(response.status).toBe(200);
    expect(response.body.source).toBe('docs/PROJECT_STATE.md');
    expect(response.body.cards.filter((card: any) => card.status === 'waiting').length).toBeGreaterThan(3);
  });

  it('lists pull requests with the club colours and whose they are, and says so when GitHub is down', async () => {
    const pulls = [
      { number: 2, title: 'Покер', html_url: 'u2', state: 'open', merged_at: null, updated_at: '2026-10-12T10:00:00Z', head: { ref: 'claude/x', sha: 's2' }, body: '' },
      { number: 1, title: 'GoMafia', html_url: 'u1', state: 'closed', merged_at: '2026-10-12T09:00:00Z', updated_at: '2026-10-12T09:00:00Z', head: { ref: 'feat/gomafia', sha: 's1' }, body: '' },
    ];
    const passed = ['Release gate', 'Secret scan', 'Analyze (javascript-typescript)', 'Analyze (python)'].map((name) => ({ name, status: 'completed', conclusion: 'success' }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/check-runs') ? { check_runs: passed } : pulls), { status: 200 })));
    const response = await request(app).get('/api/project-board/pulls').set('Cookie', organizer());
    expect(response.status).toBe(200);
    expect(response.body.pulls).toMatchObject([
      { number: 2, colour: 'ready', author: 'claude', state: 'open', checks: { passed: 4, total: 4 } },
      { number: 1, colour: 'merged', author: 'gpt', state: 'merged', checks: null },
    ]);
  });

  it('colours: running checks are yellow, a failed one red, closed grey', () => {
    expect(colourOf({ state: 'open' }, [{ name: 'Release gate', status: 'in_progress', conclusion: null }]).colour).toBe('working');
    expect(colourOf({ state: 'open' }, [{ name: 'Secret scan', status: 'completed', conclusion: 'failure' }]).colour).toBe('failed');
    expect(colourOf({ state: 'closed', merged_at: null }, []).colour).toBe('closed');
  });
});
