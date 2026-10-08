import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('player cabinet scope regressions', () => {
  it('mounts the death protocol bridge only while a Live Game engine is actually present', () => {
    const scoped = read('src/components/crm/ScopedEveningDeathProtocolBridge.tsx');
    const main = read('src/main.tsx');

    expect(scoped).toContain("document.querySelector('.evening-live-engine-shell')");
    expect(scoped).toContain('return active ? <EveningDeathProtocolBridge /> : null;');
    expect(main).toContain('<ScopedEveningDeathProtocolBridge />');
    expect(main).not.toContain('<EveningDeathProtocolBridge />');
  });

  it('keeps judge tools out of the home feed but exposes a deliberate judge-workspace entry', () => {
    const home = read('src/components/player/PlayerHomeDashboard.tsx');
    const quick = read('src/components/player/PlayerQuickAccessBar.tsx');
    const shell = read('src/components/player/PlayerCabinetShell.tsx');

    expect(home).not.toContain('/api/player/judging');
    expect(home).not.toContain('Рабочие инструменты');
    expect(home).not.toContain('Ведение игр');
    expect(home).not.toContain('Управление клубом');
    expect(quick).toContain('data-testid="player-quick-conduct"');
    expect(quick).toContain('<span className="hidden sm:inline">Ведение</span>');
    expect(shell).toContain("const canOpenConduct = player.judge_level !== 'none';");
    expect(shell).toContain("onOpenConduct={() => open('conduct')}");
  });
});
