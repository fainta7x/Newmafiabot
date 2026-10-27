/* Reading progress lives only in this browser: a convenience, never a requirement. */
export type GuideProgress = { lessons: string[]; quizBest: number | null; /** The last trainer, article or reference screen opened. */ recent: string | null };
const PROGRESS_KEY = 'guide-progress-v2';
export const EMPTY_PROGRESS: GuideProgress = { lessons: [], quizBest: null, recent: null };
export const readProgress = (): GuideProgress => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || '{}');
    return {
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons.filter((item: unknown) => typeof item === 'string') : [],
      quizBest: Number.isInteger(parsed.quizBest) ? parsed.quizBest : null,
      recent: typeof parsed.recent === 'string' ? parsed.recent : null,
    };
  } catch { return EMPTY_PROGRESS; }
};
export const writeProgress = (progress: GuideProgress) => {
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage may be blocked */ }
};
