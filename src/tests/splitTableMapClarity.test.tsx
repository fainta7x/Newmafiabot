/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SplitTableMap } from '../components/public/guide/SplitTableMap.tsx';
afterEach(cleanup);
describe('readable split table visual', () => {
  it('shows nominations and learner seat but not the solution before answering', () => {
    render(<SplitTableMap candidates={[3, 1, 8, 5]} split={[1, 5]} seat={7} />);
    const figure = screen.getByTestId('split-table-map');
    expect(within(figure).getByText('Попил: 1 / 5')).toBeTruthy();
    expect(within(figure).getByText('Я: 7')).toBeTruthy();
    expect(within(figure).queryByTestId('split-map-vote-legend')).toBeNull();
    expect(within(figure).getByLabelText('Выставлены по порядку').textContent).toContain('3→1→8→5');
  });
  it('shows directed votes and totals when votes are supplied', () => {
    render(<SplitTableMap candidates={[3, 1, 8]} split={[1, 3]} killed={10} votes={{ 3: [1, 2, 3], 1: [4, 5, 6], 8: [] }} />);
    const legend = screen.getByTestId('split-map-vote-legend');
    expect(within(legend).getByText('Куда ушли голоса')).toBeTruthy();
    expect(within(legend).getAllByText('3 гол.')).toHaveLength(2);
    expect(screen.getByTestId('split-table-seat-10').textContent).toContain('10');
  });
  it('uses 0 for place 10 inside a multi-person group and 10 if it is the only voter', () => {
    render(<SplitTableMap candidates={[2, 8]} split={[2, 8]} votes={{ 2: [1, 2, 10], 8: [9] }} />);
    const legend = screen.getByTestId('split-map-vote-legend');
    expect(within(legend).getByText('120')).toBeTruthy();
    expect(within(legend).getByText('9')).toBeTruthy();
  });
  it('keeps the single voter 10 written in full', () => {
    render(<SplitTableMap candidates={[2, 8]} split={[2, 8]} votes={{ 2: [10], 8: [1, 2] }} />);
    const legend = screen.getByTestId('split-map-vote-legend');
    expect(within(legend).getByText('10')).toBeTruthy();
  });
});
