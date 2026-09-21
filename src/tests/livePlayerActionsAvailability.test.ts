import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/LiveGameEngine.tsx', import.meta.url), 'utf8');
const toolbarSource = readFileSync(new URL('../components/LiveGameEngine/LiveGameJudgeToolbar.tsx', import.meta.url), 'utf8');
const playerListSource = readFileSync(new URL('../components/LiveGameEngine/LiveGamePlayerList.tsx', import.meta.url), 'utf8');
const centerSource = readFileSync(new URL('../components/LiveGameEngine/CenterPanel.tsx', import.meta.url), 'utf8');

describe('live player action availability', () => {
  it('keeps an explicit player-actions entry point throughout an active game', () => {
    expect(toolbarSource).toContain('data-testid="live-player-actions-selector"');
    expect(toolbarSource).toContain('aria-label="Действия игрока"');
    expect(toolbarSource).toContain('if (slot) onSelectPlayer(slot);');
    expect(source).toContain('onSelectPlayer={setActionPlayerSlot}');
    expect(source).toContain('onOpenPlayerActions: setActionPlayerSlot');
    expect(centerSource).toContain('data-testid="live-player-actions-center-selector"');
    expect(centerSource).toContain("phase === 'day_speeches' || phase === 'day_voting'");
    expect(centerSource).toContain('onOpenPlayerActions?.(slot)');
  });

  it('does not phase-gate the player action sheet to ordinary day speeches', () => {
    expect(source).toContain('player={actionPlayer}');
    expect(source).not.toContain("player={phase === 'day_speeches' || farewellActionOpen ? actionPlayer : null}");
    expect(source).toContain("nominationBlockedBySpeaker={phase !== 'day_speeches' || nominationBlockedBySpeaker}");
  });

  it('preserves vote and night target card taps while opening actions in non-conflicting phases', () => {
    expect(source).toContain("if (phase === 'night') {");
    expect(source).toContain("if (phase === 'day_voting' && votingStage === 'collecting') {");
    expect(source).toMatch(/if \(phase === 'day_voting' && votingStage === 'collecting'\)[\s\S]*?handleInteractiveVoteToggle\(slot\);[\s\S]*?return;[\s\S]*?setActionPlayerSlot\(slot\);/);
  });

  it('opens player actions from list mode too', () => {
    expect(source).toContain('<LiveGamePlayerList activePlayers={activePlayers} onSelectPlayer={setActionPlayerSlot} />');
    expect(playerListSource).toContain('onClick={() => onSelectPlayer(player.slot_num)}');
    expect(playerListSource).toContain('Открыть действия игрока');
  });
});
