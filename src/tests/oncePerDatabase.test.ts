import { describe, expect, it, vi } from 'vitest';
import { oncePerDatabase } from '../db/oncePerDatabase.ts';

describe('schema guards run once per database connection', () => {
  it('runs the guard once per connection, shares a concurrent first run and retries after a failure', async () => {
    const guard = vi.fn(async () => {});
    const ensure = oncePerDatabase(guard);
    const a = {} as any;
    const b = {} as any;
    await Promise.all([ensure(a), ensure(a)]);
    await ensure(a);
    await ensure(b);
    expect(guard).toHaveBeenCalledTimes(2);

    let fail = true;
    const flaky = vi.fn(async () => { if (fail) throw new Error('locked'); });
    const ensureFlaky = oncePerDatabase(flaky);
    await expect(ensureFlaky(a)).rejects.toThrow('locked');
    fail = false;
    await ensureFlaky(a);
    await ensureFlaky(a);
    expect(flaky).toHaveBeenCalledTimes(2);
  });
});
