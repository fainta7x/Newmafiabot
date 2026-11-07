import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner, 2026-11-07: «не могу сохранить протокол» — «Завершить игру?» opened UNDER the protocol window (z-60 < z-[90]) and was
// never seen, so the game was never completed and «Результаты PNG» never appeared.
describe('tournament protocol dialogs stand above the protocol window', () => {
  const windowLayer = Number(/fixed inset-0 z-\[(\d+)\]/.exec(readFileSync('src/components/crm/gameProtocol/ProtocolWindow.tsx', 'utf8'))![1]);
  const dir = 'src/components/crm/tournaments/protocol';
  for (const file of readdirSync(dir).filter((name) => /Dialog/.test(name))) {
    it(file, () => {
      const layers = [...readFileSync(`${dir}/${file}`, 'utf8').matchAll(/fixed inset-0 z-(?:\[(\d+)\]|(\d+))/g)].map((m) => Number(m[1] ?? m[2]));
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) expect(layer).toBeGreaterThan(windowLayer);
    });
  }
});
