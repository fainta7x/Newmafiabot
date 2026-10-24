import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Open evening» (published or running, not settled) is defined once, in `src/lib/eveningStatus.ts` (owner rule: closed
 * only by an explicit action). New code asks `isOpenEvening` / `openEveningSql`; it does not list the statuses again.
 * The few checks below look at the status only, on purpose (they do not care whether the evening was settled); a new
 * copy must either use the owner module or be added here with the reason.
 */
const ON_PURPOSE: Record<string, { count: number; why: string }> = {
  'src/components/crm/EveningVkCard.vk-direct.tsx': { count: 1, why: 'a button state: it only looks at the status' },
  'src/server/services/eveningShortfallService.ts': { count: 1, why: 'the automatic check looks at the status only' },
  'src/server/services/organizerAgendaService.ts': { count: 1, why: 'the agenda lists by date and status' },
  'src/server/services/premiumPlayerConnectionsService.ts': { count: 1, why: 'invitation list: status only' },
  'src/server/services/vkEveningIntegrationService.ts': { count: 1, why: 'status-only gate of the VK sync' },
  'src/server/services/vkLiveEveningSyncWorker.ts': { count: 1, why: 'the sync worker follows the status' },
  'src/server/routes/playerJudgingRoutes.ts': { count: 1, why: 'judge list: status only, ordered by running first' },
  'src/server/routes/gamesRoutes.ts': { count: 1, why: 'a game may start while the status is open; settlement is checked elsewhere' },
  'src/server/routes/noviceRoutes.ts': { count: 1, why: 'a novice application also has its own time window' },
  'src/server/auth.ts': { count: 1, why: 'status-only access check' },
  'src/scripts/auditEveningRsvpDrift.ts': { count: 1, why: 'a read-only census that names the «open» bucket itself' },
  'src/db/ensureTelegramPublishingSchema.ts': { count: 4, why: 'frozen start-up repair SQL' },
};
const STATUS_ONLY_ON_PURPOSE = Object.fromEntries(Object.entries(ON_PURPOSE).map(([file, entry]) => [file, entry.count]));
const COPY = /status\s+IN\s+\('published',\s*'active'\)|\['published',\s*'active'\]/g;

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'tests' || name === 'node_modules') return [];
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

describe('open evening has one owner', () => {
  it('lists the published/active statuses only in the owner module and the documented status-only checks', () => {
    const found: Record<string, number> = {};
    for (const file of walk('src')) {
      const key = file.replace(/\\/g, '/');
      if (key === 'src/lib/eveningStatus.ts') continue;
      const count = (readFileSync(file, 'utf8').match(COPY) || []).length;
      if (count) found[key] = count;
    }
    expect(found).toEqual(STATUS_ONLY_ON_PURPOSE);
  });
});
