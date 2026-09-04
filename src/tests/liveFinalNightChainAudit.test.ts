import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEATH_PROTOCOL_SECONDS } from '../components/LiveGameEngine/timerModel.js';

const read = (path: string) => readFileSync(path, 'utf8');

describe('final night chain audit', () => {
  it('keeps 20 seconds as the canonical killed-player protocol duration while accepting legacy 15-second state', () => {
    expect(DEATH_PROTOCOL_SECONDS).toBe(20);
    const center = read('src/components/LiveGameEngine/CenterPanel.tsx');
    expect(center).toContain('DEATH_PROTOCOL_SECONDS');
    expect(center).toContain('Math.max(timeLeft, DEATH_PROTOCOL_SECONDS)');
    expect(center).toContain('Протокол убитого · 15с');
  });

  it('blocks automatic game completion while mandatory final night actions are active', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("postNightStage !== 'none'");
    expect(engine).toContain('activeBestMoveSource !== null');
    expect(engine).toContain('votingFarewellQueue.length > 0');
  });

  it('reconstructs a recovered first-killed best move before winner evaluation can skip it', () => {
    const model = read('src/components/LiveGameEngine/engineStateModel.ts');
    expect(model).toContain("snapshot.phase === 'night' && snapshot.nightSubPhase === 'best_move'");
    expect(model).toContain("recoveringFirstKilledBestMove ? 'first_killed' : null");
    expect(model).toContain('protocolMarkers.firstKilledSlot');
  });

  it('keeps an explicit winner completion action after the death protocol', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("if (postNightStage === 'death_protocol')");
    expect(engine).toContain("return { label: 'Завершить игру', onClick: () => handleEndGameWithWinner(winnerAfterNight) }");
    expect(engine).toContain('localStorage.removeItem("mafia_live_session")');
    expect(engine).toContain('onGameFinished({');
  });
});
