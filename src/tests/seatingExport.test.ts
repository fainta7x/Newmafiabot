import { describe, it, expect } from 'vitest';
import { buildSeatingMatrix, generateSeatingSvg, getSafeFilename } from '../lib/seatingExport.ts';
import { Tournament } from '../lib/api.ts';

function createMockTournament(): Tournament {
  const participants = Array.from({ length: 10 }, (_, i) => ({
    id: `part-${i + 1}`,
    tournament_id: 't-1',
    player_id: `player-${i + 1}`,
    display_name: `Игрок_${i + 1}`,
    participant_number: i + 1,
    phone: `+7900000000${i + 1}`,
    telegram_username: `@player_${i + 1}`,
  }));

  const games = Array.from({ length: 10 }, (_, gIdx) => {
    const gameNumber = gIdx + 1;
    // Simple deterministic rotation for seats
    const seats = participants.map((p, pIdx) => {
      const seatNumber = ((pIdx + gIdx) % 10) + 1;
      return {
        id: `seat-${gameNumber}-${p.id}`,
        game_id: `game-${gameNumber}`,
        participant_id: p.id,
        seat_number: seatNumber,
        role: pIdx === 0 ? 'don' : pIdx === 1 ? 'sheriff' : 'citizen',
        display_name: p.display_name,
      };
    });

    return {
      id: `game-${gameNumber}`,
      tournament_id: 't-1',
      game_number: gameNumber,
      judge_name: 'Судья 1',
      status: 'planned' as const,
      winner_team: null,
      started_at: null,
      completed_at: null,
      seats,
    };
  });

  return {
    id: 't-1',
    title: 'Весенний Кубок 2026',
    date: '2026-08-01T18:00:00Z',
    venue: 'Главный Зал',
    status: 'draft',
    created_at: '2026-07-30T00:00:00Z',
    updated_at: '2026-07-30T00:00:00Z',
    participants,
    games,
  };
}

describe('Seating Export Utility Tests', () => {
  it('1. Correctly builds seating matrix for complete 10x10 tournament', () => {
    const t = createMockTournament();
    const result = buildSeatingMatrix(t);

    expect(result.valid).toBe(true);
    expect(result.rows.length).toBe(10);

    for (const row of result.rows) {
      expect(row.displayName).toBeDefined();
      expect(row.gameSeats.length).toBe(10);
      for (const seat of row.gameSeats) {
        expect(seat).toBeGreaterThanOrEqual(1);
        expect(seat).toBeLessThanOrEqual(10);
      }
    }
  });

  it('2. Fails buildSeatingMatrix if participants count is not 10', () => {
    const t = createMockTournament();
    t.participants = t.participants?.slice(0, 9);
    const result = buildSeatingMatrix(t);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 участников');
  });

  it('3. Fails buildSeatingMatrix if a game is missing seats', () => {
    const t = createMockTournament();
    if (t.games && t.games[0]) {
      t.games[0].seats = [];
    }
    const result = buildSeatingMatrix(t);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('отсутствует рассадка');
  });

  it('4. SVG output contains titles and participant names without private phones/roles', () => {
    const t = createMockTournament();
    const result = buildSeatingMatrix(t);
    expect(result.valid).toBe(true);

    const svg = generateSeatingSvg(t, result.rows);

    expect(svg).toContain('Весенний Кубок 2026');
    expect(svg).toContain('Игрок_1');
    expect(svg).toContain('Цифра — номер места игрока');

    // Private / sensitive data checks
    expect(svg).not.toContain('+79000000001');
    expect(svg).not.toContain('@player_1');
    expect(svg).not.toContain('sheriff');
    expect(svg).not.toContain('don');
  });

  it('5. Generates safe filename from tournament title', () => {
    expect(getSafeFilename('Кубок Мафии 2026!')).toBe('rassadka_кубок_мафии_2026.png');
    expect(getSafeFilename('   ')).toBe('rassadka_tournament.png');
  });
});
