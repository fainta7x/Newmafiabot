import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('commentators frame browser source', () => {
  it('is served at /broadcast/frame before the token routes, without any server request', () => {
    const app = read('../App.tsx');
    expect(app.indexOf("parts[1] === 'frame'")).toBeGreaterThan(-1);
    expect(app.indexOf("parts[1] === 'frame'")).toBeLessThan(app.indexOf('<LiveBroadcastOverlay token='));
    const frame = read('../components/public/BroadcastCommentatorFrame.tsx');
    expect(frame).not.toContain('fetch(');
    expect(frame).not.toContain('api.');
  });

  it('keeps the page transparent so OBS shows the commentators underneath', () => {
    const css = read('../components/public/broadcastCommentatorFrame.css');
    expect(css).toContain('background: transparent !important');
  });
});
