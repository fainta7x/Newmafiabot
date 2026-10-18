import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/LiveGameEngine.tsx', import.meta.url), 'utf8');
const centerSource = readFileSync(new URL('../components/LiveGameEngine/CenterPanel.tsx', import.meta.url), 'utf8');

describe('live player action availability', () => {
  it('opens the player sheet by a tap, a long press on the card and the keys in every phase', () => {
    // The header selector is gone (owner, 2026-10-18): a tap, a long press on the card and the keys open the same sheet.
    expect(centerSource).not.toContain('live-player-actions-center-selector');
    expect(source).toContain('onOpenPlayerActions={setActionPlayerSlot}');
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
});
