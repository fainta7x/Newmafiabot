/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, fireEvent, screen } from '@testing-library/react';
import { GameProtocolModal, formatColorMark, getProtocolPayload, buildLegacyTechFoulClassification, formatSignedBonus } from '../components/crm/tournaments/GameProtocolModal';
import { TournamentDetailView } from '../components/crm/tournaments/TournamentDetailView';
import { api } from '../lib/api';

import { calculateDisciplinaryPenalty } from '../lib/gameDiscipline';

describe('Disciplinary Penalty Scenarios', () => {
  it('Scenario 1: 1 minor tech foul = -0.3', () => {
    expect(calculateDisciplinaryPenalty(1, 0, false, false)).toBe(0.3);
  });

  it('Scenario 2: 2 minor tech fouls = -0.6 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(2, 0, true, false)).toBe(1.6);
  });

  it('Scenario 3: 1 major tech foul = -0.6', () => {
    expect(calculateDisciplinaryPenalty(0, 1, false, false)).toBe(0.6);
  });

  it('Scenario 4: 2 major tech fouls = -1.2 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(0, 2, true, false)).toBe(2.2);
  });

  it('Scenario 5: 1 minor + 1 major = -0.9 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(1, 1, true, false)).toBe(1.9);
  });

  it('Scenario 6: Removal by judge (exit_type=removed) = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, true, false)).toBe(1.0);
  });

  it('Scenario 7: Removal by judge + 1 minor tech foul = -1.3', () => {
    expect(calculateDisciplinaryPenalty(1, 0, true, false)).toBe(1.3);
  });

  it('Scenario 8: PPK culprit (isPpkCulprit=true) = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, false, true)).toBe(1.0);
  });

  it('Scenario 9: PPK culprit + 2 minor tech fouls = -1.6', () => {
    // Note: PPK culprit is not necessarily "removed" in the same sense as foul removal, but gets +1.0
    expect(calculateDisciplinaryPenalty(2, 0, false, true)).toBe(1.6);
  });

  it('Scenario 10: Removal for 4 fouls = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, true, false)).toBe(1.0);
  });
});

describe('GameProtocolModal Frontend Helpers', () => {
  it('formats color marks correctly', () => {
    expect(formatColorMark({ seat_numbers: [4], mark: 'red' })).toBe('4 кр');
    expect(formatColorMark({ seat_numbers: [2, 1], mark: 'black' })).toBe('1 2 ч');
    expect(formatColorMark({ seat_numbers: [5], mark: 'sheriff' })).toBe('5 ш');
    expect(formatColorMark({ seat_numbers: [8, 3], mark: 'red' })).toBe('3 8 кр');
  });

  it('handles empty or missing seat_numbers gracefully', () => {
    expect(formatColorMark({ seat_numbers: [], mark: 'red' })).toBe(' кр');
    expect(formatColorMark(null as any)).toBe('');
  });
});

