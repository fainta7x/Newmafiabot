import type { LearningTrackId } from './learningActivity.ts';

/**
 * Tells the server that the player finished one try of a practice. Fire and forget: the public guide also works for
 * visitors without an account (the server then ignores it), and a failure must never get in the way of learning.
 */
export function reportLearningActivity(entry: { track: LearningTrackId; item: string; score?: number; maxScore?: number; passed: boolean }) {
  try {
    void fetch('/api/player/learning-activity', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
    }).catch(() => undefined);
  } catch { /* no network, no problem */ }
}
