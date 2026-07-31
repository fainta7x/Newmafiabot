/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, fireEvent, screen } from '@testing-library/react';
import { GameProtocolModal, formatColorMark, getProtocolPayload, buildLegacyTechFoulClassification } from '../components/crm/tournaments/GameProtocolModal';
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

  it('loads backup from localStorage, calls saveGameProtocol, and removes backup on success', async () => {
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

    await waitFor(() => {
      expect(localStorage.getItem(backupKey)).toBeNull();
    });
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

    it('Scenario 3: Invalid penalty_points inputs are rejected', async () => {
      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: mockProtocol as any,
        player_results: mockPlayerResults as any
      });

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-1'));

      const player1PenaltyInput = screen.getByTestId('penalty-p-1');

      fireEvent.change(player1PenaltyInput, { target: { value: '1abc' } });
      expect(await screen.findByText(/Некорректное значение/i)).toBeTruthy();
    });

    it('Scenario 4: Game minus error blocks completeGameProtocol', async () => {
      const validResults = mockPlayerResults.map((p, i) => {
        if (i === 0) return { ...p, exit_type: 'killed' };
        return { ...p, exit_type: 'alive' };
      });

      vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
        game: mockGame as any,
        protocol: { ...mockProtocol, winner_team: 'red', first_killed_participant_id: 'p-1' } as any,
        player_results: validResults as any
      });

      const completeSpy = vi.spyOn(api, 'completeGameProtocol');

      render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());

      fireEvent.click(screen.getByTestId('player-row-p-2'));

      const p2Input = screen.getByTestId('penalty-p-2');
      fireEvent.change(p2Input, { target: { value: 'invalid' } });

      const finishBtn = screen.getByText(/Завершить протокол/i);
      fireEvent.click(finishBtn);

      await waitFor(() => {
        expect(completeSpy).not.toHaveBeenCalled();
        expect(screen.getByText(/Исправьте ошибки в полях штрафных баллов перед завершением/i)).toBeTruthy();
      });
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

      // Detailed form inputs (like penalty-p-1) should not be visible before expansion
      expect(screen.queryByTestId('penalty-p-1')).toBeNull();
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
      expect(screen.getByTestId('penalty-p-1')).toBeTruthy();

      // Click again to collapse
      fireEvent.click(row1);
      expect(screen.queryByTestId('penalty-p-1')).toBeNull();
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
      expect(screen.getAllByText('Игр. −0.2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Судья +0.5').length).toBeGreaterThan(0);
    });
  });
});
