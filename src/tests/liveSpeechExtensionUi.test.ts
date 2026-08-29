import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');

describe('live speech extension UI wiring', () => {
  it('exposes one judge action for +30 seconds at the cost of two fouls', () => {
    expect(source).toContain('data-testid="live-speech-extension"');
    expect(source).toContain('+30с за 2 фола');
    expect(source).toContain('disabled={!speechExtensionAvailability.allowed}');
  });

  it('updates discipline and both current/max timer values atomically', () => {
    expect(source).toContain('exchangeTwoFoulsForSpeech(discipline, String(activeSpeakerSlot))');
    expect(source).toContain('setTimerMax((value) => value + 30)');
    expect(source).toContain('setTimeLeft((value) => value + 30)');
    expect(source).toContain('setIsTimerRunning(true)');
  });
});
