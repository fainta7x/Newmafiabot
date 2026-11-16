import { randomInt } from 'node:crypto';

/** Sudoku 9×9 as 81 digits, «0» for an empty cell. */
const ALL = 0x3fe; // bits 1..9
const bitCount = (mask: number) => { let n = 0; for (let m = mask; m; m &= m - 1) n++; return n; };
const box = (index: number) => Math.floor(Math.floor(index / 9) / 3) * 3 + Math.floor((index % 9) / 3);

/** Counts solutions up to `limit` (2 is enough to prove uniqueness); fills `out` with the first one. */
export function countSolutions(grid: number[], limit = 2, out?: number[], random = false): number {
  const cells = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = cells[i]; if (!v) continue;
    const bit = 1 << v, r = Math.floor(i / 9), c = i % 9, b = box(i);
    if ((rows[r] | cols[c] | boxes[b]) & bit) return 0;
    rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
  }
  let found = 0;
  const solve = (): boolean => {
    // The empty cell with the fewest candidates first.
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (cells[i]) continue;
      const mask = ALL & ~(rows[Math.floor(i / 9)] | cols[i % 9] | boxes[box(i)]);
      const n = bitCount(mask);
      if (n < bestCount) { best = i; bestMask = mask; bestCount = n; if (n <= 1) break; }
    }
    if (best < 0) { found++; if (out && found === 1) out.splice(0, 81, ...cells); return found >= limit; }
    if (!bestMask) return false;
    const digits: number[] = [];
    for (let v = 1; v <= 9; v++) if (bestMask & (1 << v)) digits.push(v);
    if (random) for (let i = digits.length - 1; i > 0; i--) { const j = randomInt(i + 1); [digits[i], digits[j]] = [digits[j], digits[i]]; }
    const r = Math.floor(best / 9), c = best % 9, b = box(best);
    for (const v of digits) {
      const bit = 1 << v;
      cells[best] = v; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      if (solve()) return true;
      cells[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
    }
    return false;
  };
  solve();
  return found;
}

const shuffled = (n: number) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** A random puzzle with exactly one solution and `givens` open cells (or the fewest reachable, never fewer). */
export function generateSudoku(givens: number): { puzzle: string; solution: string } {
  let best: { puzzle: number[]; solution: number[]; open: number } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const solution: number[] = [];
    countSolutions(new Array(81).fill(0), 1, solution, true);
    const puzzle = solution.slice();
    let open = 81;
    for (const i of shuffled(81)) {
      if (open <= givens) break;
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) === 1) open--; else puzzle[i] = keep;
    }
    if (!best || open < best.open) best = { puzzle, solution, open };
    if (open <= givens) break;
  }
  return { puzzle: best!.puzzle.join(''), solution: best!.solution.join('') };
}
