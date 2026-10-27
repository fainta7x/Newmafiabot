/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerNightShots from '../components/player/PlayerNightShots.tsx';

afterEach(cleanup);

describe('night shots in the profile', () => {
  it('shows kills, the black players at the table when it happened, and the misses of the black team', () => {
    render(<PlayerNightShots shots={{ killed: 4, games_as_red: 9, black_nights: 12, black_misses: 5, partners: [{ player_id: 'x', nickname: 'Иван', kills: 3, together: 5 }] }} />);
    const block = screen.getByTestId('profile-night-shots');
    expect(block.textContent).toContain('Убит ночью 4 из 9 игр за красных');
    expect(block.textContent).toContain('Убит ночью в играх, где за чёрных играли:');
    expect(block.textContent).toContain('Иван');
    expect(block.textContent).toContain('3 из 5 игр');
    expect(block.textContent).toContain('ночей без жертвы 5 из 12');
  });

  it('stays hidden when there is nothing to say', () => {
    const { container } = render(<PlayerNightShots shots={null} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    expect(render(<PlayerNightShots shots={{ killed: 0, games_as_red: 3, black_nights: 0, black_misses: 0, partners: [] }} />).container.innerHTML).toBe('');
  });
});
