import { describe, expect, it } from 'vitest';
import {
  createEmptyActivePlayer,
  createInitialLiveDiscipline,
} from '../components/LiveGameEngine/engineStateModel.js';

describe('Live Game engine state model', () => {
  it('creates the same empty red alive seat state used by engine setup', () => {
    expect(createEmptyActivePlayer(4)).toEqual({
      slot_num: 4,
      user_id: 0,
      nickname: '',
      role: 'Мирный',
      team: 'Красные',
      fouls: 0,
      minor_tech_fouls: 0,
      major_tech_fouls: 0,
      removal_reason: null,
      alive: true,
      nominated_this_round: false,
      has_spoken_this_round: false,
      mute_this_round: false,
      is_pu: false,
      best_move_guesses: [],
      kick: false,
      ppk: false,
      bonus_points: 0,
      lh_points: 0,
      will_protocol_points: 0,
      will_opinion_points: 0,
      dc_points: 0,
      eliminated_phase: '',
      has_foul_penalty: false,
      exit_reason: 'alive',
    });
  });

  it('creates ten red discipline seats with no pending penalties or game-ending state', () => {
    const discipline = createInitialLiveDiscipline();
    expect(Object.keys(discipline.players)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(discipline.players['1']).toMatchObject({
      id: '1',
      team: 'red',
      regularFouls: 0,
      minorTechFouls: 0,
      majorTechFouls: 0,
      isRemoved: false,
      pendingAction: null,
      ppkCaused: false,
      has30SecPenalty: false,
    });
    expect(discipline.players['10']).toMatchObject({ id: '10', team: 'red' });
    expect(discipline.isNextVotingCancelled).toBe(false);
    expect(discipline.pendingVotingCancellationPlayerIds).toEqual([]);
    expect(discipline.isPpk).toBe(false);
    expect(discipline.ppkWinnerTeam).toBeNull();
    expect(discipline.ppkCulpritId).toBeNull();
    expect(discipline.requiresProtocolReview).toBe(false);
  });

  it('returns fresh mutable state on every factory call', () => {
    const firstPlayer = createEmptyActivePlayer(1);
    const secondPlayer = createEmptyActivePlayer(1);
    firstPlayer.best_move_guesses.push(3);
    expect(secondPlayer.best_move_guesses).toEqual([]);

    const firstDiscipline = createInitialLiveDiscipline();
    const secondDiscipline = createInitialLiveDiscipline();
    firstDiscipline.players['1'].regularFouls = 3;
    expect(secondDiscipline.players['1'].regularFouls).toBe(0);
  });
});
