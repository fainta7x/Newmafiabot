/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerProfileStatsHero from '../components/player/PlayerProfileStatsHero.tsx';

afterEach(cleanup);

describe('profile key stats at mobile width', () => {
  it('makes selected career games and wins visual while separating lifetime Elo from seasonal rank', () => {
    render(<PlayerProfileStatsHero games={12} wins={7} winRate={58} elo="1210" seasonPlace={2} />);
    const hero = screen.getByTestId('profile-key-stats');
    expect(hero.textContent).toContain('58%');
    expect(hero.textContent).toContain('12');
    expect(hero.textContent).toContain('7');
    expect(hero.textContent).toContain('Текущий Elo · всё время');
    expect(hero.textContent).toContain('Место в сезоне');
    expect(hero.textContent).toContain('#2');
    expect(screen.getByRole('img', { name: 'Процент побед: 58%' })).toBeDefined();
  });

  it('does not fake a win rate or a season place for an empty career', () => {
    render(<PlayerProfileStatsHero games={0} wins={0} winRate={0} elo="—" seasonPlace={null} />);
    expect(screen.getByRole('img', { name: 'Процент побед: —' })).toBeDefined();
    const hero = screen.getByTestId('profile-key-stats');
    expect(hero.textContent).toContain('Место в сезоне');
    expect(hero.textContent).not.toContain('0%');
    expect(hero.textContent).not.toContain('#0');
  });

  it('derives the visual win rate from actual games when older profile responses omit the percentage', () => {
    render(<PlayerProfileStatsHero games={3} wins={2} winRate={null} elo="1100" seasonPlace={1} />);
    expect(screen.getByRole('img', { name: 'Процент побед: 67%' })).toBeDefined();
  });
});
