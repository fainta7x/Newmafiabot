import { describe, it, expect } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import {
  restoreTournamentBogdana,
  validateSeatingMatrix,
  BOGDANA_PLAYERS,
  BOGDANA_TOURNAMENT_TITLE,
  BOGDANA_TOURNAMENT_DATE,
  BOGDANA_TOURNAMENT_VENUE,
  BOGDANA_TOURNAMENT_STAGE,
  BOGDANA_SEATING_MATRIX,
} from '../db/restoreTournamentBogdana.ts';

describe('Restore Tournament Bogdana 1.08 Integration Tests', () => {
  it('1. Programmatic matrix validation verifies 100 valid seats across 10 games', () => {
    expect(() => validateSeatingMatrix(BOGDANA_PLAYERS, BOGDANA_SEATING_MATRIX)).not.toThrow();

    // Invalid matrix with duplicate seat in game 1
    const invalidMatrix = JSON.parse(JSON.stringify(BOGDANA_SEATING_MATRIX));
    invalidMatrix['Богданчик'][0] = 10; // Duplicate seat 10 with Вид in game 1
    expect(() => validateSeatingMatrix(BOGDANA_PLAYERS, invalidMatrix)).toThrow(/В игре №1 некорректная рассадка мест/);
  });

  it('2. Fresh restore creates 10 players, 1 tournament, 10 participants, 10 planned games, and 100 seats', async () => {
    const db = createDatabaseConnection(':memory:');

    const result = await restoreTournamentBogdana(db);

    expect(result.action).toBe('created');
    expect(result.createdPlayers).toHaveLength(10);
    expect(result.reusedPlayers).toHaveLength(0);
    expect(result.participantCount).toBe(10);
    expect(result.gameCount).toBe(10);
    expect(result.seatCount).toBe(100);

    // Verify metadata
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE title = ?', [BOGDANA_TOURNAMENT_TITLE]);
    expect(tournament).not.toBeNull();
    expect(tournament.date).toBe(BOGDANA_TOURNAMENT_DATE);
    expect(tournament.venue).toBe(BOGDANA_TOURNAMENT_VENUE);
    expect(tournament.stage).toBe(BOGDANA_TOURNAMENT_STAGE);
    expect(tournament.status).toBe('draft');
    expect(tournament.chief_judge_name).toBeNull();
    expect(tournament.notes).toBeNull();

    // Verify 10 players created with null optional data
    const players = await db.all<any>('SELECT * FROM players ORDER BY created_at ASC');
    expect(players).toHaveLength(10);
    for (const p of players) {
      expect(p.full_name).toBeNull();
      expect(p.phone).toBeNull();
      expect(p.telegram_username).toBeNull();
    }

    // Verify 10 participants
    const participants = await db.all<any>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC',
      [tournament.id]
    );
    expect(participants).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(participants[i].participant_number).toBe(i + 1);
      expect(participants[i].display_name).toBe(BOGDANA_PLAYERS[i]);
    }

    // Verify 10 games
    const games = await db.all<any>(
      'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
      [tournament.id]
    );
    expect(games).toHaveLength(10);
    for (let g = 0; g < 10; g++) {
      expect(games[g].game_number).toBe(g + 1);
      expect(games[g].status).toBe('planned');
      expect(games[g].judge_name).toBeNull();
    }

    // Verify seating matrix
    const seats = await db.all<any>(
      `SELECT s.*, tp.participant_number, tp.display_name, g.game_number
       FROM tournament_game_seats s
       JOIN tournament_participants tp ON tp.id = s.participant_id
       JOIN tournament_games g ON g.id = s.game_id
       WHERE g.tournament_id = ?`,
      [tournament.id]
    );
    expect(seats).toHaveLength(100);

    for (const seat of seats) {
      expect(seat.role).toBeNull();
      const expectedSeatNum = BOGDANA_SEATING_MATRIX[seat.display_name][seat.game_number - 1];
      expect(seat.seat_number).toBe(expectedSeatNum);
    }
  });

  it('3. Re-running restore on already restored DB changes nothing and creates no duplicates', async () => {
    const db = createDatabaseConnection(':memory:');

    const firstRun = await restoreTournamentBogdana(db);
    expect(firstRun.action).toBe('created');

    const secondRun = await restoreTournamentBogdana(db);
    expect(secondRun.action).toBe('already_restored');
    expect(secondRun.createdPlayers).toHaveLength(0);
    expect(secondRun.reusedPlayers).toHaveLength(10);
    expect(secondRun.message).toContain('Турнир уже восстановлен');

    const playerCount = await db.get<any>('SELECT COUNT(*) as count FROM players');
    expect(playerCount.count).toBe(10);

    const tournamentCount = await db.get<any>('SELECT COUNT(*) as count FROM tournaments');
    expect(tournamentCount.count).toBe(1);
  });

  it('4. Reuses existing players if nicknames match', async () => {
    const db = createDatabaseConnection(':memory:');

    // Pre-create one player
    const existingId = 'existing_bogdanchik_id';
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at)
       VALUES (?, 'БОГДАНЧИК', 'normal', 'normal', 1000, 0, ?, ?)`,
      [existingId, now, now]
    );

    const result = await restoreTournamentBogdana(db);
    expect(result.action).toBe('created');
    expect(result.reusedPlayers).toContain('Богданчик');
    expect(result.createdPlayers).not.toContain('Богданчик');

    const bogdanchikParticipant = await db.get<any>(
      `SELECT tp.* FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       WHERE t.title = ? AND tp.participant_number = 1`,
      [BOGDANA_TOURNAMENT_TITLE]
    );
    expect(bogdanchikParticipant.player_id).toBe(existingId);
  });

  it('5. Re-creates draft tournament if structure is incomplete but no game data exists', async () => {
    const db = createDatabaseConnection(':memory:');

    await restoreTournamentBogdana(db);

    // Modify tournament date in draft
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE title = ?', [BOGDANA_TOURNAMENT_TITLE]);
    await db.run("UPDATE tournaments SET venue = 'Другой зал' WHERE id = ?", [tournament.id]);

    const reRun = await restoreTournamentBogdana(db);
    expect(reRun.action).toBe('recreated');
    expect(reRun.message).toContain('успешно пересоздан по матрице');

    const updatedTournament = await db.get<any>('SELECT * FROM tournaments WHERE title = ?', [BOGDANA_TOURNAMENT_TITLE]);
    expect(updatedTournament.venue).toBe(BOGDANA_TOURNAMENT_VENUE);
  });

  it('6. Prohibits restoration if game is active or protocol data exists', async () => {
    const db = createDatabaseConnection(':memory:');

    await restoreTournamentBogdana(db);

    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE title = ?', [BOGDANA_TOURNAMENT_TITLE]);
    const game1 = await db.get<any>('SELECT * FROM tournament_games WHERE tournament_id = ? AND game_number = 1', [tournament.id]);

    // Mark game 1 as active
    await db.run("UPDATE tournament_games SET status = 'active', started_at = ? WHERE id = ?", [new Date().toISOString(), game1.id]);

    await expect(restoreTournamentBogdana(db)).rejects.toThrow(
      /Автоматическое восстановление запрещено/
    );
  });

  it('7. Preserves unrelated existing data (other tournaments, players, tasks)', async () => {
    const db = createDatabaseConnection(':memory:');

    const otherPlayerId = 'other_player_123';
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at)
       VALUES (?, 'Сторонний Игрок', 'normal', 'normal', 1000, 0, ?, ?)`,
      [otherPlayerId, now, now]
    );

    const otherTournamentId = 'other_tourn_456';
    await db.run(
      `INSERT INTO tournaments (id, title, date, status, created_at, updated_at)
       VALUES (?, 'Другой Турнир', ?, 'draft', ?, ?)`,
      [otherTournamentId, now, now, now]
    );

    await restoreTournamentBogdana(db);

    const otherPlayer = await db.get<any>('SELECT * FROM players WHERE id = ?', [otherPlayerId]);
    expect(otherPlayer).not.toBeNull();

    const otherTournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [otherTournamentId]);
    expect(otherTournament).not.toBeNull();
  });
});
