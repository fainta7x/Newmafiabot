import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('player rating hub structure', () => {
  it('keeps rating data loading inside the extracted table view', () => {
    const hub = read('src/components/player/PlayerRatingHub.tsx');
    const table = read('src/components/player/PlayerRatingTable.tsx');

    expect(hub).toContain("import PlayerRatingTable from './PlayerRatingTable.tsx'");
    expect(hub).not.toContain("fetch('/api/rating'");
    expect(table).toContain("fetch('/api/rating', { credentials: 'include' })");
    expect(table).toContain('Не удалось загрузить рейтинг');
  });
});
