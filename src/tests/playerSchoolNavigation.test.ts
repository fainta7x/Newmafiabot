import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appBackTarget, playerPathForSection } from '../lib/appNavigation.ts';
import { guideTabFromSearch } from '../components/public/PublicGuide.tsx';
import { PLAYER_CABINET_NAV } from '../components/player/playerCabinetNavigation.ts';

const read = (name: string) => fs.readFileSync(path.resolve(process.cwd(),name),'utf8');

describe('Player Progress and learning navigation', () => {
  it('keeps the original four cabinet destinations and routes Learning through Progress', () => {
    expect(PLAYER_CABINET_NAV.map((item)=>item.label)).toEqual(['Главная','Вечера','Сообщество','Прогресс']);
    expect(playerPathForSection('profile','tab:learning')).toBe('/player/profile/learning');
    expect(appBackTarget('/guide')).toBe('/player/events');
    expect(guideTabFromSearch('?from=progress&tab=judge-conduct')).toBe('judge-conduct');
  });

  it('groups eight profile views into five visible destinations without dropping old deep links', () => {
    const profile=read('src/components/player/CanonicalPremiumPlayerProfile.tsx');
    expect(profile).toContain("['games','Карьера']");
    expect(profile).toContain("['awards','Награды']");
    expect(profile).toContain("['learning','Обучение']");
    expect(profile).toContain("value==='roles'||value==='elo'?'games'");
    expect(profile).toContain("value==='history'?'awards'");
    expect(profile).toContain("grid-cols-5");
    expect(profile).toContain('aria-label={isSelf?\'Разделы прогресса\'');
    for (const tab of ['games','roles','elo','awards','history','connections','learning']) {
      expect(playerPathForSection('profile','tab:'+tab)).toBe('/player/profile/'+tab);
    }
  });

  it('opens one categorized education catalog and returns to Progress', () => {
    const learning=read('src/components/player/PlayerLearningBlock.tsx');
    const guide=read('src/components/public/PublicGuide.tsx');
    const shell=read('src/components/player/PlayerCabinetShell.tsx');
    const app=read('src/App.tsx');
    expect(learning).toContain('data-testid="player-learning-judge"');
    for (const id of ['lessons','trainers','reference']) expect(learning).toContain("id:'"+id+"'");
    expect(learning).toContain('/guide?from=progress&tab=');
    expect(shell).toContain("onOpenLearning={() => open('profile', 'tab:learning')}");
    expect(guide).toContain('PlayerBottomNavigation section="profile"');
    expect(guide).toContain('Вернуться в Прогресс');
    expect(guide).toContain('data-testid="guide-exit"');
    expect(app).toContain("isRoutePrefix(pathname, '/guide')");
  });
});
