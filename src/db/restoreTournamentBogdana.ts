import crypto from 'crypto';
import { DatabaseWrapper, getDb } from './index.ts';

export const BOGDANA_PLAYERS = [
  'Богданчик',
  'Вид',
  'Денди',
  'Джава',
  'Знак',
  'Матроскина',
  'Насон',
  'Пристань',
  'Спящий',
  'Фандорин',
] as const;

export const BOGDANA_TOURNAMENT_TITLE = 'Турнир Богдана 1.08';
export const BOGDANA_TOURNAMENT_DATE = '2026-08-01T09:00:00.000Z';
export const BOGDANA_TOURNAMENT_VENUE = 'Зал #1 (Главный)';
export const BOGDANA_TOURNAMENT_STAGE = 'Финал';

export const BOGDANA_SEATING_MATRIX: Record<string, number[]> = {
  'Богданчик':  [7, 5, 2, 5, 4, 4, 5, 7, 10, 9],
  'Вид':       [10, 4, 7, 8, 6, 10, 9, 9, 9, 5],
  'Денди':      [3, 1, 1, 6, 5, 1, 3, 5, 3, 3],
  'Джава':      [4, 3, 9, 4, 9, 3, 6, 6, 6, 1],
  'Знак':       [9, 10, 6, 1, 7, 2, 1, 3, 1, 7],
  'Матроскина': [8, 7, 4, 10, 1, 9, 8, 8, 2, 6],
  'Насон':      [2, 8, 10, 2, 8, 5, 2, 2, 8, 2],
  'Пристань':   [5, 6, 3, 7, 3, 8, 7, 4, 7, 10],
  'Спящий':     [6, 2, 8, 9, 2, 6, 10, 1, 5, 8],
  'Фандорин':   [1, 9, 5, 3, 10, 7, 4, 10, 4, 4],
};

export function validateSeatingMatrix(
  players: readonly string[],
  matrix: Record<string, number[]>
): void {
  if (players.length !== 10) {
    throw new Error(`Ожидается ровно 10 игроков в матрице рассадки, получено ${players.length}`);
  }

  for (const player of players) {
    const seats = matrix[player];
    if (!seats || seats.length !== 10) {
      throw new Error(`У игрока "${player}" должно быть ровно 10 мест для игр 1..10`);
    }
  }

  let totalSeatsCount = 0;
  for (let gameIdx = 0; gameIdx < 10; gameIdx++) {
    const seatsInGame: number[] = [];
    for (const player of players) {
      const seatNum = matrix[player][gameIdx];
      seatsInGame.push(seatNum);
      totalSeatsCount++;
    }

    const sorted = [...seatsInGame].sort((a, b) => a - b);
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < 10; i++) {
      if (sorted[i] !== expected[i]) {
        throw new Error(
          `В игре №${gameIdx + 1} некорректная рассадка мест: ${seatsInGame.join(', ')}. Каждое место от 1 до 10 должно встречаться ровно один раз.`
        );
      }
    }
  }

  if (totalSeatsCount !== 100) {
    throw new Error(`Общее количество мест рассадки должно составлять 100, получено ${totalSeatsCount}`);
  }
}

export interface RestoreBogdanaResult {
  action: 'created' | 'recreated' | 'already_restored';
  message: string;
  tournamentId: string;
  dbPath: string;
  createdPlayers: string[];
  reusedPlayers: string[];
  participantCount: number;
  gameCount: number;
  seatCount: number;
}