describe('GameProtocolModal Backup & Auto-Save Component Tests', () => {
  const tournamentId = 'test-tourn-id';
  const gameId = 'test-game-id';
  const backupKey = `tournament_protocol_backup_${gameId}`;

  const mockGame = {
    id: gameId,
    tournament_id: tournamentId,
    game_number: 1,
    table_number: 1,
    status: 'active'
  };

  const mockProtocol = {
    game_id: gameId,
    status: 'draft',
    winner_team: null,
    first_killed_participant_id: null,
    zero_round_voted_participant_id: null,
    best_move_participant_id: null,
    best_move_source: null,
    best_move_seats: [],
    votes: [],
    shots: [],
    replacement: null,
    judge_notes: null,
    best_move_score: 0,
    updated_at: '2026-01-01T00:00:00.000Z'
  };

  const mockPlayerResults = Array.from({ length: 10 }, (_, i) => {
    const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
    return {
      participant_id: `p-${i + 1}`,
      seat_number: i + 1,
      display_name: `Player ${i + 1}`,
      role: roles[i],
      exit_type: 'alive',
      exit_order: null,
      regular_fouls: 0,
      technical_fouls: 0,
      judge_bonus: 0,
      protocol_bonus: 0,
      penalty_points: 0,
      ci_points: 0,
      color_protocol: [],
      notes: null
    };
  });

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('keeps localStorage backup until the full IndexedDB backup is confirmed', async () => {
    vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
      game: mockGame as any,
      protocol: mockProtocol as any,
      player_results: mockPlayerResults as any
    });

    const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockResolvedValue({
      game: mockGame as any,
      protocol: { ...mockProtocol, winner_team: 'red' } as any,
      player_results: mockPlayerResults as any
    });

    const backupData = {
      updatedAt: '2026-02-01T00:00:00.000Z',
      protocol: { ...mockProtocol, winner_team: 'red' },
      playerResults: mockPlayerResults
    };
    localStorage.setItem(backupKey, JSON.stringify(backupData));

    render(
      <GameProtocolModal
        tournamentId={tournamentId}
        gameId={gameId}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });

    expect(localStorage.getItem(backupKey)).toBe(JSON.stringify(backupData));
  });

  it('retains backup in localStorage if saveGameProtocol fails', async () => {
    vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
      game: mockGame as any,
      protocol: mockProtocol as any,
      player_results: mockPlayerResults as any
    });

    const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockRejectedValue(new Error('Network failure'));

    const backupData = {
      updatedAt: '2026-02-01T00:00:00.000Z',
      protocol: { ...mockProtocol, winner_team: 'black' },
      playerResults: mockPlayerResults
    };
    localStorage.setItem(backupKey, JSON.stringify(backupData));

    render(
      <GameProtocolModal
        tournamentId={tournamentId}
        gameId={gameId}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });

    expect(localStorage.getItem(backupKey)).not.toBeNull();
  });

  it('renders technical foul classification buttons (minor/major)', async () => {
    vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
      game: mockGame as any,
      protocol: mockProtocol as any,
      player_results: mockPlayerResults as any
    });

    const { getByText, getAllByText, getByTestId } = render(
      <GameProtocolModal
        tournamentId={tournamentId}
        gameId={gameId}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(getByText('Player 1')).toBeTruthy();
    });

    // Expand player row to reveal detailed fields
    fireEvent.click(getByTestId('player-row-p-1'));

    // Check for minor and major tech foul labels
    expect(getAllByText(/Малый тех/i).length).toBeGreaterThan(0);
    expect(getAllByText(/Большой тех/i).length).toBeGreaterThan(0);
  });

  describe('Disciplinary Edge Cases and Validation', () => {
    it('Scenario 1: Payload contains correct minor/major tech fouls and removal_reason', async () => {
      const results = [
        { ...mockPlayerResults[0], minor_technical_fouls: 1, major_technical_fouls: 1, exit_type: 'removed', removal_reason: '2nd_tech' },
        ...mockPlayerResults.slice(1)
      ] as any;

      const payload = getProtocolPayload(mockProtocol as any, results);
      const p1 = payload.player_results[0];

      expect(p1.minor_technical_fouls).toBe(1);
      expect(p1.major_technical_fouls).toBe(1);
      expect(p1.technical_fouls).toBe(2);
      expect(p1.exit_type).toBe('removed');
      expect(p1.removal_reason).toBe('2nd_tech');
      expect(p1.disciplinary_penalty_points).toBe(1.9);
    });

    it('Scenario 2: Classification of two old tech fouls returns removed and 2nd_tech', () => {
      const res2 = buildLegacyTechFoulClassification(1, 1);
      expect(res2.minor_technical_fouls).toBe(1);
      expect(res2.major_technical_fouls).toBe(1);
      expect(res2.technical_fouls).toBe(2);
      expect(res2.exit_type).toBe('removed');
      expect(res2.removal_reason).toBe('2nd_tech');

      const res1 = buildLegacyTechFoulClassification(1, 0);
      expect(res1.minor_technical_fouls).toBe(1);
      expect(res1.major_technical_fouls).toBe(0);
      expect(res1.technical_fouls).toBe(1);
      expect(res1.exit_type).toBeUndefined();
      expect(res1.removal_reason).toBeUndefined();
    });

    it('Scenario 3: Penalty points, protocol bonus, and judge bonus use steppers instead of text inputs', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      const player1PenaltyContainer = screen.getByTestId('judge-bonus-p-1');
      expect(player1PenaltyContainer).toBeTruthy();

      // Ensure no text inputs exist for penalty_points, protocol_bonus, or judge_bonus in player card
      const textInputs = player1PenaltyContainer.querySelectorAll('input');
      expect(textInputs.length).toBe(0);
    });

    it('Scenario 4: Judge bonus stepper adjusts judge_bonus within range', async () => {
      const validResults = mockPlayerResults.map((p, i) => {
        if (i === 0) return { ...p, exit_type: 'killed' };
        return { ...p, exit_type: 'alive' };
      });

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: { ...mockProtocol, winner_team: 'red', first_killed_participant_id: 'p-1' } as any,
        player_results: validResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      const increasePenaltyBtn = screen.getByRole('button', { name: 'Увеличить балл судьи' });
      expect(increasePenaltyBtn).toBeTruthy();
      fireEvent.click(increasePenaltyBtn);
    });

    it('Scenario 5: Unknown PPK role blocks confirmation and shows helper text', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: [
          { ...mockPlayerResults[0], role: null }, // Unknown role
          ...mockPlayerResults.slice(1)
        ] as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      const ppkBtn = screen.getAllByText('ППК')[0];
      fireEvent.click(ppkBtn);

      expect(screen.getByText(/Сначала назначьте роль участнику/i)).toBeTruthy();
      expect(screen.getByText(/Победитель: Не определён/i)).toBeTruthy();

      const confirmBtn = screen.getByText('Подтвердить') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    it('Scenario 6: Completed protocol prevents classification of old tech fouls', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: { ...mockProtocol, status: 'completed' } as any,
        player_results: [
          { ...mockPlayerResults[0], technical_fouls: 1 },
          ...mockPlayerResults.slice(1)
        ] as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      await waitFor(() => expect(screen.getByText(/1 малый/)).toBeTruthy());
      const btn = screen.getByText(/1 малый/) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Scenario 7: Known removal reason cannot be overridden via status select', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: [
          { ...mockPlayerResults[0], removal_reason: '4th_foul', exit_type: 'removed' },
          ...mockPlayerResults.slice(1)
        ] as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      // The status select should be disabled
      const selects = screen.getAllByRole('combobox');
      // Status select is usually the first one in the player row
      const player1StatusSelect = selects.find(s => (s as HTMLSelectElement).value === 'removed') as HTMLSelectElement;
      expect(player1StatusSelect.disabled).toBe(true);
    });

    it('Scenario 8: Removed player can still be assigned PPK', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: [
          { ...mockPlayerResults[0], exit_type: 'removed', removal_reason: 'direct', role: 'citizen' },
          ...mockPlayerResults.slice(1)
        ] as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      const ppkBtns = screen.getAllByText('ППК');
      const ppkBtn = ppkBtns[0] as HTMLButtonElement;
      expect(ppkBtn.disabled).toBe(false);

      fireEvent.click(ppkBtn);
      expect(screen.getByText(/Победитель: Чёрные/i)).toBeTruthy();
    });
  });

  describe('GameProtocolModal Compact Mobile UI', () => {
    it('renders 10 compact player rows initially with forms collapsed', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Check all 10 compact player rows exist
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByTestId(`player-row-p-${i}`)).toBeTruthy();
      }

      // Detailed form inputs (like judge-bonus-p-1) should not be visible before expansion
      expect(screen.queryByTestId('judge-bonus-p-1')).toBeNull();
    });

    it('toggles expansion when clicking a player row header', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const row1 = screen.getByTestId('player-row-p-1');
      fireEvent.click(row1);

      // Detailed form input should now be visible
      expect(screen.getByTestId('judge-bonus-p-1')).toBeTruthy();

      // Click again to collapse
      fireEvent.click(row1);
      expect(screen.queryByTestId('judge-bonus-p-1')).toBeNull();
    });

    it('displays brief badges for non-zero fouls, tech fouls, and bonuses in compact row', async () => {
      const customResults = mockPlayerResults.map((p, idx) => {
        if (idx === 0) {
          return {
            ...p,
            regular_fouls: 2,
            minor_technical_fouls: 1,
            penalty_points: 0.2,
            judge_bonus: 0.5
          };
        }
        return p;
      });

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: customResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      expect(screen.getAllByText('Ф: 2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('мТ: 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Судья +0.5').length).toBeGreaterThan(0);
    });
  });

  describe('Auto-Save UX & Silent Refresh Regression Tests', () => {
    const testTournId = 'test-tourn-id-ux';
    const testGameId = 'test-game-id-ux';

    const mockGame = {
      id: testGameId,
      tournament_id: testTournId,
      game_number: 1,
      table_number: 1,
      status: 'active'
    };

    const validRoles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];

    const mockProtocol = {
      game_id: testGameId,
      status: 'draft',
      winner_team: 'red',
      first_killed_participant_id: null,
      zero_round_voted_participant_id: null,
      best_move_participant_id: null,
      best_move_source: null,
      best_move_seats: [],
      votes: [],
      shots: [],
      replacement: null,
      judge_notes: null,
      best_move_score: 0,
      updated_at: '2026-01-01T00:00:00.000Z'
    };

    const mockPlayerResults = Array.from({ length: 10 }, (_, i) => ({
      participant_id: `p-${i + 1}`,
      display_name: `Player ${i + 1}`,
      seat_number: i + 1,
      role: validRoles[i],
      exit_type: 'alive',
      removal_reason: null,
      regular_fouls: 0,
      minor_technical_fouls: 0,
      major_technical_fouls: 0,
      technical_fouls: 0,
      judge_bonus: 0,
      protocol_bonus: 0,
      penalty_points: 0,
      disciplinary_penalty_points: 0,
      color_protocol: [],
      notes: ''
    }));

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('1-7: Auto-save triggers after debounce without calling onProtocolUpdated or unmounting, preserving tab & expanded player', async () => {
      const onProtocolUpdatedSpy = vi.fn();
      const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: { ...mockProtocol, updated_at: new Date().toISOString() } as any,
        player_results: mockPlayerResults as any
      });

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={testTournId}
          gameId={testGameId}
          isOpen={true}
          onClose={() => {}}
          onProtocolUpdated={onProtocolUpdatedSpy}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Expand player row p-1
      const row1 = screen.getByTestId('player-row-p-1');
      fireEvent.click(row1);
      expect(screen.getByTestId('judge-bonus-p-1')).toBeTruthy();

      // Trigger field change by changing status of player 1 to voted_day
      const statusSelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(statusSelect, { target: { value: 'voted_day' } });

      // Verify saveGameProtocol not called immediately before debounce timer
      expect(saveSpy).not.toHaveBeenCalled();

      // Wait for 1500ms auto-save debounce
      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledTimes(1);
      }, { timeout: 4000 });

      // 3: onProtocolUpdated was NOT called for draft auto-save
      expect(onProtocolUpdatedSpy).not.toHaveBeenCalled();

      // 4, 5, 6: Modal is still mounted, player p-1 is still expanded and input is present
      expect(screen.getByText('Player 1')).toBeTruthy();
      expect(screen.getByTestId('judge-bonus-p-1')).toBeTruthy();
    });

    it('8: onProtocolUpdated is called exactly ONCE after successful protocol completion', async () => {
      const onProtocolUpdatedSpy = vi.fn();

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      vi.spyOn(api, 'completeGameProtocol').mockResolvedValue({
        game: { ...mockGame, status: 'completed' } as any,
        protocol: { ...mockProtocol, status: 'completed' } as any,
        player_results: mockPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={testTournId}
          gameId={testGameId}
          isOpen={true}
          onClose={() => {}}
          onProtocolUpdated={onProtocolUpdatedSpy}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Click completion button
      const completeBtn = screen.getByRole('button', { name: /Завершить протокол/i });
      fireEvent.click(completeBtn);

      // Confirm completion
      const confirmBtn = screen.getByRole('button', { name: /Подтвердить завершение/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(onProtocolUpdatedSpy).toHaveBeenCalledTimes(1));
    });

    it('9: onProtocolUpdated is called exactly ONCE after successful revert to draft', async () => {
      const onProtocolUpdatedSpy = vi.fn();

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: { ...mockProtocol, status: 'completed' } as any,
        player_results: mockPlayerResults as any
      });

      vi.spyOn(api, 'revertGameProtocolToDraft').mockResolvedValue({
        game: { ...mockGame, status: 'active' } as any,
        protocol: { ...mockProtocol, status: 'draft' } as any,
        player_results: mockPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={testTournId}
          gameId={testGameId}
          isOpen={true}
          onClose={() => {}}
          onProtocolUpdated={onProtocolUpdatedSpy}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Click revert to draft button
      const revertBtn = screen.getByRole('button', { name: /Вернуть в черновик/i });
      fireEvent.click(revertBtn);

      // Confirm revert
      const confirmBtn = screen.getByRole('button', { name: /Да, вернуть в черновик/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(onProtocolUpdatedSpy).toHaveBeenCalledTimes(1));
    });

    it('10: Silent update in TournamentDetailView does not display full-screen loading or unmount modal', async () => {
      const mockTournament = {
        id: testTournId,
        title: 'Test Tournament UX',
        status: 'active',
        games: [mockGame]
      };

      vi.spyOn(api, 'getTournament').mockResolvedValue(mockTournament as any);
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(<TournamentDetailView tournamentId={testTournId} onBack={() => {}} />);

      await waitFor(() => expect(screen.getByText('Test Tournament UX')).toBeTruthy());

      // Open modal
      const gamesTab = screen.getByRole('button', { name: /Игры/i });
      fireEvent.click(gamesTab);
      const protocolBtn = screen.getByRole('button', { name: /Протокол/i });
      fireEvent.click(protocolBtn);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Loading screen should not be present
      expect(screen.queryByText('Загрузка данных турнира...')).toBeNull();
      // Modal remains open
      expect(screen.getByText('Player 1')).toBeTruthy();
    });
  });

  describe('GameProtocolModal Custom Voting Tests', () => {
    const localTournId = 'local-tourn';
    const localGameId = 'local-game';
    const localGame = {
      id: localGameId,
      tournament_id: localTournId,
      game_number: 1,
      table_number: 1,
      status: 'active'
    };
    const localPlayerResults = Array.from({ length: 10 }, (_, i) => {
      const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
      return {
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: roles[i],
        exit_type: 'alive',
        exit_order: null,
        regular_fouls: 0,
        technical_fouls: 0,
        judge_bonus: 0,
        protocol_bonus: 0,
        penalty_points: 0,
        ci_points: 0,
        color_protocol: [],
        notes: null
      };
    });
    const baseLocalProtocol = {
      game_id: localGameId,
      status: 'draft',
      winner_team: 'red',
      first_killed_participant_id: null,
      zero_round_voted_participant_id: null,
      best_move_participant_id: null,
      best_move_source: null,
      best_move_seats: [],
      votes: [],
      shots: [],
      replacement: null,
      judge_notes: null,
      best_move_score: 0,
      updated_at: '2026-01-01T00:00:00.000Z'
    };

    it('1. Clears vote 0, inputs 5, field shows 5 and not 05', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 0, 2: 0 },
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      const inputs = screen.getAllByRole('textbox');
      const input1 = inputs[0] as HTMLInputElement;
      expect(input1.value).toBe('0');

      fireEvent.change(input1, { target: { value: '' } });
      expect(input1.value).toBe('');

      fireEvent.change(input1, { target: { value: '5' } });
      expect(input1.value).toBe('5');
    });

    it('2. In zero round, the number of voters is strictly 10 and the selector is disabled', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 0,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      const selectElements = screen.getAllByRole('combobox');
      const votersSelect = selectElements[1] as HTMLSelectElement;
      expect(votersSelect.value).toBe('10');
      expect(votersSelect.disabled).toBe(true);
    });

    it('3. With a single leader in a revote round, the final poll table_leave_votes block is not rendered', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: true,
            parent_round_number: null,
            nominated_seats: [1, 2],
            vote_counts: { 1: 7, 2: 3 },
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      expect(screen.queryByText(/Голоса за уход всех спорных игроков/i)).toBeNull();
    });

    it('4. With a repeat tie and empty table_leave_votes, confirmation is not available', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            outcome: 'tie_revote'
          },
          {
            round_number: 2,
            day_number: 1,
            eligible_voters: 10,
            is_revote: true,
            parent_round_number: 1,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            table_leave_votes: null,
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      const confirmBtn = screen.getByRole('button', { name: /Подтвердить исход/i }) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    it('5. After explicit input of 0, confirmation becomes available and indicates nobody leaves', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            outcome: 'tie_revote'
          },
          {
            round_number: 2,
            day_number: 1,
            eligible_voters: 10,
            is_revote: true,
            parent_round_number: 1,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            table_leave_votes: null,
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      const leaveInput = screen.getByText(/Голоса за уход всех спорных игроков/i).parentElement?.querySelector('input') as HTMLInputElement;
      fireEvent.change(leaveInput, { target: { value: '0' } });

      await waitFor(() => {
        const confirmBtn = screen.getByRole('button', { name: /Подтвердить исход/i }) as HTMLButtonElement;
        expect(confirmBtn.disabled).toBe(false);
        expect(screen.getByText(/Никто не покидает стол/i)).toBeTruthy();
      });
    });

    it('6. Validation error from another tab switches to Votes and triggers scrollIntoView', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 4 },
            outcome: 'pending'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      const scrollIntoViewMock = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const completeBtn = screen.getByRole('button', { name: /Завершить протокол/i });
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });

      expect(screen.getByText(/сумма распределённых голосов/i)).toBeTruthy();
    });

    it('7. Deleting parent round also filters out child revote round', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 5, 2: 5 },
            outcome: 'tie_revote'
          },
          {
            round_number: 2,
            day_number: 1,
            eligible_voters: 10,
            is_revote: true,
            parent_round_number: 1,
            nominated_seats: [1, 2],
            vote_counts: { 1: 6, 2: 4 },
            outcome: 'single_eliminated'
          }
        ]
      };
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      expect(screen.getByText(/Круг #1/i)).toBeTruthy();
      expect(screen.getByText(/Круг #2/i)).toBeTruthy();

      const deleteButtons = screen.getAllByRole('button').filter(b => b.className.includes('hover:text-rose-400'));
      expect(deleteButtons.length).toBe(2);

      fireEvent.click(deleteButtons[0]);

      expect(screen.queryByText(/Круг #1/i)).toBeNull();
      expect(screen.queryByText(/Круг #2/i)).toBeNull();
    });

    it('8. After renumbering, parent_round_number continues to refer to the correct parent round', async () => {
      const customProtocol = {
        ...baseLocalProtocol,
        votes: [
          {
            round_number: 1,
            day_number: 1,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [1, 2],
            vote_counts: { 1: 6, 2: 4 },
            outcome: 'single_eliminated'
          },
          {
            round_number: 2,
            day_number: 2,
            eligible_voters: 10,
            is_revote: false,
            nominated_seats: [3, 4],
            vote_counts: { 3: 5, 4: 5 },
            outcome: 'tie_revote'
          },
          {
            round_number: 3,
            day_number: 2,
            eligible_voters: 10,
            is_revote: true,
            parent_round_number: 2,
            nominated_seats: [3, 4],
            vote_counts: { 3: 6, 4: 4 },
            outcome: 'single_eliminated'
          }
        ]
      };
      const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: localGame as any,
        protocol: customProtocol as any,
        player_results: localPlayerResults as any
      });

      render(
        <GameProtocolModal
          tournamentId={localTournId}
          gameId={localGameId}
          isOpen={true}
          onClose={() => {}}
        />
      );

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const votesTab = screen.getByRole('button', { name: /Голоса/i });
      fireEvent.click(votesTab);

      expect(screen.getByText(/Круг #1/i)).toBeTruthy();
      expect(screen.getByText(/Круг #2/i)).toBeTruthy();
      expect(screen.getByText(/Круг #3/i)).toBeTruthy();

      const deleteButtons = screen.getAllByRole('button').filter(b => b.className.includes('hover:text-rose-400'));
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalled();
      }, { timeout: 4000 });

      const lastCallPayload = saveSpy.mock.calls[saveSpy.mock.calls.length - 1][2];
      const savedVotes = lastCallPayload?.protocol?.votes;
      expect(savedVotes).toBeDefined();
      if (savedVotes) {
        expect(savedVotes.length).toBe(2);
        expect(savedVotes[0].round_number).toBe(1);
        expect(savedVotes[1].round_number).toBe(2);
        expect(savedVotes[1].parent_round_number).toBe(1);
      }
    });
  });

  describe('Compact Player Badges Formatting', () => {
    const badgeTournId = 'badge-tourn';
    const badgeGameId = 'badge-game';
    const badgeGame = {
      id: badgeGameId,
      tournament_id: badgeTournId,
      game_number: 1,
      table_number: 1,
      status: 'active'
    };
    const baseProtocol = {
      game_id: badgeGameId,
      status: 'draft',
      winner_team: 'red',
      first_killed_participant_id: null,
      zero_round_voted_participant_id: null,
      best_move_participant_id: null,
      best_move_source: null,
      best_move_seats: [],
      votes: [],
      shots: [],
      replacement: null,
      judge_notes: null,
      best_move_score: 0,
      updated_at: '2026-01-01T00:00:00.000Z'
    };

    it('unit test formatSignedBonus helper', () => {
      expect(formatSignedBonus(0.2)).toEqual({ formatted: '+0.2', sign: 'positive', num: 0.2 });
      expect(formatSignedBonus(-0.2)).toEqual({ formatted: '−0.2', sign: 'negative', num: -0.2 });
      expect(formatSignedBonus(-0.6)).toEqual({ formatted: '−0.6', sign: 'negative', num: -0.6 });
      expect(formatSignedBonus(0)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
      expect(formatSignedBonus(-0)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
      expect(formatSignedBonus(null)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
    });

    it('1. protocol_bonus = -0.2 -> visible Прот. −0.2, Без отметок is absent for this player', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: 'citizen',
        exit_type: 'alive',
        regular_fouls: 0,
        minor_technical_fouls: 0,
        major_technical_fouls: 0,
        judge_bonus: 0,
        protocol_bonus: i === 0 ? -0.2 : 0,
        penalty_points: 0,
        color_protocol: []
      }));

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: badgeGame as any,
        protocol: baseProtocol as any,
        player_results: results as any
      });

      render(<GameProtocolModal tournamentId={badgeTournId} gameId={badgeGameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      // Player 1 has protocol_bonus = -0.2
      const player1Row = screen.getByTestId('player-row-p-1');
      expect(player1Row.textContent).toContain('Прот. −0.2');
      expect(player1Row.textContent).not.toContain('Без отметок');

      // Player 2 has no marks -> Bez otmetok
      const player2Row = screen.getByTestId('player-row-p-2');
      expect(player2Row.textContent).toContain('Без отметок');
    });

    it('2. protocol_bonus = +0.2 -> visible Прот. +0.2', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: 'citizen',
        exit_type: 'alive',
        regular_fouls: 0,
        minor_technical_fouls: 0,
        major_technical_fouls: 0,
        judge_bonus: 0,
        protocol_bonus: i === 0 ? 0.2 : 0,
        penalty_points: 0,
        color_protocol: []
      }));

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: badgeGame as any,
        protocol: baseProtocol as any,
        player_results: results as any
      });

      render(<GameProtocolModal tournamentId={badgeTournId} gameId={badgeGameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const player1Row = screen.getByTestId('player-row-p-1');
      expect(player1Row.textContent).toContain('Прот. +0.2');
      expect(player1Row.textContent).not.toContain('Без отметок');
    });

    it('3. judge_bonus = -0.6 -> visible Судья −0.6', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: 'citizen',
        exit_type: 'alive',
        regular_fouls: 0,
        minor_technical_fouls: 0,
        major_technical_fouls: 0,
        judge_bonus: i === 0 ? -0.6 : 0,
        protocol_bonus: 0,
        penalty_points: 0,
        color_protocol: []
      }));

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: badgeGame as any,
        protocol: baseProtocol as any,
        player_results: results as any
      });

      render(<GameProtocolModal tournamentId={badgeTournId} gameId={badgeGameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const player1Row = screen.getByTestId('player-row-p-1');
      expect(player1Row.textContent).toContain('Судья −0.6');
      expect(player1Row.textContent).not.toContain('Без отметок');
    });

    it('4. All values zero -> visible Без отметок', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: 'citizen',
        exit_type: 'alive',
        regular_fouls: 0,
        minor_technical_fouls: 0,
        major_technical_fouls: 0,
        judge_bonus: 0,
        protocol_bonus: 0,
        penalty_points: 0,
        color_protocol: []
      }));

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: badgeGame as any,
        protocol: baseProtocol as any,
        player_results: results as any
      });

      render(<GameProtocolModal tournamentId={badgeTournId} gameId={badgeGameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      for (let i = 1; i <= 10; i++) {
        const playerRow = screen.getByTestId(`player-row-p-${i}`);
        expect(playerRow.textContent).toContain('Без отметок');
      }
    });

    it('5. No +- or −- strings anywhere in the rendered modal', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        participant_id: `p-${i + 1}`,
        seat_number: i + 1,
        display_name: `Player ${i + 1}`,
        role: 'citizen',
        exit_type: 'alive',
        regular_fouls: i % 2,
        minor_technical_fouls: i % 2,
        major_technical_fouls: 0,
        judge_bonus: -0.6 + i * 0.1,
        protocol_bonus: -0.4 + i * 0.1,
        penalty_points: 0,
        color_protocol: []
      }));

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: badgeGame as any,
        protocol: baseProtocol as any,
        player_results: results as any
      });

      const { container } = render(<GameProtocolModal tournamentId={badgeTournId} gameId={badgeGameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      const html = container.innerHTML;
      expect(html).not.toContain('+-');
      expect(html).not.toContain('−−');
      expect(html).not.toContain('−-');
      expect(html).not.toContain('-−');
    });
  });
});
