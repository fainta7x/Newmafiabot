/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerProfileCareerSections from '../components/player/PlayerProfileCareerSections.tsx';

afterEach(cleanup);

const career = {
  games: 20, wins: 12, win_rate: 60, current_streak: 3, best_streak: 5,
  red: { games: 12, wins: 9, win_rate: 75 },
  black: { games: 8, wins: 3, win_rate: 37.5 },
  first_killed: 2, best_moves: 1, zero_round_voted: 1,
};
const decisionStats = {
  games: 8,
  votesAsRed: { count: 4, total: 5, percent: 80 },
  nominationsAsRed: { count: 3, total: 4, percent: 75 },
  bestMove: { count: 1, averageBlack: 2 },
  firstKilled: { count: 1, total: 8 },
  sheriffChecks: { count: 2, total: 3, percent: 67 },
  donChecks: { count: 1, total: 3, percent: 33 },
};

describe('player detailed career visual hierarchy', () => {
  it('keeps original numbers and shows visual win rates for red/black without duplicating overall win rate', () => {
    render(<PlayerProfileCareerSections stats={career} season={null} gameStats={decisionStats as any} />);
    expect(screen.getByText('За красных').parentElement?.textContent).toContain('75%');
    expect(screen.getByText('За красных').parentElement?.textContent).toContain('9 из 12 игр');
    expect(screen.getByText('За чёрных').parentElement?.textContent).toContain('37.5%');
    expect(screen.getByText('За чёрных').parentElement?.textContent).toContain('3 из 8 игр');
    expect(screen.getByText('Побед подряд сейчас')).toBeDefined();
    expect(screen.getByText('Рекорд серии')).toBeDefined();
    expect(screen.getByText('Голоса в чёрных')).toBeDefined();
    expect(screen.getByText('Голоса в чёрных').parentElement?.parentElement?.textContent).toContain('80%');
    expect(screen.getByText('Голоса в чёрных').parentElement?.parentElement?.textContent).toContain('4 из 5 голосов');
    expect(screen.getByText('Лучший ход')).toBeDefined();
    expect(screen.getByText('Проверки Дона')).toBeDefined();
    expect(screen.getByText('Точность решений')).toBeDefined();
  });

  it('keeps seasonal rankings and avoids inferring a win percentage from an empty team sample', () => {
    render(<PlayerProfileCareerSections stats={{ ...career, red: { games: 0, wins: 0, win_rate: 0 } }}
      season={{ label: 'Осень 2026', games: 4, wins: 2, win_rate: 50, place: 3, total_players: 18 }} />);
    expect(screen.getByText('Осень 2026')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();
    expect(screen.getByText('За красных').parentElement?.textContent).toContain('—');
    expect(screen.getByText('За красных').parentElement?.textContent).toContain('0 из 0 игр');
    expect(screen.getByText('За красных').parentElement?.textContent).not.toContain('0%');
  });
});
