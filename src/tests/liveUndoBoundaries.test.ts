import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');
const centerSource = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');

const sliceFunction = (startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('live-game undo boundaries', () => {
  it('snapshots the exact zero-night state before opening the zero round', () => {
    const block = sliceFunction("if (phase === 'zero_night')", "if (phase === 'day_speeches')");
    const wakeCity = block.indexOf("label: 'Разбудить город'");
    const snapshot = block.indexOf('saveSnapshot();', wakeCity);
    const phaseChange = block.indexOf("setPhase('day_speeches')", wakeCity);

    expect(wakeCity).toBeGreaterThanOrEqual(0);
    expect(snapshot).toBeGreaterThan(wakeCity);
    expect(snapshot).toBeLessThan(phaseChange);
  });

  it('creates only one history boundary when entering revote speeches', () => {
    const block = sliceFunction(
      'const handleGoToRevoteSpeeches = (winners: number[]) => {',
      'const handleLaunchNextRevote = (winners: number[]) => {'
    );

    expect(block).toContain('handleStartTimer(winners[0], 30);');
    expect(block).not.toContain('saveSnapshot();');
  });

  it('lets the shared speech timer own the revote snapshot', () => {
    const block = sliceFunction(
      'const handleStartTimer = (slot: number, duration = 60) => {',
      'const handleStartZeroNightTimer = (sub:'
    );

    expect(block).toContain('saveSnapshot();');
  });

  it('restores the revote-entry boundary even after newer history actions', () => {
    const restoreBlock = sliceFunction(
      'const handleBackFromRevoteSpeeches = () => {',
      'useEffect(() => {\n    try {'
    );
    expect(restoreBlock).toContain("snapshot.votingStage === 'round_result'");
    expect(restoreBlock).toContain('snapshot.activeVotingRoundIndex === activeVotingRoundIndex');
    expect(restoreBlock).toContain('restoreSnapshot(snapshot);');
    expect(restoreBlock).toContain('previous.slice(0, index)');
    expect(restoreBlock).toContain('setIsTimerRunning(false);');
    expect(restoreBlock).toContain('setActiveSpeakerSlot(null);');
  });

  it('uses the targeted revote restore from the first split speech', () => {
    const start = centerSource.indexOf('const handleVotingBack = () => {');
    const end = centerSource.indexOf('const renderNominationChips', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = centerSource.slice(start, end);

    expect(block).toContain("if (votingStage === 'revote_speeches')");
    expect(block).toContain('handleBackFromRevoteSpeeches();');
    expect(block).toContain('setIsTimerRunning(false);');
    expect(block).toContain('setActiveSpeakerSlot(null);');
  });
});
