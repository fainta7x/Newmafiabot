import { describe, expect, it } from 'vitest';
import { colourOf } from '../server/services/projectBoardService.ts';

const core = ['Release gate', 'Secret scan', 'Analyze (javascript-typescript)', 'Analyze (python)'];
const preview = ['Mobile preview and screenshots (1)', 'Mobile preview and screenshots (2)', 'Mobile preview and screenshots (3)', 'Layout and text audit (affected pages or full)'];
const success = (name: string) => ({ name, status: 'completed', conclusion: 'success' });

describe('project board reflects UI verification', () => {
  it('keeps an unfinished preview yellow after core checks pass', () => {
    expect(colourOf({ state: 'open' }, [...core.map(success), { name: preview[0], status: 'in_progress', conclusion: null }]).colour).toBe('working');
  });
  it('shows a failed layout audit as red', () => {
    expect(colourOf({ state: 'open' }, [...core.map(success), ...preview.slice(0, 3).map(success), { name: preview[3], status: 'completed', conclusion: 'failure' }]).colour).toBe('failed');
  });
  it('requires every preview shard once the workflow appears', () => {
    expect(colourOf({ state: 'open' }, [...core.map(success), success(preview[0])]).colour).toBe('working');
  });
  it('reports all completed checks and supports docs-only PRs', () => {
    expect(colourOf({ state: 'open' }, [...core, ...preview].map(success))).toEqual({ colour: 'ready', passed: 8, total: 8 });
    expect(colourOf({ state: 'open' }, core.map(success))).toEqual({ colour: 'ready', passed: 4, total: 4 });
  });
});
