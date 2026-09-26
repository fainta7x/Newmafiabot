/** Split-vote trainer levels (zero round, then the three-way split), with the names organizers see. */
export const SPLIT_VOTE_LEVELS = [
  { id: 'basic', label: 'Обычный' },
  { id: 'advanced', label: 'Продвинутый' },
  { id: 'interactive', label: 'Сложный' },
  { id: 'expert', label: 'Эксперт' },
  { id: 'three_easy', label: 'Трое · лёгкий' },
  { id: 'three_medium', label: 'Трое · средний' },
  { id: 'three_hard', label: 'Трое · сложный' },
] as const;
export type SplitVoteLevelId = typeof SPLIT_VOTE_LEVELS[number]['id'];

export type LearningPlayerRow = {
  id: string;
  nickname: string;
  club_stage: string | null;
  game_level: string | null;
  /** Level id → when the exam was passed. */
  passed: Partial<Record<SplitVoteLevelId, string>>;
};
