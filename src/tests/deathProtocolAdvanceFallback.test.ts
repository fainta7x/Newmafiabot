import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overlay = readFileSync('src/components/crm/EveningDeathProtocolOverlay.tsx', 'utf8');
const engine = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');

describe('death protocol overlay never leaves the game stuck', () => {
  it('asks the engine to move on when its own button cannot be found', () => {
    expect(overlay).toContain("new CustomEvent('live-engine:advance-after-death-protocol')");
    expect(overlay).toContain('if (attempt === 10)');
    expect(engine).toContain("window.addEventListener('live-engine:advance-after-death-protocol', handler)");
  });

  it('the engine ends the game on a winner and otherwise goes to the day', () => {
    expect(engine).toContain('if (winnerAfterNight) handleEndGameWithWinner(winnerAfterNight);');
    expect(engine).toContain('else finishNightToDay();');
    expect(engine).toContain("if (phase !== 'night' || postNightStage !== 'death_protocol') return;");
  });
});
