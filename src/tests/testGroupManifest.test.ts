import { describe, expect, it } from 'vitest';
import {
  RELEASE_TEST_GROUPS,
  filesForGroup,
  releaseGroupManifest,
} from '../scripts/testGroups.ts';

describe('release test group manifest', () => {
  it('keeps every required release group non-empty', () => {
    const manifest = releaseGroupManifest();

    expect(Object.keys(manifest)).toEqual([...RELEASE_TEST_GROUPS]);
    for (const group of RELEASE_TEST_GROUPS) {
      expect(manifest[group].length, `${group} must include at least one test`).toBeGreaterThan(0);
      expect(manifest[group].every((file) => file.startsWith('src/tests/'))).toBe(true);
    }
  });

  it('fails closed for an unknown group', () => {
    expect(() => filesForGroup('not-a-release-group')).toThrow(/Unknown test group/);
  });
});
