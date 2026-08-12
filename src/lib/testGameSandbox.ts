const LIVE_SESSION_KEY = 'mafia_live_session';
const DEATH_PROTOCOLS_KEY = 'mafia_live_death_protocols';
const SANDBOX_MARKER_KEY = 'mafia_test_game_sandbox_active';
const LIVE_BACKUP_KEY = 'mafia_test_game_live_backup';
const DEATH_BACKUP_KEY = 'mafia_test_game_death_backup';
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

export const recoverInterruptedTestGameSandbox = () => {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(SANDBOX_MARKER_KEY) !== '1') return;
    restoreKey(LIVE_SESSION_KEY, LIVE_BACKUP_KEY);
    restoreKey(DEATH_PROTOCOLS_KEY, DEATH_BACKUP_KEY);
    localStorage.removeItem(SANDBOX_MARKER_KEY);
  } catch {
    // Test recovery must never block the application from loading.
  }
};

export const beginTestGameSandbox = () => {
  if (typeof window === 'undefined') return;
  try {
    recoverInterruptedTestGameSandbox();
    backupKey(LIVE_SESSION_KEY, LIVE_BACKUP_KEY);
    backupKey(DEATH_PROTOCOLS_KEY, DEATH_BACKUP_KEY);
    localStorage.setItem(SANDBOX_MARKER_KEY, '1');
    localStorage.removeItem(LIVE_SESSION_KEY);
    localStorage.removeItem(DEATH_PROTOCOLS_KEY);
  } catch {
    // The live engine can still run without browser persistence.
  }
};

export const endTestGameSandbox = () => {
  recoverInterruptedTestGameSandbox();
};
