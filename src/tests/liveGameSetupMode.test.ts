import { describe, expect, it } from 'vitest';
import type { Player } from '../types.js';
import {
  CLUB_EVENING_ENGINE_JUDGE_NOTE,
  TOURNAMENT_ENGINE_JUDGE_NOTE,
  getLiveGameSetupMode,
  hasClubEveningEngineMarker,
  hasTournamentEngineMarker,
} from '../components/LiveGameEngine/setupMode.js';

const playerWithNotes = (notes?: string): Player => ({ notes } as Player);

describe('getLiveGameSetupMode', () => {
  it('uses the club setup when the club-evening judge marker is present', () => {
    expect(getLiveGameSetupMode([playerWithNotes(CLUB_EVENING_ENGINE_JUDGE_NOTE)])).toBe('club');
  });

  it('keeps tournament games on the general setup path', () => {
    expect(getLiveGameSetupMode([playerWithNotes(TOURNAMENT_ENGINE_JUDGE_NOTE)])).toBe('tournament');
  });

  it('uses the general setup for ordinary players and an empty list', () => {
    expect(getLiveGameSetupMode([playerWithNotes('ordinary-note')])).toBe('general');
    expect(getLiveGameSetupMode([])).toBe('general');
  });

  it('preserves the existing club-first precedence if both markers are present', () => {
    const players = [
      playerWithNotes(TOURNAMENT_ENGINE_JUDGE_NOTE),
      playerWithNotes(CLUB_EVENING_ENGINE_JUDGE_NOTE),
    ];
    expect(getLiveGameSetupMode(players)).toBe('club');
    expect(hasClubEveningEngineMarker(players)).toBe(true);
    expect(hasTournamentEngineMarker(players)).toBe(true);
  });
});