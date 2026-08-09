export const NOIR_EXPORT_COLORS = {
  background: '#09090B',
  surface: '#111114',
  surfaceSoft: '#17171B',
  warmText: '#F3EDE4',
  mutedText: '#9B948C',
  subduedText: '#6F6963',
  wine: '#E63261',
  wineSoft: '#8C2943',
  divider: '#2C292D',
  gold: '#D9B35F',
  silver: '#BFC3C9',
  bronze: '#B77951',
} as const;

// Source of truth: score semantics already used by the post-game/tournament game result surfaces.
export const NOIR_EXPORT_SCORE_COLORS = {
  wins: '#34D399',
  judge: '#34D399',
  protocol: '#34D399',
  best_move: '#FBBF24',
  ci: '#22D3EE',
  game_penalty: '#F87171',
  discipline: '#F87171',
  neutral: '#F8FAFC',
  final: '#F3EDE4',
} as const;

export type NoirExportScoreColorKey = keyof typeof NOIR_EXPORT_SCORE_COLORS;
