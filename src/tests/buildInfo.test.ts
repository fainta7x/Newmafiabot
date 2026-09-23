import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveBuildInfo } from '../server/services/buildInfoService.ts';

const SHA = '6fd95804fe283389eac5a6d040d70c9a6ed32608';
const dirs: string[] = [];

const makeRepo = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-info-'));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, '.git', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
};

afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('resolveBuildInfo', () => {
  it('prefers an explicit BUILD_SHA', () => {
    expect(resolveBuildInfo(makeRepo({}), { BUILD_SHA: SHA.toUpperCase() })).toEqual({ sha: SHA, source: 'env' });
  });

  it('reads a detached HEAD', () => {
    expect(resolveBuildInfo(makeRepo({ HEAD: `${SHA}\n` }), {})).toEqual({ sha: SHA, source: 'git' });
  });

  it('follows a loose branch ref', () => {
    const root = makeRepo({ HEAD: 'ref: refs/heads/main\n', 'refs/heads/main': `${SHA}\n` });
    expect(resolveBuildInfo(root, {})).toEqual({ sha: SHA, source: 'git' });
  });

  it('falls back to packed-refs', () => {
    const root = makeRepo({ HEAD: 'ref: refs/heads/main\n', 'packed-refs': `# pack-refs\n${SHA} refs/heads/main\n` });
    expect(resolveBuildInfo(root, {})).toEqual({ sha: SHA, source: 'git' });
  });

  it('reports unknown without Git metadata', () => {
    expect(resolveBuildInfo(makeRepo({}), {})).toEqual({ sha: null, source: 'unknown' });
  });
});
