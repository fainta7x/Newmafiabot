import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner, 2026-11-07: the Don and the Sheriff may check a player who has left the table; only the shot needs a living player.
describe('night checks of a player who left the table', () => {
  const engine = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');
  const night = engine.slice(engine.indexOf('const handleSeatClick = (slot: number) => {'), engine.indexOf('const getNextStepInfo = () => {'));
  it('a dead player is refused only for the shot', () => {
    expect(night).not.toContain("if (postNightStage !== 'none' || !player.alive) return;");
    const shooting = night.slice(night.indexOf("if (nightSubPhase === 'shooting') {"), night.indexOf("if (nightSubPhase === 'don') {"));
    expect(shooting).toContain('if (!player.alive) return;');
    const checks = night.slice(night.indexOf("if (nightSubPhase === 'don') {"));
    expect(checks).not.toContain('player.alive');
  });
});
