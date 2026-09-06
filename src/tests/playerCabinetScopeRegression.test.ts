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

  it('keeps conducting and evening-management tools out of the player home dashboard', () => {
    const home = read('src/components/player/PlayerHomeDashboard.tsx');
    const shell = read('src/components/player/PlayerCabinetShell.tsx');

    expect(home).not.toContain('/api/player/judging');
    expect(home).not.toContain('Рабочие инструменты');
    expect(home).not.toContain('Ведение игр');
    expect(home).not.toContain('Управление клубом');
    expect(shell).not.toContain('onOpenConduct={() => open(\'conduct\')}');
  });
});
