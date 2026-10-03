import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');
const toolbar = readFileSync('src/components/LiveGameEngine/LiveGameJudgeToolbar.tsx', 'utf8');

describe('live speech extension UI wiring', () => {
  it('exposes one judge action for +30 seconds at the cost of two fouls', () => {
    expect(source).toContain('speechExtensionAvailability={speechExtensionAvailability}');
    expect(source).toContain('onSpeechExtension={handleExchangeFoulsForSpeech}');
    expect(toolbar).toContain('data-testid="live-speech-extension"');
    expect(toolbar).toContain('+30с за 2 фола');
    expect(toolbar).toContain('disabled={!speechExtensionAvailability.allowed}');
  });

  it('updates discipline and both current/max timer values atomically', () => {
    expect(source).toContain('exchangeTwoFoulsForSpeech(discipline, String(activeSpeakerSlot))');
    expect(source).toContain('setTimerMax((value) => value + 30)');
    expect(source).toContain('setTimeLeft((value) => value + 30)');
    expect(source).toContain('setIsTimerRunning(true)');
  });

  it('also offers the extension in the centre panel next to the timer, because the judge toolbar is hidden by the engine CSS', () => {
    const centerPanel = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');
    expect(source).toContain('onSpeechExtension: handleExchangeFoulsForSpeech');
    expect(centerPanel).toContain('data-testid="live-hud-speech-extension"');
    expect(centerPanel).toContain('speechExtensionAvailability?.allowed');
  });

  it('lets a revote speech exceed its fixed 30 seconds only after the extension was bought', () => {
    const centerPanel = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');
    expect(source).toContain('setSpeechExtendedSlot(activeSpeakerSlot)');
    expect(source).toContain('speechExtended: speechExtendedSlot !== null && speechExtendedSlot === activeSpeakerSlot');
    expect(centerPanel).toContain('const revoteLimit = 30 + revoteExtensionSeconds');
    expect(centerPanel).toContain('resolveTimerDuration(phase, votingStage, timerMax) + revoteExtensionSeconds');
  });
});
