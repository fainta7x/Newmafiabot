import { describe, expect, it } from 'vitest';
import { playerLevelAllowsEveningFormat } from '../db/ensureInviteAudienceSchema.ts';

describe('Telegram invite audience by player level', () => {
  it('routes novices only to novice evenings', () => {
    expect(playerLevelAllowsEveningFormat('novice', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('novice', 'CASUAL')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'TOURNAMENT')).toBe(false);
  });

  it('keeps club players out of rating and tournament invitations', () => {
    expect(playerLevelAllowsEveningFormat('club', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('club', 'CASUAL')).toBe(true);
    expect(playerLevelAllowsEveningFormat('club', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('club', 'TOURNAMENT')).toBe(false);
  });

  it('allows approved tournament players into club, rating and tournament formats', () => {
    expect(playerLevelAllowsEveningFormat('tournament', 'NOVICE')).toBe(false);
    expect(playerLevelAllowsEveningFormat('tournament', 'CASUAL')).toBe(true);
    expect(playerLevelAllowsEveningFormat('tournament', 'RATING')).toBe(true);
    expect(playerLevelAllowsEveningFormat('tournament', 'TOURNAMENT')).toBe(true);
  });
});
