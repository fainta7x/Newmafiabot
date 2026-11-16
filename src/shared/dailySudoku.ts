/** Public contract of the daily sudoku (owner, 2026-11-16). The solution stays on the server until the game ends. */
export const DAILY_SUDOKU_REWARD = 200;
export const DAILY_SUDOKU_MAX_MISTAKES = 3;
export type SudokuLevel = 'easy' | 'medium' | 'hard' | 'expert';
export const SUDOKU_LEVEL_LABEL: Record<SudokuLevel, string> = { easy: 'лёгкое', medium: 'среднее', hard: 'сложное', expert: 'очень сложное' };
/**
 * Difficulty grows over the week (owner, 2026-11-16: «растёт по неделе»): Monday is the easiest, Sunday the hardest.
 * The number of open cells per weekday, Monday first.
 */
export const SUDOKU_WEEK: Array<{ level: SudokuLevel; givens: number }> = [
  { level: 'easy', givens: 40 }, { level: 'easy', givens: 37 },
  { level: 'medium', givens: 34 }, { level: 'medium', givens: 32 },
  { level: 'hard', givens: 30 }, { level: 'hard', givens: 28 },
  { level: 'expert', givens: 26 },
];
/** Monday = 0 … Sunday = 6 for a Moscow day «YYYY-MM-DD». */
export const sudokuWeekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
export type DailySudokuState = {
  day: string; next_at: string; level: SudokuLevel; reward: number; max_mistakes: number;
  status: 'new' | 'playing' | 'won' | 'lost';
  /** 81 characters, «0» for an empty cell. Empty until the player starts, so the grid cannot be studied before the timer. */
  givens: string; board: string;
  /** The full solution, only after the game is over. */
  solution: string | null;
  mistakes: number; started_at: string | null; seconds: number | null;
  reward_earned: number; token_balance: number;
  played: number; solved: number; streak: number; best_streak: number;
  results: Array<{ nickname: string; won: boolean; seconds: number | null; mistakes: number }>;
};
export const formatSudokuTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
export function dailySudokuShare(state: DailySudokuState): string {
  const head = `2LA Noire · Судоку · ${state.day.split('-').reverse().join('.')}`;
  const level = SUDOKU_LEVEL_LABEL[state.level];
  return state.status === 'won'
    ? `${head}\nРешено за ${formatSudokuTime(state.seconds ?? 0)} · ${level} · ошибок ${state.mistakes}/${state.max_mistakes}`
    : `${head}\nНе решено · ${level} · ошибок ${state.mistakes}/${state.max_mistakes}`;
}
