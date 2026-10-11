// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { appBackTarget } from '../lib/appNavigation.ts';

afterEach(() => window.history.pushState({}, '', '/'));

describe('where the guide goes back to, by the screen it was opened from', () => {
  it.each([
    ['/guide?tab=lessons', '/player/events'],
    ['/guide?from=progress&tab=judge-conduct', '/player/profile/learning'],
    ['/guide?from=conduct&tab=judge-conduct', '/player/conduct'],
  ])('%s -> %s', (url, expected) => {
    window.history.pushState({}, '', url);
    expect(appBackTarget('/guide')).toBe(expected);
  });
});
