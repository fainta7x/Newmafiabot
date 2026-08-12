export type JudgeGameMusicSelection = {
  configured: true;
  dealTrackId: string | null;
  nightTrackId: string | null;
};

const STORAGE_KEY = 'mafia_live_music_selection';

export const readJudgeGameMusicSelection = (): JudgeGameMusicSelection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.configured !== true) return null;
    return {
      configured: true,
      dealTrackId: typeof parsed.dealTrackId === 'string' ? parsed.dealTrackId : null,
      nightTrackId: typeof parsed.nightTrackId === 'string' ? parsed.nightTrackId : null,
    };
  } catch {
    return null;
  }
};

export const writeJudgeGameMusicSelection = (selection: JudgeGameMusicSelection) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Music preferences must never block the live game.
  }
};

export const clearJudgeGameMusicSelection = () => {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

export const JUDGE_GAME_MUSIC_SELECTION_STORAGE_KEY = STORAGE_KEY;
