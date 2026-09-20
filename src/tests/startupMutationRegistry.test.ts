import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { STARTUP_MUTATION_REGISTRY } from '../server/startupMutationRegistry.ts';

describe('startup mutation registry', () => {
  it('keeps registry order unique and monotonic', () => {
    const orders = STARTUP_MUTATION_REGISTRY.map((entry) => entry.order);
    const names = STARTUP_MUTATION_REGISTRY.map((entry) => entry.name);

    expect(new Set(orders).size).toBe(orders.length);
    expect(new Set(names).size).toBe(names.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('matches the startup operation order in createApp', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/app.ts'), 'utf8');

    let previous = -1;
    for (const entry of STARTUP_MUTATION_REGISTRY) {
      const needle = `${entry.name}(`;
      const index = source.indexOf(needle);
      expect(index, `${entry.name} must be called from src/app.ts`).toBeGreaterThanOrEqual(0);
      expect(index, `${entry.name} must remain after the previous registered startup operation`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it('classifies every startup mutation by idempotency strategy', () => {
    for (const entry of STARTUP_MUTATION_REGISTRY) {
      expect(entry.idempotency.trim().length).toBeGreaterThan(0);
      expect([
        'schema',
        'compatibility',
        'data_migration',
        'historical_correction',
        'continuous_reconciliation',
        'worker',
      ]).toContain(entry.kind);
    }
  });
});
