import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { analyticsHelp } from '../lib/analyticsHelp.ts';

describe('one written definition for analytics',()=>{
  it('keeps every visible explanation verbatim in the business rules',()=>{
    const rules=readFileSync(new URL('../../docs/BUSINESS_RULES.md',import.meta.url),'utf8');
    for(const [name,text] of Object.entries(analyticsHelp)) expect(rules,`missing canonical help: ${name}`).toContain(text);
  });
});
