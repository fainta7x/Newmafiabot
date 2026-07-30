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
  getPlayerPenaltyStatus
} from '../lib/gameDiscipline';

describe('Game Discipline Module', () => {
  const player1 = 'p1';
  const player2 = 'p2';

  it('1. Initializes correctly', () => {
    const state = createInitialGameDiscipline([player1, player2]);
    expect(state.players[player1].regularFouls).toBe(0);
    expect(state.isNextVotingCancelled).toBe(false);
    expect(state.isPpk).toBe(false);
  });

  it('2. Regular fouls: 3rd foul gives 30 seconds speech, 4th foul removes and gives 1 penalty', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = addRegularFoul(state, player1);
    state = addRegularFoul(state, player1);
    state = addRegularFoul(state, player1);
    
    let status = getPlayerPenaltyStatus(state.players[player1]);
    expect(state.players[player1].regularFouls).toBe(3);
    expect(status.nextSpeechDuration).toBe(30);
    expect(status.disciplinaryPenalty).toBe(0);
    
    // 4th foul - requires confirmation
    state = addRegularFoul(state, player1);
    expect(state.players[player1].pendingAction).toBe('removal_4th_foul');
    
    // Cancel action
    state = cancelAction(state, player1);
    expect(state.players[player1].pendingAction).toBe(null);
    expect(state.players[player1].isRemoved).toBe(false);
    
    // 4th foul again and confirm
    state = addRegularFoul(state, player1);
    state = confirmAction(state, player1);
    
    expect(state.players[player1].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    
    status = getPlayerPenaltyStatus(state.players[player1]);
    expect(status.nextSpeechDuration).toBe(null);
    expect(status.disciplinaryPenalty).toBe(1.0);
    expect(status.totalPenalty).toBe(1.0);
  });

  it('3. Tech fouls: minor is 0.3, major is 0.6, two tech fouls remove and give +1 penalty (-1.6 sum)', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = addMinorTechFoul(state, player1);
    let status = getPlayerPenaltyStatus(state.players[player1]);
    expect(status.disciplinaryPenalty).toBe(0.3);
    
    // Second minor tech foul -> pending
    state = addMinorTechFoul(state, player1);
    expect(state.players[player1].pendingAction).toBe('minor_tech_causing_removal');
    
    state = confirmAction(state, player1);
    expect(state.players[player1].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    
    status = getPlayerPenaltyStatus(state.players[player1]);
    // 0.3 + 0.3 + 1.0 = 1.6
    expect(status.disciplinaryPenalty).toBe(1.6);
  });

  it('4. Tech fouls: minor + major = -1.9 sum', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = addMinorTechFoul(state, player1);
    state = addMajorTechFoul(state, player1);
    
    expect(state.players[player1].pendingAction).toBe('major_tech_causing_removal');
    state = confirmAction(state, player1);
    
    const status = getPlayerPenaltyStatus(state.players[player1]);
    // 0.3 + 0.6 + 1.0 = 1.9
    expect(status.disciplinaryPenalty).toBe(1.9);
  });

  it('5. Direct removal', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = requestDirectRemoval(state, player1);
    expect(state.players[player1].pendingAction).toBe('direct_removal');
    
    state = confirmAction(state, player1);
    expect(state.players[player1].isRemoved).toBe(true);
    expect(state.isNextVotingCancelled).toBe(true);
    
    const status = getPlayerPenaltyStatus(state.players[player1]);
    expect(status.disciplinaryPenalty).toBe(1.0);
  });

  it('6. PPK handling', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = requestPpk(state, player1);
    expect(state.players[player1].pendingAction).toBe('ppk');
    
    state = confirmAction(state, player1, 'black');
    expect(state.isPpk).toBe(true);
    expect(state.ppkWinnerTeam).toBe('black');
    
    const status = getPlayerPenaltyStatus(state.players[player1]);
    expect(status.disciplinaryPenalty).toBe(1.0);
  });

  it('7. Game penalty and nomination penalty', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = setGamePenalty(state, player1, 0.5);
    state = addMinorTechFoul(state, player1); // 0.3
    
    const status = getPlayerPenaltyStatus(state.players[player1]);
    expect(status.gamePenalty).toBe(0.5);
    expect(status.disciplinaryPenalty).toBe(0.3);
    expect(status.totalPenalty).toBe(0.8);
    expect(status.nominationPenalty).toBe(0.5);
  });

  it('8. Multiple removals do not accumulate voting cancellations', () => {
    let state = createInitialGameDiscipline([player1, player2]);
    
    // Player 1 direct removal
    state = requestDirectRemoval(state, player1);
    state = confirmAction(state, player1);
    expect(state.isNextVotingCancelled).toBe(true);
    
    // Reset voting cancellation (e.g. after day ends)
    state = resetNextVotingCancelled(state);
    expect(state.isNextVotingCancelled).toBe(false);
    
    // What if both are removed at the same time?
    state = requestDirectRemoval(state, player1); // already removed, should ignore
    expect(state.players[player1].pendingAction).toBe(null);
    
    state = requestDirectRemoval(state, player2);
    state = confirmAction(state, player2);
    expect(state.isNextVotingCancelled).toBe(true);
  });
  
  it('9. Cannot add fouls to removed players', () => {
    let state = createInitialGameDiscipline([player1]);
    
    state = requestDirectRemoval(state, player1);
    state = confirmAction(state, player1);
    
    state = addRegularFoul(state, player1);
    expect(state.players[player1].regularFouls).toBe(0);
    
    state = addMinorTechFoul(state, player1);
    expect(state.players[player1].minorTechFouls).toBe(0);
  });
});
