import { describe, expect, it } from 'vitest';
import { renderPng, renderPngAsync, birthdayCardSvg } from '../server/services/clubResultImages.ts';

describe('card drawing does not block the server (AR05, 2026-11-09)', () => {
  it('the async drawing gives the same picture as the synchronous one', async () => {
    const svg = birthdayCardSvg({ nickname: 'Игрок', avatar: null, dateLabel: '9 ноября' });
    const sync = renderPng(svg);
    const asynchronous = await renderPngAsync(svg);
    expect([...asynchronous.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
    expect(asynchronous.length).toBe(sync.length);
    expect(asynchronous.equals(sync)).toBe(true);
  });

  it('the event loop keeps running while a card is drawn', async () => {
    // a heavy card: many blurred circles make the drawing take tens of milliseconds
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#111"/>${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 37) % 1000}" cy="${(i * 91) % 1000}" r="${80 + (i % 40)}" fill="#c9a24a" fill-opacity="0.4" filter="url(#b)"/>`).join('')}<defs><filter id="b"><feGaussianBlur stdDeviation="14"/></filter></defs></svg>`;
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 5);
    const started = Date.now();
    await renderPngAsync(svg);
    const took = Date.now() - started;
    clearInterval(timer);
    // a blocking drawing would let almost no tick through; with the thread pool the ticks keep coming
    expect(took).toBeGreaterThan(30);
    expect(ticks).toBeGreaterThan(Math.floor(took / 5 / 3));
  });
});
