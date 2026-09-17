import { describe, expect, it, vi } from 'vitest';
import { startClubGameFailOpen } from '../components/LiveGameEngine/startClubGameFailOpen.ts';

describe('Live Game fail-open server synchronization', () => {
  it('continues the conducted game before server betting synchronization settles', async () => {
    let rejectSync!: (error: Error) => void;
    const sync = new Promise((_resolve, reject) => { rejectSync = reject; });
    const continueGame = vi.fn();
    const onSyncError = vi.fn();

    startClubGameFailOpen({ continueGame, syncServerStart: () => sync, onSyncError });

    expect(continueGame).toHaveBeenCalledOnce();
    expect(onSyncError).not.toHaveBeenCalled();
    rejectSync(new Error('database unavailable'));
    await Promise.resolve();
    expect(onSyncError).toHaveBeenCalledOnce();
  });

  it('continues even when synchronization rejects immediately', async () => {
    const continueGame = vi.fn();
    const onSyncError = vi.fn();

    startClubGameFailOpen({
      continueGame,
      syncServerStart: () => Promise.reject(new Error('Failed to fetch')),
      onSyncError,
    });

    expect(continueGame).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(onSyncError).toHaveBeenCalledOnce();
  });
});
