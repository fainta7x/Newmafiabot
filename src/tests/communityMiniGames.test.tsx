// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerCommunityHub from '../components/player/PlayerCommunityHub';

vi.mock('../components/player/PlayerClubActivity.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerClubConnections.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerClubDirectory.tsx', () => ({ default: () => <div data-testid="directory" /> }));
vi.mock('../components/player/PlayerRatingHub.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerSeasonsPanel.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerStoriesPanel.tsx', () => ({ default: () => null }));

afterEach(() => { cleanup(); window.sessionStorage.clear(); });

const data: any = { player: { id: 'p1' } };

describe('«Сообщество»: the «Мини-игры» tab', () => {
  it('holds the poker table and «Кровь на часовой башне», and a mini-game exit comes back to it', () => {
    const onOpen = vi.fn();
    const poker = vi.fn();
    const tower = vi.fn();
    const { unmount } = render(<PlayerCommunityHub data={data} section="rating" onOpen={onOpen} onOpenPoker={poker} onOpenClocktower={tower} />);
    // Nothing is buried under the lists any more.
    expect(screen.queryByTestId('player-club-poker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Мини-игры' }));
    expect(onOpen).toHaveBeenCalledWith('club');
    expect(screen.getByTestId('player-minigames').textContent).toContain('Покер');
    fireEvent.click(screen.getByTestId('player-club-clocktower'));
    expect(tower).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('player-club-poker'));
    expect(poker).toHaveBeenCalledTimes(1);
    unmount();

    // Leaving the game goes to /player/club: the tab the person came from is open again, not «Игроки».
    render(<PlayerCommunityHub data={data} section="club" onOpen={onOpen} onOpenPoker={poker} onOpenClocktower={tower} />);
    expect(screen.getByTestId('player-minigames')).toBeTruthy();
    cleanup();
    // A fresh visit to /player/club (no remembered view in the address) opens «Игроки».
    window.history.replaceState(null, '', '/player/club');
    render(<PlayerCommunityHub data={data} section="club" onOpen={onOpen} />);
    expect(screen.getByTestId('directory')).toBeTruthy();
  });
});

describe('«Сообщество»: a reload keeps the open tab (global review 2026-10-26)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));
  it('opening «Мини-игры» writes it to the address, and a fresh render from that address opens it again', () => {
    window.history.replaceState(null, '', '/player/club');
    render(<PlayerCommunityHub data={data} section="club" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Мини-игры' }));
    expect(window.location.search).toBe('?view=games');
    cleanup();
    render(<PlayerCommunityHub data={data} section="club" onOpen={vi.fn()} />);
    expect(screen.getByTestId('player-minigames')).toBeTruthy();
  });
});
