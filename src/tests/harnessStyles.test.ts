import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cssImports = (file: string, prefix: string) => [...readFileSync(file, 'utf8').matchAll(/^import ["']([^"']+\.css)["'];/gm)]
  .map((match) => match[1].replace(prefix, ''));

// The script each browser harness page (e2e/*.html) loads.
const harnessEntries = () => readdirSync('e2e').filter((name) => name.endsWith('.html')).map((page) => {
  const src = /<script[^>]+src="\.?\/?([^"]+\.tsx)"/.exec(readFileSync(`e2e/${page}`, 'utf8'))?.[1];
  return { page, entry: src ? `e2e/${src.split('/').pop()}` : null };
});

describe('browser harness styles', () => {
  // 2026-10-27: harnesses loaded 2–4 of the app's 16 stylesheets, so their screenshots and layout checks showed pages the
  // phones never had (Live Engine avatars off their cards, a vote panel that overlapped only in the real app).
  it('e2e/appStyles.ts loads the same stylesheets in the same order as the app', () => {
    expect(cssImports('e2e/appStyles.ts', '../src/')).toEqual(cssImports('src/main.tsx', './'));
  });

  it('every harness page loads the app stylesheets through e2e/appStyles.ts', () => {
    const appSheets = new Set(cssImports('src/main.tsx', './').map((sheet) => `../src/${sheet}`));
    for (const { page, entry } of harnessEntries()) {
      expect(entry, `${page} has a harness script`).toBeTruthy();
      const source = readFileSync(entry!, 'utf8');
      expect(source, `${entry} imports ./appStyles.ts`).toMatch(/^import ['"]\.\/appStyles\.ts['"];/m);
      for (const sheet of cssImports(entry!, '')) expect(appSheets.has(sheet), `${entry} loads ${sheet} itself`).toBe(false);
    }
  });
});
