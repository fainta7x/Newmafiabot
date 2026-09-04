import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('urgent Live Game mobile resume and OBS broadcast chrome', () => {
  it('re-expands an active Telegram Live Game whenever the WebApp becomes visible again', () => {
    const bridge = read('src/components/crm/LiveGameResumeBridge.tsx');
    const main = read('src/main.tsx');

    expect(bridge).toContain('requestTelegramLiveFullscreen');
    expect(bridge).toContain("document.addEventListener('visibilitychange'");
    expect(bridge).toContain("window.addEventListener('pageshow'");
    expect(bridge).toContain('webApp?.expand?.()');
    expect(bridge).toContain("if (document.visibilityState === 'visible')");
    expect(bridge).toContain("document.querySelector('.evening-live-engine-shell')");
    expect(main).toContain('<LiveGameResumeBridge />');
  });

  it('does not let a stale Telegram stable-height collapse the active Live Game surface', () => {
    const css = read('src/components/crm/liveGameUrgentResume.css');
    const main = read('src/main.tsx');

    expect(css).toContain('--live-stable-height: max(var(--tg-viewport-stable-height, 0px), 100dvh)');
    expect(css).toContain('height: 100dvh !important;');
    expect(css).toContain('min-height: 100dvh !important;');
    expect(main).toContain('liveGameUrgentResume.css');
  });

  it('uses a compact top broadcast chrome so the camera remains the dominant 1920x1080 surface', () => {
    const css = read('src/components/public/liveBroadcastCompact.css');
    const main = read('src/main.tsx');

    expect(css).toContain('--broadcast-header-height: 72px');
    expect(css).toContain('--broadcast-info-top: 92px');
    expect(css).toContain('min-height: var(--broadcast-header-height)');
    expect(main).toContain('liveBroadcastCompact.css');
  });
});
