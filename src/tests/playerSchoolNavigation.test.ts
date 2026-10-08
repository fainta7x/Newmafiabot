import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { playerPathForSection } from '../lib/appNavigation.ts';
import { guideTabFromSearch } from '../components/public/PublicGuide.tsx';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('School navigation journey', () => {
  it('opens the School from the persistent fifth cabinet tab without duplicating a player screen', () => {
    expect(playerPathForSection('learning')).toBe('/guide?from=player');
    expect(playerPathForSection('profile', 'tab:learning')).toBe('/player/profile/learning');
    expect(guideTabFromSearch('?from=player&tab=judge-conduct')).toBe('judge-conduct');
    expect(guideTabFromSearch('?tab=invalid')).toBe('home');
  });

  it('retains public guide entry points while preserving the cabinet source query', () => {
    const guide = read('src/components/public/PublicGuide.tsx');
    const app = read('src/App.tsx');
    expect(guide).toContain('PlayerBottomNavigation section="learning"');
    expect(guide).toContain('data-testid="guide-exit-home"');
    expect(guide).toContain('data-testid="guide-exit"');
    expect(guide).toContain('const url = new URL(window.location.href)');
    expect(guide).toContain("['player', 'progress']");
    expect(app).toContain("isRoutePrefix(pathname, '/guide')");
    expect(app).toContain('onNavigate={navigatePath}');
  });

  it('keeps a single catalog and legible routes from home and progress', () => {
    const home = read('src/components/player/PlayerCabinetShell.tsx');
    const legacy = read('src/components/player/PlayerLearningBlock.tsx');
    const profile = read('src/components/player/CanonicalPremiumPlayerProfile.tsx');
    expect(home).toContain("onOpenLearning={() => open('learning')}");
    expect(legacy).toContain('Открыть Школу');
    expect(profile).toContain('data-testid="profile-school-shortcut"');
    expect(legacy).not.toContain('GUIDE_ENTRIES.map');
  });
});
