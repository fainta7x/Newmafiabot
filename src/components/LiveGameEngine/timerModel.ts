import type { Phase } from './types.js';

export type LiveGameVotingStage = 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';

export const REVOTE_SPEECH_SECONDS = 30;
export const BEST_MOVE_SECONDS = 25;
export const DEATH_PROTOCOL_SECONDS = 20;

export const resolveTimerDuration = (
  phase: Phase,
  votingStage: LiveGameVotingStage,
  requestedSeconds: number,
): number => (
  phase === 'day_voting' && votingStage === 'revote_speeches'
    ? REVOTE_SPEECH_SECONDS
    : requestedSeconds
);

export const buildTimerIdentity = (
  phase: Phase,
  votingStage: LiveGameVotingStage,
  speakerSlot: number | null,
  customTimerLabel: string | null,
  durationSeconds: number,
): string => [phase, votingStage, speakerSlot ?? '', customTimerLabel ?? '', durationSeconds].join('|');

export const createTimerDeadline = (nowMs: number, durationSeconds: number): number => (
  nowMs + Math.max(0, durationSeconds) * 1000
);

export const getRemainingTimerSeconds = (deadlineMs: number, nowMs: number): number => (
  Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
);