export async function restoreTournamentBogdana(dbParam?: DatabaseWrapper): Promise<RestoreBogdanaResult> {
  const db = dbParam || (await getDb());

  // Programmatic verification of matrix before writing to DB
  validateSeatingMatrix(BOGDANA_PLAYERS, BOGDANA_SEATING_MATRIX);

  const createdPlayers: string[] = [];
  const reusedPlayers: string[] = [];
  const playerIdMap: Record<string, string> = {};

  // 1. Process players idempotently
  const allExistingPlayers = await db.all<any>('SELECT id, nickname FROM players');

  for (const nickname of BOGDANA_PLAYERS) {
    const normalized = nickname.trim().toLowerCase();
    const existing = allExistingPlayers.filter(
      (p) => p.nickname && p.nickname.trim().toLowerCase() === normalized
    );

    if (existing.length > 1) {
      throw new Error(
        `Найдено несколько игроков с никнеймом "${nickname}". Автоматическое восстановление остановлено для предотвращения привязки неверного профиля.`
      );
    }

    if (existing.length === 1) {
      playerIdMap[nickname] = existing[0].id;
      reusedPlayers.push(nickname);
    } else {
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO players (id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 1000, 0, ?, ?)`,
        [newId, nickname, now, now]
      );
      playerIdMap[nickname] = newId;
      createdPlayers.push(nickname);
    }
  }

  // 2. Check existing target tournament by exact title
  const existingTournament = await db.get<any>(
    'SELECT * FROM tournaments WHERE title = ?',
    [BOGDANA_TOURNAMENT_TITLE]
  );

  if (existingTournament) {
    const tournamentId = existingTournament.id;

    // Check if any games started, completed or protocols/results exist
    const activeOrCompletedGames = await db.all<any>(
      `SELECT id FROM tournament_games
       WHERE tournament_id = ? AND (status != 'planned' OR started_at IS NOT NULL OR completed_at IS NOT NULL OR draft_protocol_json IS NOT NULL)`,
      [tournamentId]
    );

    const existingProtocols = await db.all<any>(
      `SELECT id FROM tournament_game_protocols
       WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)`,
      [tournamentId]
    );

    const existingResults = await db.all<any>(
      `SELECT id FROM tournament_game_player_results
       WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)`,
      [tournamentId]
    );

    const existingBestMoves = await db.all<any>(
      `SELECT id FROM tournament_game_best_moves
       WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)`,
      [tournamentId]
    );

    if (
      activeOrCompletedGames.length > 0 ||
      existingProtocols.length > 0 ||
      existingResults.length > 0 ||
      existingBestMoves.length > 0
    ) {
      throw new Error(
        `Автоматическое восстановление запрещено: в турнире "${BOGDANA_TOURNAMENT_TITLE}" уже есть начатые/завершённые игры или данные протоколов.`
      );
    }

    // Check if structure and seating match matrix completely
    const isMetadataMatch =
      existingTournament.title === BOGDANA_TOURNAMENT_TITLE &&
      existingTournament.date === BOGDANA_TOURNAMENT_DATE &&
      existingTournament.venue === BOGDANA_TOURNAMENT_VENUE &&
      existingTournament.stage === BOGDANA_TOURNAMENT_STAGE &&
      existingTournament.status === 'draft' &&
      existingTournament.chief_judge_name === null &&
      existingTournament.notes === null;

    let isSeatingMatch = false;

    if (isMetadataMatch) {
      const existingParticipants = await db.all<any>(
        'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC',
        [tournamentId]
      );

      const existingGames = await db.all<any>(
        'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
        [tournamentId]
      );

      if (existingParticipants.length === 10 && existingGames.length === 10) {
        const participantIdByNumber: Record<number, string> = {};
        let participantsValid = true;

        for (let i = 0; i < 10; i++) {
          const expectedName = BOGDANA_PLAYERS[i];
          const expectedPlayerId = playerIdMap[expectedName];
          const part = existingParticipants[i];
          if (
            !part ||
            part.participant_number !== i + 1 ||
            part.player_id !== expectedPlayerId ||
            part.display_name !== expectedName
          ) {
            participantsValid = false;
            break;
          }
          participantIdByNumber[i + 1] = part.id;
        }

        if (participantsValid) {
          let seatsValid = true;
          for (let g = 0; g < 10; g++) {
            const game = existingGames[g];
            if (!game || game.game_number !== g + 1 || game.status !== 'planned') {
              seatsValid = false;
              break;
            }

            const gameSeats = await db.all<any>(
              'SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC',
              [game.id]
            );

            if (gameSeats.length !== 10) {
              seatsValid = false;
              break;
            }

            for (let pIdx = 0; pIdx < 10; pIdx++) {
              const name = BOGDANA_PLAYERS[pIdx];
              const pNum = pIdx + 1;
              const expectedPartId = participantIdByNumber[pNum];
              const expectedSeatNum = BOGDANA_SEATING_MATRIX[name][g];

              const seat = gameSeats.find((s: any) => s.seat_number === expectedSeatNum);
              if (!seat || seat.participant_id !== expectedPartId || seat.role !== null) {
                seatsValid = false;
                break;
              }
            }

            if (!seatsValid) break;
          }

          if (seatsValid) {
            isSeatingMatch = true;
          }
        }
      }
    }

    if (isMetadataMatch && isSeatingMatch) {
      return {
        action: 'already_restored',
        message: 'Турнир уже восстановлен и соответствует матрице',
        tournamentId,
        dbPath: db.dbPath,
        createdPlayers,
        reusedPlayers,
        participantCount: 10,
        gameCount: 10,
        seatCount: 100,
      };
    }

    // Recreate participants, games, and seats transactionally
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE tournaments
         SET date = ?, venue = ?, stage = ?, status = 'draft', chief_judge_name = NULL, notes = NULL, updated_at = ?
         WHERE id = ?`,
        [
          BOGDANA_TOURNAMENT_DATE,
          BOGDANA_TOURNAMENT_VENUE,
          BOGDANA_TOURNAMENT_STAGE,
          new Date().toISOString(),
          tournamentId,
        ]
      );

      await tx.run(
        `DELETE FROM tournament_game_seats
         WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)`,
        [tournamentId]
      );
      await tx.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
      await tx.run('DELETE FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);

      const participantIdMap: Record<string, string> = {};
      for (let i = 0; i < BOGDANA_PLAYERS.length; i++) {
        const name = BOGDANA_PLAYERS[i];
        const partId = crypto.randomUUID();
        const pNum = i + 1;
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [partId, tournamentId, playerIdMap[name], name, pNum]
        );
        participantIdMap[name] = partId;
      }

      for (let g = 0; g < 10; g++) {
        const gameId = crypto.randomUUID();
        const gNum = g + 1;
        await tx.run(
          `INSERT INTO tournament_games (id, tournament_id, game_number, status, judge_name)
           VALUES (?, ?, ?, 'planned', NULL)`,
          [gameId, tournamentId, gNum]
        );

        for (let pIdx = 0; pIdx < 10; pIdx++) {
          const name = BOGDANA_PLAYERS[pIdx];
          const seatNum = BOGDANA_SEATING_MATRIX[name][g];
          const seatId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
             VALUES (?, ?, ?, ?, NULL)`,
            [seatId, gameId, participantIdMap[name], seatNum]
          );
        }
      }
    });

    return {
      action: 'recreated',
      message: 'Турнир находился в статусе draft и был успешно пересоздан по матрице',
      tournamentId,
      dbPath: db.dbPath,
      createdPlayers,
      reusedPlayers,
      participantCount: 10,
      gameCount: 10,
      seatCount: 100,
    };
  }

  // 3. Create tournament from scratch in transaction
  const tournamentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO tournaments (id, title, date, venue, stage, status, chief_judge_name, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)`,
      [
        tournamentId,
        BOGDANA_TOURNAMENT_TITLE,
        BOGDANA_TOURNAMENT_DATE,
        BOGDANA_TOURNAMENT_VENUE,
        BOGDANA_TOURNAMENT_STAGE,
        now,
        now,
      ]
    );

    const participantIdMap: Record<string, string> = {};
    for (let i = 0; i < BOGDANA_PLAYERS.length; i++) {
      const name = BOGDANA_PLAYERS[i];
      const partId = crypto.randomUUID();
      const pNum = i + 1;
      await tx.run(
        `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
         VALUES (?, ?, ?, ?, ?)`,
        [partId, tournamentId, playerIdMap[name], name, pNum]
      );
      participantIdMap[name] = partId;
    }

    for (let g = 0; g < 10; g++) {
      const gameId = crypto.randomUUID();
      const gNum = g + 1;
      await tx.run(
        `INSERT INTO tournament_games (id, tournament_id, game_number, status, judge_name)
         VALUES (?, ?, ?, 'planned', NULL)`,
        [gameId, tournamentId, gNum]
      );

      for (let pIdx = 0; pIdx < 10; pIdx++) {
        const name = BOGDANA_PLAYERS[pIdx];
        const seatNum = BOGDANA_SEATING_MATRIX[name][g];
        const seatId = crypto.randomUUID();
        await tx.run(
          `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
           VALUES (?, ?, ?, ?, NULL)`,
          [seatId, gameId, participantIdMap[name], seatNum]
        );
      }
    }
  });

  return {
    action: 'created',
    message: 'Турнир Богдана 1.08 успешно создан и рассажен по матрице',
    tournamentId,
    dbPath: db.dbPath,
    createdPlayers,
    reusedPlayers,
    participantCount: 10,
    gameCount: 10,
    seatCount: 100,
  };
}
