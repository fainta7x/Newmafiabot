/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { GameProtocolModal, formatColorMark } from '../components/crm/tournaments/GameProtocolModal';
import { api } from '../lib/api';

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

  const mockPlayerResults = Array.from({ length: 10 }, (_, i) => ({
    participant_id: `p-${i + 1}`,
    seat_number: i + 1,
    display_name: `Player ${i + 1}`,
    role: 'citizen',
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
  }));

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('loads backup from localStorage, calls saveGameProtocol, and removes backup on success', async () => {
    vi.spyOn(api, 'getGameProtocol').mockResolvedValue({
      game: mockGame as any,
      protocol: mockProtocol as any,
      player_results: mockPlayerResults as any
    });

    const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockResolvedValue({
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
});
