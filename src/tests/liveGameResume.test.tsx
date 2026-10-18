// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimOpenLiveGame, forgetOpenLiveGame, readOpenLiveGame, rememberOpenLiveGame, resetLiveGameResumeClaim } from '../lib/liveGameResume';
import { useResumeLiveGame } from '../lib/useResumeLiveGame';

type Game = { id: number; status: string };

function Launcher({ games, open = false, resume }: { games: Game[] | null; open?: boolean; resume: (game: Game) => void }) {
  useResumeLiveGame('club', games, open, resume);
  return null;
}

describe('reloading a conducted game returns to it', () => {
  beforeEach(() => { localStorage.clear(); resetLiveGameResumeClaim(); });
  afterEach(cleanup);

  it('remembers an open window and forgets it when closed', () => {
    rememberOpenLiveGame('club', 12);
    expect(readOpenLiveGame('club')).toBe('12');
    expect(readOpenLiveGame('tournament')).toBeNull();
    forgetOpenLiveGame('club', 99); // another game: the record stays
    expect(readOpenLiveGame('club')).toBe('12');
    forgetOpenLiveGame('club', 12);
    expect(readOpenLiveGame('club')).toBeNull();
  });

  it('an abandoned record does not reopen a game days later', () => {
    rememberOpenLiveGame('club', 12);
    const stored = JSON.parse(localStorage.getItem('mafia_live_game_resume') as string);
    localStorage.setItem('mafia_live_game_resume', JSON.stringify({ ...stored, savedAt: Date.now() - 48 * 3600 * 1000 }));
    expect(readOpenLiveGame('club')).toBeNull();
  });

  it('the launcher reopens the remembered game once its list has loaded', () => {
    rememberOpenLiveGame('club', 12);
    const resume = vi.fn();
    const { rerender } = render(<Launcher games={null} resume={resume} />);
    expect(resume).not.toHaveBeenCalled();
    rerender(<Launcher games={[{ id: 11, status: 'draft' }, { id: 12, status: 'draft' }]} resume={resume} />);
    expect(resume).toHaveBeenCalledWith({ id: 12, status: 'draft' });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a finished game and forgets it', () => {
    rememberOpenLiveGame('club', 12);
    const resume = vi.fn();
    render(<Launcher games={[{ id: 12, status: 'completed' }]} resume={resume} />);
    expect(resume).not.toHaveBeenCalled();
    expect(readOpenLiveGame('club')).toBeNull();
  });

  it('does nothing while a window is already open, or when the game is on another screen', () => {
    rememberOpenLiveGame('club', 12);
    const resume = vi.fn();
    render(<Launcher games={[{ id: 12, status: 'draft' }]} open resume={resume} />);
    render(<Launcher games={[{ id: 5, status: 'draft' }]} resume={resume} />);
    expect(resume).not.toHaveBeenCalled();
    expect(readOpenLiveGame('club')).toBe('12');
  });

  it('only one of two mounted launchers reopens it', () => {
    rememberOpenLiveGame('club', 12);
    const first = vi.fn();
    const second = vi.fn();
    render(<><Launcher games={[{ id: 12, status: 'draft' }]} resume={first} /><Launcher games={[{ id: 12, status: 'draft' }]} resume={second} /></>);
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
    expect(claimOpenLiveGame('club')).toBeNull();
  });
});
