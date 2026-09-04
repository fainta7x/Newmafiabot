import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('urgent Live Game mobile resume and OBS broadcast chrome', () => {
  it('re-expands an active Telegram Live Game whenever the WebApp becomes visible again', () => {
    const modal = read('src/components/crm/EveningLiveGameModal.tsx');

    expect(modal).toContain('requestTelegramLiveFullscreen');
    expect(modal).toContain("document.addEventListener('visibilitychange'");
    expect(modal).toContain("window.addEventListener('pageshow'");
    expect(modal).toContain('webApp.expand?.()');
    expect(modal).toContain("if (document.visibilityState === 'visible')");
  });

  it('keeps the Live Game modal pinned to the actual Telegram viewport after resume', () => {
    const modal = read('src/components/crm/EveningLiveGameModal.tsx');
    expect(modal).toContain('evening-live-fullscreen');

    const css = read('src/components/crm/eveningLiveMobilePolish.css');
    expect(css).toContain('.evening-live-fullscreen');
    expect(css).toContain('100dvh');
  });

  it('uses a compact top broadcast chrome so the camera remains the dominant 1920x1080 surface', () => {
    const css = read('src/components/public/liveBroadcastOverlay.css');
    expect(css).toContain('--broadcast-header-height: 72px');
    expect(css).toContain('--broadcast-info-top: 92px');
  });
});
