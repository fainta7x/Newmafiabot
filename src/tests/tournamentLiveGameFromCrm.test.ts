import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('conducting a tournament game in the Live Game engine from the CRM', () => {
  const base = read('../components/crm/tournaments/TournamentDetailViewBase.tsx');

  it('offers «Вести игру (движок)» for the active game and opens the same engine modal as the judge cabinet', () => {
    expect(base).toContain("import TournamentLiveGameModal from '../../player/TournamentLiveGameModal.tsx'");
    expect(base).toContain('Вести игру (движок)');
    const button = base.slice(base.indexOf('data-testid="tournament-live-game-button"') - 200, base.indexOf('Вести игру (движок)'));
    expect(button).toContain("currentGame.status === 'active'");
    expect(base).toContain("liveGame && liveGame.status === 'active' ? (");
  });

  it('keeps the judge cabinet entry unchanged', () => {
    const judging = read('../components/player/PlayerJudging.tsx');
    expect(judging).toContain('TournamentLiveGameModal');
    expect(judging).toContain('Вести игру');
  });
});
