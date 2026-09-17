type FailOpenStartInput = {
  continueGame: () => void;
  syncServerStart: () => Promise<unknown>;
  onSyncError?: (error: unknown) => void;
};

/**
 * The phone is the canonical judge control during a live game. Once local
 * setup validation succeeds, optional server-side betting synchronization is
 * never allowed to keep the judge on the role-dealing screen.
 */
export const startClubGameFailOpen = ({
  continueGame,
  syncServerStart,
  onSyncError = (error) => console.warn('[LIVE GAME] Server start sync failed', error),
}: FailOpenStartInput) => {
  continueGame();
  void syncServerStart().catch(onSyncError);
};
