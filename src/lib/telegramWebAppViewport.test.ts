import { describe, expect, it } from 'vitest';
import { resolveExpandedViewportHeight } from './telegramWebAppViewport';

describe('Telegram WebApp viewport recovery', () => {
  it('keeps the previously expanded height when Telegram restores with a stale compact height', () => {
    expect(resolveExpandedViewportHeight({
      current: 590,
      stable: 590,
      browser: 590,
      previousExpanded: 812,
      width: 412,
      previousWidth: 412,
      expandedRoute: true,
    })).toEqual({ height: 812, widthChanged: false });
  });

  it('uses the real browser viewport when Telegram viewportHeight is stale after resume', () => {
    expect(resolveExpandedViewportHeight({
      current: 590,
      stable: 590,
      browser: 812,
      previousExpanded: 0,
      width: 412,
      previousWidth: 412,
      expandedRoute: true,
    })).toEqual({ height: 812, widthChanged: false });
  });

  it('resets the expanded-height cache after a real orientation-sized width change', () => {
    expect(resolveExpandedViewportHeight({
      current: 430,
      stable: 430,
      browser: 430,
      previousExpanded: 812,
      width: 820,
      previousWidth: 412,
      expandedRoute: true,
    })).toEqual({ height: 430, widthChanged: true });
  });

  it('does not force the expanded-height policy onto ordinary non-app routes', () => {
    expect(resolveExpandedViewportHeight({
      current: 590,
      stable: 812,
      browser: 812,
      previousExpanded: 812,
      width: 412,
      previousWidth: 412,
      expandedRoute: false,
    })).toEqual({ height: 590, widthChanged: false });
  });
});
