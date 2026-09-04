import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEATH_PROTOCOL_SECONDS } from '../components/LiveGameEngine/timerModel.js';

const read = (path: string) => readFileSync(path, 'utf8');

describe('final night chain audit', () => {
  it('keeps the death protocol on the canonical 20-second duration in the engine', () => {
    expect(DEATH_PROTOCOL_SECONDS).toBe(20);
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain('DEATH_PROTOCOL_SECONDS');
    expect(engine).toContain('setTimerMax(DEATH_PROTOCOL_SECONDS)');
    expect(engine).toContain('setTimeLeft(DEATH_PROTOCOL_SECONDS)');
    expect(engine).toContain('`Протокол убитого · ${DEATH_PROTOCOL_SECONDS}с`');
  });

  it('blocks automatic game completion while mandatory final night actions are active', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("postNightStage !== 'none'");
    expect(engine).toContain('activeBestMoveSource !== null');
    expect(engine).toContain('votingFarewellQueue.length > 0');
  });

  it('keeps an explicit winner completion action after the death protocol', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("if (postNightStage === 'death_protocol')");
    expect(engine).toContain("return { label: 'Завершить игру', onClick: () => handleEndGameWithWinner(winnerAfterNight) }");
    expect(engine).toContain('localStorage.removeItem("mafia_live_session")');
    expect(engine).toContain('onGameFinished({');
  });
});
