import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('player cabinet legacy decoupling', () => {
  it('keeps the active player shell independent from PlayerCabinetShellLegacy', () => {
    const shell = read('src/components/player/PlayerCabinetShell.tsx');
    expect(shell).not.toContain('PlayerCabinetShellLegacy');
    expect(shell).toContain("import PlayerConductCenter from './PlayerConductCenter.tsx'");
    expect(shell).toContain("section === 'conduct'");
  });

  it('keeps the games hub independent from PlayerCabinetShellLegacy', () => {
    const games = read('src/components/player/PlayerGamesHub.tsx');
    expect(games).not.toContain('PlayerCabinetShellLegacy');
    expect(games).toContain("import PlayerHistoryStatsView from './PlayerHistoryStatsView.tsx'");
    expect(games).toContain("next === 'games' || next === 'stats'");
  });

  it('keeps conduct mode as the single owner of staff tools', () => {
    const conduct = read('src/components/player/PlayerConductCenter.tsx');
    expect(conduct).toContain('JudgeGameLauncher');
    expect(conduct).toContain('PlayerJudging');
    expect(conduct).toContain('JudgeMusicPlaylist');
    const profile = read('src/components/player/PlayerProfileSettings.tsx');
    expect(profile).not.toContain('JudgeGameLauncher');
    expect(profile).not.toContain('JudgeMusicPlaylist');
  });
});
