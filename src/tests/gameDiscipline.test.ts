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
    
    // Consume speech
    const { duration, newState } = consumeNextSpeech(state, player1.id);
    expect(duration).toBe(30);
    state = newState;
    expect(getPlayerPenaltyStatus(state.players[player1.id]).has30SecPenalty).toBe(false);

    // Consume again should give null
    const res2 = consumeNextSpeech(state, player1.id);
    expect(res2.duration).toBe(null);
    expect(res2.newState).toBe(state); // Unchanged

    // 4th foul - requires confirmation
    state = addRegularFoul(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('removal_4th_foul');
    
    // Cancel action
    state = cancelAction(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe(null);
    expect(state.players[player1.id].isRemoved).toBe(false);
    
    // 4th foul again and confirm
    state = addRegularFoul(state, player1.id);
    state = confirmAction(state, player1.id);
    
    expect(state.players[player1.id].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    
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
    
    // Second minor tech foul -> pending
    state = addMinorTechFoul(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('minor_tech_causing_removal');
    
    state = confirmAction(state, player1.id);
    expect(state.players[player1.id].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    
    status = getPlayerPenaltyStatus(state.players[player1.id]);
    // 0.3 + 0.3 + 1.0 = 1.6
    expect(status.disciplinaryPenalty).toBe(1.6);
  });

  it('4. Tech fouls: minor + major = -1.9 sum', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = addMinorTechFoul(state, player1.id);
    state = addMajorTechFoul(state, player1.id);
    
    expect(state.players[player1.id].pendingAction).toBe('major_tech_causing_removal');
    state = confirmAction(state, player1.id);
    
    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    // 0.3 + 0.6 + 1.0 = 1.9
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
    let state = createInitialGameDiscipline([player1]); // red team
    
    state = requestPpk(state, player1.id);
    expect(state.players[player1.id].pendingAction).toBe('ppk');
    
    state = confirmAction(state, player1.id);
    expect(state.isPpk).toBe(true);
    expect(state.ppkWinnerTeam).toBe('black'); // opposite of red
    expect(state.ppkCulpritId).toBe(player1.id);
    expect(state.players[player1.id].ppkCaused).toBe(true);
    
    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.disciplinaryPenalty).toBe(1.0);

    // After PPK, new discipline actions are blocked
    const stateAfterBlocked = addRegularFoul(state, player1.id);
    expect(stateAfterBlocked).toBe(state); // Unchanged
  });

  it('7. Arbitrary game penalty and nomination penalty', () => {
    let state = createInitialGameDiscipline([player1]);
    
    // Try invalid penalties
    const stateSame1 = setGamePenalty(state, player1.id, -1);
    const stateSame2 = setGamePenalty(state, player1.id, NaN);
    expect(stateSame1).toBe(state);
    expect(stateSame2).toBe(state);

    state = setGamePenalty(state, player1.id, 0.25);
    state = addMinorTechFoul(state, player1.id); // 0.3
    
    const status = getPlayerPenaltyStatus(state.players[player1.id]);
    expect(status.gamePenalty).toBe(0.25);
    expect(status.disciplinaryPenalty).toBe(0.3);
    // 0.3 + 0.25 = 0.55 exact
    expect(status.totalPenalty).toBe(0.55);
    expect(status.nominationPenalty).toBe(0.25);
  });

  it('8. Multiple removals do not accumulate voting cancellations', () => {
    let state = createInitialGameDiscipline([player1, player2]);
    
    // Player 1 direct removal
    state = requestDirectRemoval(state, player1.id);
    state = confirmAction(state, player1.id);
    
    // Player 2 direct removal (before resetting voting cancellation)
    state = requestDirectRemoval(state, player2.id);
    state = confirmAction(state, player2.id);
    
    expect(state.isNextVotingCancelled).toBe(true);
    
    // Reset voting cancellation (e.g. after day ends)
    state = resetNextVotingCancelled(state);
    expect(state.isNextVotingCancelled).toBe(false); // Should be completely clear
    
    // Verify it doesn't stay cancelled
    expect(resetNextVotingCancelled(state)).toBe(state); // No-op check
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
});
