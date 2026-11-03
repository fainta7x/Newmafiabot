import { describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { ensurePublicationDeliverySchema } from '../server/services/publicationDeliveryService.ts';

// AR05 (2026-11-03): the one-minute workers must not re-run schema DDL and destination upserts on every tick.
const statements = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0]).replace(/\s+/g, ' '));

describe('schema steps run once per connection', () => {
  it('publication delivery: nothing on the second call', async () => {
    const db = createDatabaseConnection(':memory:');
    await ensurePublicationDeliverySchema(db as any);
    const run = vi.spyOn(db, 'run'); const exec = vi.spyOn(db, 'exec');
    await ensurePublicationDeliverySchema(db as any);
    expect(run).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('telegram publishing: no DDL or destination rewrite on the second call, data steps still run', async () => {
    const db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db as any);
    const run = vi.spyOn(db, 'run'); const exec = vi.spyOn(db, 'exec');
    await ensureTelegramPublishingSchema(db as any);
    const all = [...statements(run), ...statements(exec)];
    expect(all.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS telegram_destinations'))).toBe(false);
    expect(all.some((sql) => sql.includes('UPDATE telegram_destinations SET name'))).toBe(false);
    expect(all.some((sql) => sql.includes('DELETE FROM telegram_sync_outbox'))).toBe(true);
  });
});
