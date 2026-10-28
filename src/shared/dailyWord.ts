/** Public contract only: the answer dictionary stays in server/data. */
export const DAILY_WORD_TRIES = 6;
export const DAILY_WORD_REWARD = 200;
export const DAILY_WORD_MIN = 4;
export const DAILY_WORD_MAX = 8;
export type LetterMark = 'correct' | 'present' | 'absent';
export type DailyWordGuess = { word: string; marks: LetterMark[] };
export type DailyWordState = {
  day: string; next_at: string; length: number; max_tries: number; reward: number;
  status: 'new' | 'playing' | 'won' | 'lost'; guesses: DailyWordGuess[];
  reward_earned: number; reward_eligible: boolean; token_balance: number;
  played: number; solved: number; streak: number; best_streak: number;
  results: Array<{ nickname: string; won: boolean; attempts: number }>;
  can_manage: boolean;
};
export const normalizeDailyWord = (word: string) => word.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
/** Match exact positions before consuming remaining letters (including repeated letters). */
export function markDailyWord(answer: string, guess: string): LetterMark[] {
  const remaining = new Map<string, number>();
  const result: LetterMark[] = Array.from(guess, () => 'absent');
  for (let i = 0; i < answer.length; i++) {
    if (answer[i] === guess[i]) result[i] = 'correct';
    else remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'correct') continue;
    const count = remaining.get(guess[i]) || 0;
    if (count > 0) { result[i] = 'present'; remaining.set(guess[i], count - 1); }
  }
  return result;
}
export function dailyWordShare(state: DailyWordState): string {
  const icons = { correct: '🟩', present: '🟨', absent: '⬛' };
  return `2LA Noire · Слово дня · ${state.day}\n${state.status === 'won' ? state.guesses.length : 'X'}/${state.max_tries} · ${state.length} букв\n${state.guesses.map(g => g.marks.map(m => icons[m]).join('')).join('\n')}`;
}
