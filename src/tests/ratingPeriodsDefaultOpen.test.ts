import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('CRM rating periods default state', () => {
  it('opens rating periods immediately when the rating tab is entered', () => {
    const source = read('src/components/crm/RatingPeriodsCRM.tsx');

    expect(source).toContain('const [expanded, setExpanded] = useState(true);');
  });
});
