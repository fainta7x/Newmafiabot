import { describe, it, expect } from 'vitest';
import {
  createInitialGameDiscipline,
  addRegularFoul,
  addMinorTechFoul,
  addMajorTechFoul,
  requestDirectRemoval,
  requestPpk,
  confirmAction,
  cancelAction,
  restoreRemovedPlayer,
  setGamePenalty,
  resetNextVotingCancelled,
  getPlayerPenaltyStatus,
  consumeNextSpeech
} from '../lib/gameDiscipline';

describe('Game Discipline Module', () => {
  const player1 = { id: 'p1', team: 'red' as const };
  const player2 = { id: 'p2', team: 'black' as const };

  it('1. Initializes correctly', () => {
    const state = createInitialGameDiscipline([player1, player2]);
    expect(state.players[player1.id].regularFouls).toBe(0);
    expect(state.isNextVotingCancelled).toBe(false);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([]);
    expect(state.isPpk).toBe(false);
  });

  it('2. Regular fouls: 3rd foul gives 30 seconds speech exactly once, 4th foul removes and gives 1 penalty', () => {
    let state = createInitialGameDiscipline([player1]);

    state = addRegularFoul(state, player1.id);
    state = addRegularFoul(state, player1.id);
    state = addRegularFoul(state, player1.id);

    let status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(state.players[player1.id].regularFouls).toBe(3);
    expect(status.has30SecPenalty).toBe(true);
    expect(status.disciplinaryPenalty).toBe(0);

    const { duration, newState } = consumeNextSpeech(state, player1.id);
    expect(duration).toBe(30);
    state = newState;
    expect(getPlayerPenaltyStatus(state.players[player1.id]).has30SecPenalty).toBe(false);

    const res2 = consumeNextSpeech(state, player1.id);
    expect(res2.duration).toBe(null);
    expect(res2.newState).toBe(state);

    state = addRegularFoul(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('removal_4th_foul');

    state = cancelAction(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe(null);
    expect(state.players[player1.id].isRemoved).toBe(false);

    state = addRegularFoul(state, player1.id);
    state = confirmAction(state, player1.id);

    expect(state.players[player1.id].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([player1.id]);

    status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.has30SecPenalty).toBe(false);
    expect(status.disciplinaryPenalty).toBe(1.0);
    expect(status.totalPenalty).toBe(1.0);
  });

  it('3. Tech fouls: minor is 0.3, major is 0.6, two tech fouls remove and give +1 penalty (-1.6 sum)', () => {
    let state = createInitialGameDiscipline([player1]);

    state = addMinorTechFoul(state, player1.id);
    let status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(0.3);

    state = addMinorTechFoul(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('minor_tech_causing_removal');

    state = confirmAction(state, player1.id);
    expect(state.players[player1.id].isRemoved).toBe(true);
    expect(state.players[player1.id].secondTechFoulType).toBe('minor');
    expect(state.isNextVotingCancelled).toBe(true);

    status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(1.6);
  });

  it('4. Tech fouls: minor + major = -1.9 sum', () => {
    let state = createInitialGameDiscipline([player1]);

    state = addMinorTechFoul(state, player1.id);
    state = addMajorTechFoul(state, player1.id);

    expect(state.players[player1.id].pendingAction).toBe('major_tech_causing_removal');
    state = confirmAction(state, player1.id);

    expect(state.players[player1.id].secondTechFoulType).toBe('major');
    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(1.9);
  });

  it('5. Direct removal', () => {
    let state = createInitialGameDiscipline([player1]);

    state = requestDirectRemoval(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('direct_removal');

    state = confirmAction(state, player1.id);
    expect(state.players[player1.id].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);

    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(1.0);
  });

  it('6. PPK handling - winner is opposite team, halts discipline', () => {
    let state = createInitialGameDiscipline([player1]);

    state = requestPpk(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('ppk');

    state = confirmAction(state, player1.id);
    expect(state.isPpk).toBe(true);
    expect(state.ppkWinnerTeam).toBe('black');
    expect(state.ppkCulpritId).toBe(player1.id);
    expect(state.players[player1.id].ppkCaused).toBe(true);

    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(1.0);

    const stateAfterBlocked = addRegularFoul(state, player1.id);
    expect(stateAfterBlocked).toBe(state);
  });

  it('7. Arbitrary game penalty and nomination penalty', () => {
    let state = createInitialGameDiscipline([player1]);

    const stateSame1 = setGamePenalty(state, player1.id, -1);
    const stateSame2 = setGamePenalty(state, player1.id, NaN);
    expect(stateSame1).toBe(state);
    expect(stateSame2).toBe(state);

    state = setGamePenalty(state, player1.id, 0.25);
    state = addMinorTechFoul(state, player1.id);

    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.gamePenalty).toBe(0.25);
    expect(status.disciplinaryPenalty).toBe(0.3);
    expect(status.totalPenalty).toBe(0.55);
    expect(status.nominationPenalty).toBe(0.25);
  });

  it('8. Multiple removals coalesce into one voting cancellation but retain their sources until consumed', () => {
    let state = createInitialGameDiscipline([player1, player2]);

    state = requestDirectRemoval(state, player1.id);
    state = confirmAction(state, player1.id);
    state = requestDirectRemoval(state, player2.id);
    state = confirmAction(state, player2.id);

    expect(state.isNextVotingCancelled).toBe(true);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([player1.id, player2.id]);

    state = resetNextVotingCancelled(state);
    expect(state.isNextVotingCancelled).toBe(false);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([]);
    expect(resetNextVotingCancelled(state)).toBe(state);
  });

  it('9. Cannot add fouls to removed players', () => {
    let state = createInitialGameDiscipline([player1]);

    state = requestDirectRemoval(state, player1.id);
    state = confirmAction(state, player1.id);

    state = addRegularFoul(state, player1.id);
    expect(state.players[player1.id].regularFouls).toBe(0);

    state = addMinorTechFoul(state, player1.id);
    expect(state.players[player1.id].minorTechFouls).toBe(0);
  });

  it('10. Direct removal then PPK on the same player gives 2 penalty, opposite winner, requiresProtocolReview = true', () => {
    let state = createInitialGameDiscipline([player1]);

    state = requestDirectRemoval(state, player1.id);
    state = confirmAction(state, player1.id);
    expect(state.players[player1.id].isRemoved).toBe(true);

    state = requestPpk(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('ppk');

    state = confirmAction(state, player1.id);

    expect(state.isPpk).toBe(true);
    expect(state.requiresProtocolReview).toBe(true);
    expect(state.ppkWinnerTeam).toBe('black');

    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(2.0);
  });

  it('11. Restoring the only removed player also cancels their unconsumed voting cancellation', () => {
    let state = createInitialGameDiscipline([player1]);
    state = requestDirectRemoval(state, player1.id);
    state = confirmAction(state, player1.id);

    state = restoreRemovedPlayer(state, player1.id);
    expect(state.players[player1.id].isRemoved).toBe(false);
    expect(state.players[player1.id].removedReason).toBeNull();
    expect(state.isNextVotingCancelled).toBe(false);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([]);
  });

  it('12. Restoring one of two removals keeps the other cancellation source active', () => {
    let state = createInitialGameDiscipline([player1, player2]);
    state = confirmAction(requestDirectRemoval(state, player1.id), player1.id);
    state = confirmAction(requestDirectRemoval(state, player2.id), player2.id);

    state = restoreRemovedPlayer(state, player1.id);
    expect(state.isNextVotingCancelled).toBe(true);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([player2.id]);

    state = restoreRemovedPlayer(state, player2.id);
    expect(state.isNextVotingCancelled).toBe(false);
    expect(state.pendingVotingCancellationPlayerIds).toEqual([]);
  });

  it('13. Restoring a fourth-foul removal reverses only the fourth foul without granting another 30-second penalty', () => {
    let state = createInitialGameDiscipline([player1]);
    state = addRegularFoul(addRegularFoul(addRegularFoul(state, player1.id), player1.id), player1.id);
    state = consumeNextSpeech(state, player1.id).newState;
    state = confirmAction(addRegularFoul(state, player1.id), player1.id);

    state = restoreRemovedPlayer(state, player1.id);
    expect(state.players[player1.id].regularFouls).toBe(3);
    expect(state.players[player1.id].isRemoved).toBe(false);
    expect(state.players[player1.id].has30SecPenalty).toBe(false);
  });

  it('14. Restoring a second-tech removal reverses the exact triggering tech', () => {
    let state = createInitialGameDiscipline([player1]);
    state = addMinorTechFoul(state, player1.id);
    state = confirmAction(addMajorTechFoul(state, player1.id), player1.id);
    expect(state.players[player1.id].minorTechFouls).toBe(1);
    expect(state.players[player1.id].majorTechFouls).toBe(1);

    state = restoreRemovedPlayer(state, player1.id);
    expect(state.players[player1.id].minorTechFouls).toBe(1);
    expect(state.players[player1.id].majorTechFouls).toBe(0);
    expect(state.players[player1.id].isRemoved).toBe(false);
    expect(getPlayerPenaltyStatus(state.players[player1.id]).disciplinaryPenalty).toBe(0.3);
  });
});
