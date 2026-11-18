import { JUDGE_GAME_MUSIC_SELECTION_STORAGE_KEY } from './judgeGameMusicSelection.ts';

export const TEST_GAME_ID = -2147483000;

const LIVE_SESSION_KEY = 'mafia_live_session';
const DEATH_PROTOCOLS_KEY = 'mafia_live_death_protocols';
const MUSIC_SELECTION_KEY = JUDGE_GAME_MUSIC_SELECTION_STORAGE_KEY;
const SANDBOX_MARKER_KEY = 'mafia_test_game_sandbox_active';
const LIVE_BACKUP_KEY = 'mafia_test_game_live_backup';
const DEATH_BACKUP_KEY = 'mafia_test_game_death_backup';
const MUSIC_BACKUP_KEY = 'mafia_test_game_music_backup';
const NOTES_BACKUP_KEY = 'mafia_test_game_notes_backup';
const LIVE_NOTES_KEY = 'mafia_live_protocol_notes';
const TEST_SCOPED_PREFIX = 'mafia_live_session:club:' + TEST_GAME_ID;
const cleanTestGameStorage = () => {
  for (const suffix of ['', ':protocol', ':death-protocols', ':notes']) {
    localStorage.removeItem(TEST_SCOPED_PREFIX + suffix);
  }
};
const ABSENT_VALUE = '__2la_absent__';

const backupKey = (sourceKey: string, targetKey: string) => {
  const value = localStorage.getItem(sourceKey);
  localStorage.setItem(targetKey, value === null ? ABSENT_VALUE : value);
};

const restoreKey = (sourceKey: string, backupStorageKey: string) => {
  const backup = localStorage.getItem(backupStorageKey);
  if (backup === null || backup === ABSENT_VALUE) localStorage.removeItem(sourceKey);
  else localStorage.setItem(sourceKey, backup);
  localStorage.removeItem(backupStorageKey);
};

/**
 * «Игра без вечера» must survive a closed app (owner, 2026-11-18: «нужно чтобы она не закрывалась»). It runs in this
 * sandbox too, but when the sandbox ends — the window closed, or the app killed and recovered at the next start — its
 * saved game is parked under its own key instead of being wiped, and put back when the organizer continues it.
 */
const FREE_MARKER = 'free';
export const FREE_GAME_PARKED_KEY = 'free-game:parked:v1';
const SCOPED_SUFFIXES = ['', ':protocol', ':death-protocols', ':notes'];
export type ParkedFreeGame = { judge: string; lineup: string[]; parkedAt: string; keys: Record<string, string> };
const FREE_CURRENT_KEY = 'free-game:current:v1';

/** The judge and the names of the free game now running (read back when it is parked). */
export const rememberRunningFreeGame = (judge: string, lineup: string[]) => {
  try { localStorage.setItem(FREE_CURRENT_KEY, JSON.stringify({ judge, lineup })); } catch { /* resume is best-effort */ }
};

const parkFreeGame = () => {
  try {
    const session = localStorage.getItem(TEST_SCOPED_PREFIX);
    const phase = session ? (JSON.parse(session) as { phase?: string })?.phase : null;
    // Only a game under way is worth continuing; the setup screen is simply opened again.
    if (!session || !phase || phase === 'setup') return;
    const current = JSON.parse(localStorage.getItem(FREE_CURRENT_KEY) || 'null') as { judge?: string; lineup?: string[] } | null;
    if (!current?.lineup?.length) return;
    const keys: Record<string, string> = {};
    for (const suffix of SCOPED_SUFFIXES) {
      const value = localStorage.getItem(TEST_SCOPED_PREFIX + suffix);
      if (value !== null) keys[suffix] = value;
    }
    const parked: ParkedFreeGame = { judge: String(current.judge || ''), lineup: current.lineup.map(String), parkedAt: new Date().toISOString(), keys };
    localStorage.setItem(FREE_GAME_PARKED_KEY, JSON.stringify(parked));
  } catch {
    // Parking is best-effort: without it the game starts again, as before.
  }
};

export const readParkedFreeGame = (): ParkedFreeGame | null => {
  try {
    const parked = JSON.parse(localStorage.getItem(FREE_GAME_PARKED_KEY) || 'null') as ParkedFreeGame | null;
    return parked && Array.isArray(parked.lineup) && parked.keys && typeof parked.keys[''] === 'string' ? parked : null;
  } catch { return null; }
};

export const clearParkedFreeGame = () => {
  try { localStorage.removeItem(FREE_GAME_PARKED_KEY); localStorage.removeItem(FREE_CURRENT_KEY); } catch { /* nothing parked */ }
};

export const recoverInterruptedTestGameSandbox = () => {
  if (typeof window === 'undefined') return;
  try {
    const marker = localStorage.getItem(SANDBOX_MARKER_KEY);
    if (marker !== '1' && marker !== FREE_MARKER) return;
    if (marker === FREE_MARKER) parkFreeGame();
    restoreKey(LIVE_SESSION_KEY, LIVE_BACKUP_KEY);
    restoreKey(DEATH_PROTOCOLS_KEY, DEATH_BACKUP_KEY);
    restoreKey(MUSIC_SELECTION_KEY, MUSIC_BACKUP_KEY);
    restoreKey(LIVE_NOTES_KEY, NOTES_BACKUP_KEY);
    cleanTestGameStorage();
    localStorage.removeItem(SANDBOX_MARKER_KEY);
  } catch {
    // Test recovery must never block the application from loading.
  }
};

export const beginTestGameSandbox = (options: { free?: boolean; resume?: boolean } = {}) => {
  if (typeof window === 'undefined') return;
  try {
    recoverInterruptedTestGameSandbox();
    backupKey(LIVE_SESSION_KEY, LIVE_BACKUP_KEY);
    backupKey(DEATH_PROTOCOLS_KEY, DEATH_BACKUP_KEY);
    backupKey(MUSIC_SELECTION_KEY, MUSIC_BACKUP_KEY);
    backupKey(LIVE_NOTES_KEY, NOTES_BACKUP_KEY);
    cleanTestGameStorage();
    localStorage.setItem(SANDBOX_MARKER_KEY, options.free ? FREE_MARKER : '1');
    // Continue a parked free game: its saved state goes back under the game's own keys before the engine opens.
    const parked = options.free && options.resume ? readParkedFreeGame() : null;
    if (parked) for (const [suffix, value] of Object.entries(parked.keys)) localStorage.setItem(TEST_SCOPED_PREFIX + suffix, value);
    localStorage.removeItem(LIVE_SESSION_KEY);
    localStorage.removeItem(DEATH_PROTOCOLS_KEY);
    localStorage.removeItem(MUSIC_SELECTION_KEY);
    localStorage.removeItem(LIVE_NOTES_KEY);
  } catch {
    // The live engine can still run without browser persistence.
  }
};

export const endTestGameSandbox = () => {
  recoverInterruptedTestGameSandbox();
};
