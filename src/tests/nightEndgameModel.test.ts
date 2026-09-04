import { describe, expect, it } from 'vitest';
import { getNightEndgameAction, getNightResolutionStage } from '../components/LiveGameEngine/nightEndgameModel.js';

describe('night endgame flow', () => {
  it('routes a successful kill through farewell and death protocol before leaving the night', () => {
    const resolvedStage = getNightResolutionStage(4);
    expect(resolvedStage).toBe('farewell');
    expect(getNightEndgameAction(resolvedStage, null)).toBe('death_protocol');
    expect(getNightEndgameAction('death_protocol', null)).toBe('next_day');
  });

  it('finishes the game only after the killed-player protocol when the kill decides the winner', () => {
    const resolvedStage = getNightResolutionStage(7);
    expect(resolvedStage).toBe('farewell');
    expect(getNightEndgameAction(resolvedStage, 'Чёрные')).toBe('death_protocol');
    expect(getNightEndgameAction('death_protocol', 'Чёрные')).toBe('finish_game');
  });

  it('lets a missed night go straight to the next-day transition path', () => {
    expect(getNightResolutionStage(null)).toBe('none');
    expect(getNightEndgameAction('none', null)).toBe('resolve_night');
  });
});
