/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerProfileCareerSections from '../components/player/PlayerProfileCareerSections.tsx';

afterEach(cleanup);

describe('profile career honest zero values', () => {
  it('shows an observed zero streak and zero action counters instead of missing-data dashes', () => {
    render(<PlayerProfileCareerSections
      stats={{ games: 4, current_streak: 0, best_streak: 0, first_killed: 0, best_moves: 0, zero_round_voted: 0 }}
      season={null}
    />);
    const streaks = screen.getByRole('region', { name: 'Серии побед' });
    expect(streaks.textContent).toContain('Сейчас0побед подряд');
    expect(streaks.textContent).toContain('Лучший результат0рекорд серии');
    const counters = screen.getByRole('region', { name: 'ПУ, ЛХ и нулевой круг' });
    expect(counters.textContent).toContain('0ПУ');
    expect(counters.textContent).toContain('0ЛХ');
    expect(counters.textContent).toContain('0на нулевом круге');
  });
});
