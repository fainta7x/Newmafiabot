import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/crm/PlayersActivityCRM.tsx'), 'utf8');

describe('PlayersActivityCRM quick filters', () => {
  it('uses a fixed mobile grid instead of a horizontal micro-scroll', () => {
    expect(source).toContain('grid grid-cols-6 gap-2 sm:flex');
    // Six status tabs: two rows of three on a phone.
    expect(source).toContain('className={`col-span-2 min-h-[44px]');
    expect(source).not.toContain('-mx-1 overflow-x-auto px-1 pb-1');
  });
});
