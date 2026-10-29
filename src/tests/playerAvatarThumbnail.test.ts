// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarPixelSize, prepareAvatarThumbnail } from '../lib/playerAvatarThumbnail.ts';

function imageSource(width: number, height: number, fail = false) {
  const decoded = vi.fn();
  vi.stubGlobal('Image', class {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { decoded(); queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
  });
  return decoded;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('avatar display thumbnails', () => {
  it('uses physical pixel density without under-sizing Retina displays', () => {
    expect(avatarPixelSize(48, 1)).toBe(48);
    expect(avatarPixelSize(48, 2)).toBe(96);
    expect(avatarPixelSize(80, 3)).toBe(240);
    expect(avatarPixelSize(48, NaN)).toBe(48);
  });

  it('downsamples a large portrait in stages with smoothing, preserves aspect and shares concurrent work', async () => {
    const decoded = imageSource(2048, 1768);
    const draws: Array<{ width: number; height: number; enabled: boolean; quality: string }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      const { width, height } = this;
      const ctx = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage() {
        draws.push({ width, height, enabled: ctx.imageSmoothingEnabled, quality: ctx.imageSmoothingQuality });
      } };
      return ctx as unknown as CanvasRenderingContext2D;
    });
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;small');
    const source = 'data:image/jpeg;base64,large-portrait';
    const a = prepareAvatarThumbnail(source, 48);
    const b = prepareAvatarThumbnail(source, 48);
    expect(a).toBe(b);
    expect(await a).toBe('data:image/png;small');
    expect(decoded).toHaveBeenCalledTimes(1);
    expect(draws.length).toBeGreaterThan(3);
    expect(draws.every(d => d.enabled && d.quality === 'high')).toBe(true);
    expect(draws.at(-1)).toMatchObject({ width: 56, height: 48 });
    expect(encode).toHaveBeenCalledWith('image/png');
    await prepareAvatarThumbnail(source, 96);
    expect(draws.at(-1)).toMatchObject({ width: 111, height: 96 });
    expect(decoded).toHaveBeenCalledTimes(2);
  });

  it('does not enlarge small sources or start requests for external images', async () => {
    const decoded = imageSource(32, 32);
    const source = 'data:image/jpeg;base64,small-portrait';
    expect(await prepareAvatarThumbnail(source, 96)).toBe(source);
    expect(await prepareAvatarThumbnail('https://example.invalid/avatar.jpg', 48)).toBe('https://example.invalid/avatar.jpg');
    expect(decoded).toHaveBeenCalledTimes(1);
  });

  it('retains the original if decoding or a canvas is unavailable', async () => {
    imageSource(2048, 1381, true);
    const broken = 'data:image/jpeg;base64,decode-failure';
    expect(await prepareAvatarThumbnail(broken, 48)).toBe(broken);
    imageSource(2048, 1381);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fallback = 'data:image/jpeg;base64,no-canvas';
    expect(await prepareAvatarThumbnail(fallback, 48)).toBe(fallback);
  });
});
