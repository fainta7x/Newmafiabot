import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEST_MOVE_SECONDS, DEATH_PROTOCOL_SECONDS } from '../components/LiveGameEngine/timerModel.js';

describe('live announcement timer buffers', () => {
  it('gives the judge five extra seconds before the best move countdown is effectively over', () => {
    expect(BEST_MOVE_SECONDS).toBe(25);
  });

  it('gives the killed-player protocol twenty seconds including the announcement buffer', () => {
    expect(DEATH_PROTOCOL_SECONDS).toBe(20);
  });

  it('applies the death protocol buffer once and keeps pause/resume idempotent', () => {
    const source = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');
    expect(source).toContain("customTimerLabel?.startsWith('Протокол убитого')");
    expect(source).toContain('!deathProtocolBufferedRef.current');
    expect(source).toContain('deathProtocolBufferedRef.current = true');
    expect(source).toContain('Math.max(timeLeft, DEATH_PROTOCOL_SECONDS)');
  });

  it('shows the updated durations in the judge UI', () => {
    const source = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');
    expect(source).toContain('ЛХ · {BEST_MOVE_SECONDS} секунд');
    expect(source).toContain('Протокол убитого · ${DEATH_PROTOCOL_SECONDS}с');
  });
});
