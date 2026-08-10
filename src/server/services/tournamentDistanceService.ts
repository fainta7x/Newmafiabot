import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

export const normalizeTournamentGameCount = (value: unknown, fallback = 10): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

const shuffleArray = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export async function regenerateTournamentGames(
  db: DatabaseWrapper,
  tournamentId: string,
  chiefJudgeName: string | null,
  participants: Array<{ id: string }>,
  gameCount: number,
): Promise<void> {
  const distance = normalizeTournamentGameCount(gameCount);
  if (participants.length !== 10) throw new Error('Для рассадки требуется ровно 10 участников');

  const existingGames = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
  for (const game of existingGames) {
    await db.run('DELETE FROM tournament_game_seats WHERE game_id = ?', [game.id]);
  }
  await db.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);

  for (let gameNumber = 1; gameNumber <= distance; gameNumber += 1) {
    const gameId = crypto.randomUUID();
    await db.run(
      `INSERT INTO tournament_games (id, tournament_id, game_number, judge_name, status)
       VALUES (?, ?, ?, ?, 'planned')`,
      [gameId, tournamentId, gameNumber, chiefJudgeName || null],
    );

    const shuffled = shuffleArray(participants);
    for (let seatIndex = 0; seatIndex < 10; seatIndex += 1) {
      await db.run(
        `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
         VALUES (?, ?, ?, ?, NULL)`,
        [crypto.randomUUID(), gameId, shuffled[seatIndex].id, seatIndex + 1],
      );
    }
  }
}

export function computeFlexibleStartReadiness(
  participants: any[],
  games: any[],
  gameCount: number,
) {
  const distance = normalizeTournamentGameCount(gameCount);
  const errors: string[] = [];
  let totalSeatsCount = 0;

  if (participants.length !== 10) {
    errors.push(`Необходимо ровно 10 участников (текущее: ${participants.length})`);
  } else if (new Set(participants.map((participant: any) => participant.player_id)).size !== 10) {
    errors.push('Все 10 участников турнира должны быть уникальными');
  }

  if (games.length !== distance) {
    errors.push(`Необходимо ${distance} игр (найдено: ${games.length})`);
  } else {
    const numbers = new Set(games.map((game: any) => Number(game.game_number)));
    for (let gameNumber = 1; gameNumber <= distance; gameNumber += 1) {
      if (!numbers.has(gameNumber)) errors.push(`Отсутствует игра №${gameNumber}`);
    }
  }

  for (const game of games) {
    const seats = game.seats || [];
    totalSeatsCount += seats.length;
    if (seats.length !== 10) {
      errors.push(`В игре №${game.game_number} должно быть ровно 10 мест (найдено: ${seats.length})`);
      continue;
    }
    if (new Set(seats.map((seat: any) => seat.participant_id)).size !== 10) {
      errors.push(`В игре №${game.game_number} есть дубликаты участников`);
    }
    const seatNumbers = seats.map((seat: any) => Number(seat.seat_number));
    if (new Set(seatNumbers).size !== 10 || Math.min(...seatNumbers) !== 1 || Math.max(...seatNumbers) !== 10) {
      errors.push(`В игре №${game.game_number} номера мест должны быть от 1 до 10 без дубликатов`);
    }
  }

  const expectedSeats = distance * 10;
  if (totalSeatsCount !== expectedSeats && !errors.some((error) => error.includes('мест'))) {
    errors.push(`Общее количество мест составляет ${totalSeatsCount} вместо ${expectedSeats}`);
  }

  return {
    ready: errors.length === 0,
    participants_count: participants.length,
    games_count: games.length,
    expected_games_count: distance,
    seats_count: totalSeatsCount,
    expected_seats_count: expectedSeats,
    errors,
  };
}

export async function computeFlexibleCompleteReadiness(
  db: DatabaseWrapper,
  tournamentId: string,
  gameCount: number,
) {
  const distance = normalizeTournamentGameCount(gameCount);
  const errors: string[] = [];
  const games = await db.all<any>(
    'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
    [tournamentId],
  );

  if (games.length !== distance) {
    errors.push(`Необходимо ${distance} игр (найдено: ${games.length})`);
  }

  const active = games.find((game: any) => game.status === 'active');
  if (active) errors.push(`В турнире есть активная игра №${active.game_number}. Сначала завершите её.`);

  const completedCount = games.filter((game: any) => game.status === 'completed').length;
  if (completedCount !== distance) {
    errors.push(`Не все игры завершены (${completedCount} из ${distance})`);
  }

  for (const game of games) {
    const protocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    if (!protocol || protocol.status !== 'completed') {
      errors.push(`Игра №${game.game_number}: протокол не завершён`);
    } else if (!protocol.winner_team) {
      errors.push(`Игра №${game.game_number}: не указана победившая команда`);
    }

    const result = await db.get<any>('SELECT COUNT(*) AS count FROM tournament_game_player_results WHERE game_id = ?', [game.id]);
    if (Number(result?.count || 0) !== 10) {
      errors.push(`Игра №${game.game_number}: не найдены 10 результатов игроков`);
    }
  }

  return { isReady: errors.length === 0, errors, expected_games_count: distance, completed_games_count: completedCount };
}
