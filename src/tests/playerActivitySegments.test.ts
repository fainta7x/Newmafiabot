import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPlayerActivitySegment, sortPlayersForActivity } from '../lib/playerActivitySegments.ts';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

const player = (overrides: Record<string, unknown> = {}) => ({
  id: 'p',
  nickname: 'Игрок',
  contact_status: 'normal',
  engagement_stage: 'returning',
  attendance_count: 2,
  days_since_last_visit: 10,
  open_tasks_count: 0,
  ...overrides,
});

describe('CRM player activity segmentation', () => {
  it('treats recent visitors as active and 4+ recent visits as loyal', () => {
    expect(getPlayerActivitySegment(player())).toBe('active');
    expect(getPlayerActivitySegment(player({ engagement_stage: 'regular', attendance_count: 7 }))).toBe('loyal');
  });

  it('keeps old visitors and leads out of the default active list', () => {
    expect(getPlayerActivitySegment(player({ engagement_stage: 'inactive', days_since_last_visit: 70 }))).toBe('inactive');
    expect(getPlayerActivitySegment(player({ engagement_stage: 'lead', attendance_count: 0, days_since_last_visit: null }))).toBe('lead');
  });

  it('ranks the most loyal and recent players first', () => {
    const sorted = sortPlayersForActivity([
      player({ id: 'returning', nickname: 'Returning', attendance_count: 3, engagement_stage: 'returning', days_since_last_visit: 3 }),
      player({ id: 'loyal-old', nickname: 'Loyal 5', attendance_count: 5, engagement_stage: 'regular', days_since_last_visit: 12 }),
      player({ id: 'loyal', nickname: 'Loyal 9', attendance_count: 9, engagement_stage: 'regular', days_since_last_visit: 8 }),
    ] as any[]);
    expect(sorted.map((item) => item.id)).toEqual(['loyal', 'loyal-old', 'returning']);
  });

  it('defaults the players hub to active clients and exposes loyalty / archive quick filters', () => {
    const source = read('src/components/crm/PlayersActivityCRM.tsx');
    const hub = read('src/components/crm/PlayersHubCRM.tsx');
    expect(source).toContain("type QuickFilter = 'active' | 'loyal' | 'attention' | 'lapsed' | 'all'");
    expect(source).toContain("useState<QuickFilter>('active')");
    expect(source).toContain("{ id: 'active', label: 'Активные' }");
    expect(source).toContain("{ id: 'loyal', label: 'Лояльные' }");
    expect(source).toContain("{ id: 'all', label: 'Вся база' }");
    expect(source).toContain("api.getPlayers(buildParams('newcomer'))");
    expect(source).toContain("api.getPlayers(buildParams('returning'))");
    expect(source).toContain("api.getPlayers(buildParams('regular'))");
    expect(hub).toContain('<PlayersActivityCRM');
  });

  it('keeps detailed lifecycle filters in the sheet and protects mobile sheets from bottom navigation overlap', () => {
    const playersSource = read('src/components/crm/PlayersActivityCRM.tsx');
    const sheetSource = read('src/components/ui/MobileSheet.tsx');
    expect(playersSource).toContain('<option value="newcomer">Новичок</option>');
    expect(playersSource).toContain('<option value="returning">Вернувшийся</option>');
    expect(playersSource).toContain('<option value="regular">Постоянный</option>');
    expect(playersSource).not.toContain('Точные сегменты сохранены, но не занимают основной экран.');
    expect(sheetSource).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
  });
});
