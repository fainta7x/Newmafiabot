import { describe, expect, it } from 'vitest';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';
import { validatePlayerResults } from '../server/routes/tournamentProtocolRoutes.ts';
const roles = ['don','mafia','mafia','sheriff', ...Array(6).fill('citizen')];
function players(patch = {}) { return roles.map((role, i) => ({ participant_id: `p${i+1}`, player_id: `player${i+1}`, guest_placeholder_id: null, seat_number: i+1, role, exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0, ...(i===0?patch:{}) })); }
const protocol = { winner_team: 'red', best_moves: [], votes: [], shots: [] };
describe('one discipline contract for club and tournament saves', () => {
  it.each([
    { regular_fouls: 4 },
    { minor_technical_fouls: 1, major_technical_fouls: 1 },
    { regular_fouls: 3, exit_type: 'removed', removal_reason: '4th_foul' },
    { minor_technical_fouls: 1, exit_type: 'removed', removal_reason: '2nd_tech' },
    { color_protocol: [{ mark: 'red', seat_numbers: [3] }] },
  ])('rejects the same contradiction in both protocols: %j', patch => {
    const results = players(patch);
    expect(validatePlayerResults(results, results)).toBeTruthy();
    expect(() => canonicalizeClubGameSave({ player_results: players() }, protocol, results, 'completed')).toThrow();
  });
  it.each([
    { regular_fouls: 4, exit_type: 'removed', removal_reason: '4th_foul' },
    { minor_technical_fouls: 1, major_technical_fouls: 1, exit_type: 'removed', removal_reason: '2nd_tech' },
  ])('accepts consistent removal in both protocols: %j', patch => {
    const results = players(patch);
    expect(validatePlayerResults(results, results)).toBeNull();
    expect(() => canonicalizeClubGameSave({ player_results: players() }, protocol, results, 'completed')).not.toThrow();
  });
});
