// A page reload during a conducted game must return to the game, not to the main screen (owner, 2026-10-18). The engine's
// own session already survives in the device storage; what was lost is the «game window is open» state of the screen that
// launched it. This record says which game window was open, and each launcher reopens it once after the reload.

const KEY = 'mafia_live_game_resume';
/** An abandoned record must not reopen a stale game days later. */
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type ResumeKind = 'club' | 'tournament';
type ResumeRecord = { kind: ResumeKind; id: string; savedAt: number };

const read = (): ResumeRecord | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<ResumeRecord> | null;
    if (!parsed || (parsed.kind !== 'club' && parsed.kind !== 'tournament') || typeof parsed.id !== 'string' || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed as ResumeRecord;
  } catch {
    return null;
  }
};

/** The game window is open: remember it (only real games; the sandbox and the guided training never reopen by themselves). */
export const rememberOpenLiveGame = (kind: ResumeKind, id: number | string): void => {
  try { localStorage.setItem(KEY, JSON.stringify({ kind, id: String(id), savedAt: Date.now() } satisfies ResumeRecord)); } catch { /* a convenience only */ }
};

/** The judge closed the window or the game ended: no reopening. */
export const forgetOpenLiveGame = (kind: ResumeKind, id?: number | string): void => {
  const current = read();
  if (current && current.kind === kind && (id === undefined || current.id === String(id))) {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
};

export const readOpenLiveGame = (kind: ResumeKind): string | null => {
  const current = read();
  return current && current.kind === kind ? current.id : null;
};

let claimed = false;
/** Only one launcher reopens the game after a reload, even when two of them are mounted on the same screen. */
export const claimOpenLiveGame = (kind: ResumeKind): string | null => {
  const id = readOpenLiveGame(kind);
  if (!id || claimed) return null;
  claimed = true;
  return id;
};

/** For tests. */
export const resetLiveGameResumeClaim = (): void => { claimed = false; };
