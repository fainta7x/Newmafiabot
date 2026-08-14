/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClubLiveSessionRecorder,
  LEGACY_LIVE_SESSION_KEY,
  clubLiveSessionKey,
} from '../lib/liveClubSession';

describe('failed final live save recovery', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the game-scoped checkpoint when the engine clears its bridge before an API save fails', () => {
    const checkpoint = {
      phase: 'night',
      roundNumber: 3,
      nightSubPhase: 'morning',
      postNightStage: 'death_protocol',
      activePlayers: Array.from({ length: 10 }, (_, index) => ({ slot_num: index + 1, alive: index < 6 })),
      savedAt: '17:40',
    };
    localStorage.setItem(clubLiveSessionKey(91), JSON.stringify(checkpoint));

    const attempt = new ClubLiveSessionRecorder(91);
    attempt.mount();
    expect(localStorage.getItem(LEGACY_LIVE_SESSION_KEY)).not.toBeNull();

    // LiveGameEngine clears the legacy bridge immediately before the final API save.
    // If that API save fails, the scoped checkpoint must remain recoverable.
    localStorage.removeItem(LEGACY_LIVE_SESSION_KEY);
    attempt.unmount();

    expect(JSON.parse(localStorage.getItem(clubLiveSessionKey(91)) || '{}')).toEqual(checkpoint);

    const reopened = new ClubLiveSessionRecorder(91);
    reopened.mount();
    expect(JSON.parse(localStorage.getItem(LEGACY_LIVE_SESSION_KEY) || '{}')).toEqual(checkpoint);
    reopened.unmount();
  });
});
