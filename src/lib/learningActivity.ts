import { REASONING_LEVELS } from './mafiaReasoningCourse.ts';
import { REASONING_LABS } from './mafiaReasoningLabs.ts';

/**
 * What the organizer can follow about a player's learning (owner, 2026-10-11: «кто что прошёл, а кто буксовал»).
 * The split-vote trainer keeps its own exam table (`player_split_vote_progress`); the tracks below are the rest of the
 * practice: the reasoning school (steps and practices) and the judge's trainer. One finished try = one record.
 */
export const LEARNING_TRACKS = [
  { id: 'reasoning-course', label: 'Школа мышления · ступени', items: REASONING_LEVELS.map((level) => ({ id: level.id, label: level.title })) },
  { id: 'reasoning-labs', label: 'Школа мышления · практики', items: REASONING_LABS.map((topic) => ({ id: topic.id as string, label: topic.title })) },
  { id: 'judge-training', label: 'Тренажёр судьи', items: [{ id: 'training', label: 'Учебная партия' }, { id: 'free', label: 'Тестовая игра' }] },
] as const;
export type LearningTrackId = typeof LEARNING_TRACKS[number]['id'];

/** A player who tried an item this many times and has not passed it is «буксует». */
export const LEARNING_STUCK_AFTER_TRIES = 3;

export const learningItemKey = (track: string, item: string) => `${track}:${item}`;
export const isLearningItem = (track: unknown, item: unknown): track is LearningTrackId =>
  LEARNING_TRACKS.some((entry) => entry.id === track && entry.items.some((candidate) => candidate.id === item));

export type LearningActivityItem = { attempts: number; best_score: number | null; max_score: number | null; passed_at: string | null; last_at: string };
export type LearningActivityRow = {
  id: string; nickname: string;
  /** `track:item` → how it went */
  items: Record<string, LearningActivityItem>;
};
