import { useEffect } from 'react';
import { claimOpenLiveGame, forgetOpenLiveGame, readOpenLiveGame, type ResumeKind } from './liveGameResume.ts';

/**
 * After a page reload reopens the game window that was open. `candidates` is the screen's loaded list of games (null while it
 * loads); a game that is no longer conducted (finished, archived) is forgotten instead.
 */
export function useResumeLiveGame<T extends { id: number | string; status?: string }>(
  kind: ResumeKind,
  candidates: T[] | null,
  isOpen: boolean,
  resume: (game: T) => void,
  isResumable: (game: T) => boolean = (game) => game.status !== 'completed',
): void {
  useEffect(() => {
    if (isOpen || !candidates) return;
    const id = readOpenLiveGame(kind);
    if (!id) return;
    const game = candidates.find((candidate) => String(candidate.id) === id);
    if (!game) return; // maybe another screen's list; the record stays
    if (!isResumable(game)) { forgetOpenLiveGame(kind, id); return; }
    if (claimOpenLiveGame(kind) === id) resume(game);
  }, [candidates, isOpen]);
}
