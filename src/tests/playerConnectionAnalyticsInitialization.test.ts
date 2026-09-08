import { describe, expect, it, vi } from 'vitest';
import { ensurePlayerConnectionAnalyticsRevision } from '../server/services/playerConnectionAnalyticsService.ts';

describe('player connection analytics schema initialization', () => {
  it('initializes revision schema and triggers only once per database connection', async () => {
    const run = vi.fn(async () => ({ changes: 0 }));
    const db = { run } as any;

    await Promise.all([
      ensurePlayerConnectionAnalyticsRevision(db),
      ensurePlayerConnectionAnalyticsRevision(db),
    ]);
    const firstCount = run.mock.calls.length;
    expect(firstCount).toBeGreaterThan(2);

    await ensurePlayerConnectionAnalyticsRevision(db);
    expect(run.mock.calls.length).toBe(firstCount);
  });
});
