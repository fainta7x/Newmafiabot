import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPlayerActivitySegment, getPlayerStatusSegment, isClubPlayer, sortPlayersForActivity } from '../lib/playerActivitySegments.ts';

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

  it('splits the base by the organizer statuses from «Роли»', () => {
    expect(getPlayerStatusSegment({ game_level: 'club', club_role: 'member' })).toBe('regular');
    expect(getPlayerStatusSegment({ game_level: 'club', attends_sometimes: 1 })).toBe('sometimes');
    expect(getPlayerStatusSegment({ game_level: 'tournament', from_other_city: 1 })).toBe('other_city');
    expect(getPlayerStatusSegment({ game_level: 'novice', club_role: 'member' })).toBe('novice');
    expect(getPlayerStatusSegment({ game_level: 'novice', stopped_attending: 1 })).toBe('stopped');
    expect(getPlayerStatusSegment({ game_level: 'club', contact_status: 'paused', pause_reason: 'Перестал ходить' })).toBe('stopped');
    expect(isClubPlayer({ stored_lifecycle_status: 'archived' })).toBe(false);
    expect(isClubPlayer({ source: 'legacy_guest_migrated' })).toBe(false);
    expect(isClubPlayer({ stored_lifecycle_status: 'normal' })).toBe(true);
  });

  it('shows the status tabs with «Вся база» last and protects mobile sheets from bottom navigation overlap', () => {
    const source = read('src/components/crm/PlayersActivityCRM.tsx');
    const hub = read('src/components/crm/PlayersHubCRM.tsx');
    const sheetSource = read('src/components/ui/MobileSheet.tsx');
    expect(source).toContain("useState<QuickFilter>('regular')");
    expect(source.indexOf("label: 'Постоянные'")).toBeLessThan(source.indexOf("label: 'Вся база'"));
    expect(source).toContain("label: 'Перестали'");
    expect(source).not.toContain("label: 'Активные'");
    expect(hub).toContain('<PlayersActivityCRM');
    expect(sheetSource).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
  });
});
