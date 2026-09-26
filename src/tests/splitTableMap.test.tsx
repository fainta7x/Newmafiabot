// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SplitTableMap } from '../components/public/guide/SplitTableMap.tsx';

afterEach(cleanup);

const center = (testId: string) => {
  const shape = screen.getByTestId(testId).querySelector('circle, rect')!;
  return shape.tagName === 'rect'
    ? { x: Number(shape.getAttribute('x')) + 22, y: Number(shape.getAttribute('y')) + 13 }
    : { x: Number(shape.getAttribute('cx')), y: Number(shape.getAttribute('cy')) };
};

describe('split table map', () => {
  it('seats the table the club way: the host at the bottom, 1 on his left hand, 10 on his right', () => {
    render(<SplitTableMap candidates={[4, 2, 7]} split={[4, 2, 7]} />);
    const host = center('split-table-host');
    const one = center('split-table-seat-1');
    const five = center('split-table-seat-5');
    const ten = center('split-table-seat-10');
    expect(host.y).toBeGreaterThan(one.y);
    expect(one.x).toBeLessThan(host.x);
    expect(ten.x).toBeGreaterThan(host.x);
    // Going round from 1 over the top: 5 is up on the left, 6 up on the right.
    expect(five.y).toBeLessThan(one.y);
    expect(five.x).toBeLessThan(center('split-table-seat-6').x);
  });

  it('marks the killed player, the sheriffs with their checks and whom every seat votes for', () => {
    render(<SplitTableMap killed={10} candidates={[4, 2, 7]} split={[4, 2, 7]} seat={3}
      claims={[{ seat: 1, check: 6, black: false }, { seat: 4, check: 2, black: true }]}
      votes={{ 4: [1, 2, 7], 2: [3, 4, 5], 7: [6, 8, 9] }} />);
    expect(screen.getByTestId('split-table-seat-10').querySelector('line')).toBeTruthy();
    expect(screen.getByTestId('split-table-seat-1').textContent).toContain('Ш');
    expect(screen.getByTestId('split-table-seat-2').textContent).toContain('Ч');
    expect(screen.getByTestId('split-table-seat-6').textContent).toContain('К');
    expect(screen.getByTestId('split-table-seat-3').textContent).toContain('ты →2');
    expect(screen.getByTestId('split-table-seat-9').textContent).toContain('→7');
    expect(screen.getByTestId('split-table-map').textContent).toContain('пилится 4 — 3 гол.');
  });
});
