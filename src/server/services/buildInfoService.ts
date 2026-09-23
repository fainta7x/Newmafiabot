import fs from 'node:fs';
import path from 'node:path';

export type BuildInfo = { sha: string | null; source: 'env' | 'git' | 'unknown' };

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const readText = (file: string) => {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};

/**
 * Resolve the Git commit the running container was built from. Amvera builds
 * from a repository checkout; `.dockerignore` keeps only `.git/HEAD` and the
 * refs, so the SHA can be read without shipping the Git history.
 */
export const resolveBuildInfo = (rootDir = process.cwd(), env: NodeJS.ProcessEnv = process.env): BuildInfo => {
  const fromEnv = String(env.BUILD_SHA || env.GIT_COMMIT || '').trim();
  if (SHA_PATTERN.test(fromEnv)) return { sha: fromEnv.toLowerCase(), source: 'env' };

  const gitDir = path.join(rootDir, '.git');
  const head = readText(path.join(gitDir, 'HEAD'));
  if (SHA_PATTERN.test(head)) return { sha: head.toLowerCase(), source: 'git' };

  const ref = head.startsWith('ref:') ? head.slice(4).trim() : '';
  if (ref && !ref.includes('..')) {
    const loose = readText(path.join(gitDir, ref));
    if (SHA_PATTERN.test(loose)) return { sha: loose.toLowerCase(), source: 'git' };
    const packed = readText(path.join(gitDir, 'packed-refs'))
      .split('\n')
      .map((line) => line.trim().split(' '))
      .find(([sha, name]) => name === ref && SHA_PATTERN.test(sha || ''));
    if (packed) return { sha: packed[0].toLowerCase(), source: 'git' };
  }

  return { sha: null, source: 'unknown' };
};

let cached: BuildInfo | null = null;

export const getBuildInfo = (): BuildInfo => (cached ||= resolveBuildInfo());
