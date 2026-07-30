import { Router, Response } from 'express';
import crypto from 'crypto';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { calculateBestMovePoints } from './tournamentProtocolRoutes.ts';

const router = Router();

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalizeRole(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
  return lower;
}

// Helper to generate 10 games and random seating chart
async function generateGamesAndSeating(db: DatabaseWrapper, tournamentId: string, chiefJudgeName: string | null, participants: Array<{ id: string }>) {
  // Delete existing seats and games for this tournament
  const existingGames = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
  for (const g of existingGames) {
    await db.run('DELETE FROM tournament_game_seats WHERE game_id = ?', [g.id]);
  }
  await db.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);

  // Create 10 games
  for (let gNum = 1; gNum <= 10; gNum++) {
    const gameId = crypto.randomUUID();
    await db.run(
      `INSERT INTO tournament_games (id, tournament_id, game_number, judge_name, status)
       VALUES (?, ?, ?, ?, 'planned')`,
      [gameId, tournamentId, gNum, chiefJudgeName || null]
    );

    // Shuffle 10 participants for this game independently
    const shuffledParticipants = shuffleArray(participants);

    // Insert 10 seats
    for (let seatIdx = 0; seatIdx < 10; seatIdx++) {
      const seatId = crypto.randomUUID();
      await db.run(
        `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
         VALUES (?, ?, ?, ?, NULL)`,
        [seatId, gameId, shuffledParticipants[seatIdx].id, seatIdx + 1]
      );
    }
  }
}

// Helper to compute start_readiness for tournament launch
function computeStartReadiness(participants: any[], games: any[]) {
  const errors: string[] = [];
  const participantsCount = participants.length;
  const gamesCount = games.length;
  let totalSeatsCount = 0;

  if (participantsCount !== 10) {
    errors.push(`Необходимо ровно 10 участников (текущее: ${participantsCount})`);
  } else {
    const uniquePlayerIds = new Set(participants.map((p: any) => p.player_id));
    if (uniquePlayerIds.size !== 10) {
      errors.push('Все 10 участников турнира должны быть уникальными');
    }
  }

  if (gamesCount !== 10) {
    errors.push(`Необходимо ровно 10 игр (текущее: ${gamesCount})`);
  } else {
    const gameNumbers = games.map((g: any) => g.game_number);
    for (let i = 1; i <= 10; i++) {
      if (!gameNumbers.includes(i)) {
        errors.push(`Отсутствует игра №${i}`);
      }
    }
  }

  for (const g of games) {
    const seats = g.seats || [];
    totalSeatsCount += seats.length;

    if (seats.length !== 10) {
      errors.push(`В игра №${g.game_number} должно быть ровно 10 мест (найдено: ${seats.length})`);
    } else {
      const partIdsInGame = new Set(seats.map((s: any) => s.participant_id));
      if (partIdsInGame.size !== 10) {
        errors.push(`В игра №${g.game_number} есть дубликаты участников`);
      }
      const seatNums = seats.map((s: any) => s.seat_number);
      const uniqueSeatNums = new Set(seatNums);
      if (uniqueSeatNums.size !== 10 || Math.min(...seatNums) !== 1 || Math.max(...seatNums) !== 10) {
        errors.push(`В игра №${g.game_number} номера мест должны быть от 1 до 10 без дубликатов`);
      }
    }
  }

  if (totalSeatsCount !== 100 && !errors.some((e) => e.includes('мест'))) {
    errors.push(`Общее количество мест составляет ${totalSeatsCount} вместо 100`);
  }

  return {
    ready: errors.length === 0,
    participants_count: participantsCount,
    games_count: gamesCount,
    seats_count: totalSeatsCount,
    errors,
  };
}

// 1. GET /api/tournaments - Get list of tournaments
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  try {
    const tournamentsList = await db.all<any>(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as participants_count,
        (SELECT COUNT(*) FROM tournament_games tg WHERE tg.tournament_id = t.id) as total_games_count,
        (SELECT COUNT(*) FROM tournament_games tg WHERE tg.tournament_id = t.id AND tg.status = 'completed') as completed_games_count
      FROM tournaments t
      ORDER BY t.created_at DESC
    `);
    res.json(tournamentsList);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// 2. GET /api/tournaments/:id - Get tournament details
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const participants = await db.all<any>(`
      SELECT tp.*, p.nickname as player_nickname, p.telegram_username, p.phone
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = ?
      ORDER BY tp.participant_number ASC
    `, [tournamentId]);

    const gamesList = await db.all<any>(`
      SELECT * FROM tournament_games
      WHERE tournament_id = ?
      ORDER BY game_number ASC
    `, [tournamentId]);

    const games = [];
    for (const game of gamesList) {
      const seats = await db.all<any>(`
        SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        JOIN players p ON p.id = tp.player_id
        WHERE tgs.game_id = ?
        ORDER BY tgs.seat_number ASC
      `, [game.id]);
      games.push({ ...game, seats });
    }

    const start_readiness = computeStartReadiness(participants, games);

    res.json({
      ...tournament,
      participants,
      games,
      start_readiness,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// 3. POST /api/tournaments - Create a tournament (Atomic Transaction)
router.post('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { title, date, venue, stage, chief_judge_name, notes, participants } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: 'Название и дата обязательны' });
  }

  if (!Array.isArray(participants) || participants.length !== 10) {
    return res.status(400).json({ error: 'Турнир должен содержать ровно 10 участников' });
  }

  // Extract player_ids
  const playerIds = participants.map((p: any) => typeof p === 'string' ? p : p.player_id);
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));

  if (uniquePlayerIds.length !== 10) {
    return res.status(400).json({ error: 'Участники не могут повторяться. Требуется ровно 10 уникальных игроков.' });
  }

  // Verify all players exist
  for (const pid of uniquePlayerIds) {
    const pl = await db.get<any>('SELECT id, nickname FROM players WHERE id = ?', [pid]);
    if (!pl) {
      return res.status(400).json({ error: `Игрок с ID ${pid} не найден в CRM` });
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const tournamentId = crypto.randomUUID();
      const now = new Date().toISOString();

      await tx.run(
        `INSERT INTO tournaments (id, title, date, venue, stage, status, chief_judge_name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [
          tournamentId,
          title,
          new Date(date).toISOString(),
          venue || null,
          stage || null,
          chief_judge_name || null,
          notes || null,
          now,
          now,
        ]
      );

      // Save 10 participants
      const participantRecords = [];
      for (let i = 0; i < 10; i++) {
        const rawPart = participants[i];
        const pid = typeof rawPart === 'string' ? rawPart : rawPart.player_id;
        const customName = typeof rawPart === 'object' && rawPart.display_name ? rawPart.display_name.trim() : null;

        const playerObj = await tx.get<any>('SELECT nickname FROM players WHERE id = ?', [pid]);
        const displayName = customName || playerObj?.nickname || `Игрок ${i + 1}`;

        const participantId = crypto.randomUUID();
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [participantId, tournamentId, pid, displayName, i + 1]
        );
        participantRecords.push({ id: participantId, player_id: pid, display_name: displayName, participant_number: i + 1 });
      }

      // Generate 10 games & seating
      await generateGamesAndSeating(tx, tournamentId, chief_judge_name || null, participantRecords);

      // Fetch created objects
      const tournament = await tx.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
      const savedParticipants = await tx.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [tournamentId]);
      const gamesList = await tx.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC', [tournamentId]);

      const games = [];
      for (const g of gamesList) {
        const seats = await tx.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [g.id]);
        games.push({ ...g, seats });
      }

      return {
        ...tournament,
        participants: savedParticipants,
        games,
      };
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка создания турнира' });
  }
});

// 4. PATCH /api/tournaments/:id - Edit draft metadata (status is NOT modified)
router.patch('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;
  const { title, date, venue, stage, chief_judge_name, notes } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const updatedTitle = title !== undefined ? title : tournament.title;
    const updatedDate = date !== undefined ? new Date(date).toISOString() : tournament.date;
    const updatedVenue = venue !== undefined ? venue : tournament.venue;
    const updatedStage = stage !== undefined ? stage : tournament.stage;
    const updatedJudge = chief_judge_name !== undefined ? chief_judge_name : tournament.chief_judge_name;
    const updatedNotes = notes !== undefined ? notes : tournament.notes;

    const now = new Date().toISOString();

    await db.run(
      `UPDATE tournaments
       SET title = ?, date = ?, venue = ?, stage = ?, chief_judge_name = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [updatedTitle, updatedDate, updatedVenue, updatedStage, updatedJudge, updatedNotes, now, tournamentId]
    );

    const updated = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка обновления турнира' });
  }
});

// 5. PUT /api/tournaments/:id/participants - Save/Update 10 participants (Atomic Transaction)
router.put('/:id/participants', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;
  const { participants } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status !== 'draft') {
      return res.status(400).json({ error: 'Состав участников заблокирован после запуска турнира' });
    }

    if (!Array.isArray(participants) || participants.length !== 10) {
      return res.status(400).json({ error: 'Турнир должен содержать ровно 10 участников' });
    }

    const playerIds = participants.map((p: any) => typeof p === 'string' ? p : p.player_id);
    const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));

    if (uniquePlayerIds.length !== 10) {
      return res.status(400).json({ error: 'Участники не могут повторяться. Требуется ровно 10 уникальных игроков.' });
    }

    for (const pid of uniquePlayerIds) {
      const pl = await db.get<any>('SELECT id FROM players WHERE id = ?', [pid]);
      if (!pl) {
        return res.status(400).json({ error: `Игрок с ID ${pid} не найден в CRM` });
      }
    }

    const updatedParticipants = await db.transaction(async (tx) => {
      // Clear old participants (which cascades to old game seats)
      await tx.run('DELETE FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);

      const participantRecords = [];
      for (let i = 0; i < 10; i++) {
        const rawPart = participants[i];
        const pid = typeof rawPart === 'string' ? rawPart : rawPart.player_id;
        const customName = typeof rawPart === 'object' && rawPart.display_name ? rawPart.display_name.trim() : null;

        const playerObj = await tx.get<any>('SELECT nickname FROM players WHERE id = ?', [pid]);
        const displayName = customName || playerObj?.nickname || `Игрок ${i + 1}`;

        const participantId = crypto.randomUUID();
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [participantId, tournamentId, pid, displayName, i + 1]
        );
        participantRecords.push({ id: participantId, player_id: pid, display_name: displayName, participant_number: i + 1 });
      }

      // Regenerate seating with new participants
      await generateGamesAndSeating(tx, tournamentId, tournament.chief_judge_name, participantRecords);

      return await tx.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [tournamentId]);
    });

    res.json({ success: true, participants: updatedParticipants });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка обновления участников' });
  }
});

// 6. POST /api/tournaments/:id/generate-seating - Regenerate seating chart
router.post('/:id/generate-seating', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status !== 'draft') {
      return res.status(400).json({ error: 'Рассадка заблокирована после запуска турнира' });
    }

    const participants = await db.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [tournamentId]);
    if (participants.length !== 10) {
      return res.status(400).json({ error: 'Для генерации рассадки требуется ровно 10 участников' });
    }

    await generateGamesAndSeating(db, tournamentId, tournament.chief_judge_name, participants);

    const gamesList = await db.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC', [tournamentId]);
    const games = [];
    for (const g of gamesList) {
      const seats = await db.all<any>(`
        SELECT tgs.*, tp.display_name, tp.player_id
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        WHERE tgs.game_id = ?
        ORDER BY tgs.seat_number ASC
      `, [g.id]);
      games.push({ ...g, seats });
    }

    res.json({ success: true, games });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка генерации рассадки' });
  }
});

// 7. POST /api/tournaments/:id/games/:gameId/swap-seats - Swap two seats in a game
router.post('/:id/games/:gameId/swap-seats', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  const { seat_number_1, seat_number_2, participant_id_1, participant_id_2 } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status !== 'draft') {
      return res.status(400).json({ error: 'Перестановка мест запрещена после запуска турнира' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status !== 'planned') {
      return res.status(400).json({ error: 'Перестановка мест запрещена после запуска игры' });
    }

    let seat1, seat2;

    if (seat_number_1 !== undefined && seat_number_2 !== undefined) {
      seat1 = await db.get<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? AND seat_number = ?', [gameId, seat_number_1]);
      seat2 = await db.get<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? AND seat_number = ?', [gameId, seat_number_2]);
    } else if (participant_id_1 && participant_id_2) {
      seat1 = await db.get<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? AND participant_id = ?', [gameId, participant_id_1]);
      seat2 = await db.get<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? AND participant_id = ?', [gameId, participant_id_2]);
    }

    if (!seat1 || !seat2) {
      return res.status(400).json({ error: 'Указанные места не найдены в этой игре' });
    }

    if (seat1.id === seat2.id) {
      return res.status(400).json({ error: 'Выберите разных игроков для перестановки' });
    }

    // Swap seat_numbers between seat1 and seat2 safely
    const tempSeatNumber = -999;
    await db.run('UPDATE tournament_game_seats SET seat_number = ? WHERE id = ?', [tempSeatNumber, seat1.id]);
    await db.run('UPDATE tournament_game_seats SET seat_number = ? WHERE id = ?', [seat1.seat_number, seat2.id]);
    await db.run('UPDATE tournament_game_seats SET seat_number = ? WHERE id = ?', [seat2.seat_number, seat1.id]);

    const updatedSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    res.json({ success: true, game_id: gameId, seats: updatedSeats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка перестановки мест' });
  }
});

// 8. PATCH /api/tournaments/:id/games/:gameId/roles - Assign roles to seats
router.patch('/:id/games/:gameId/roles', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  const { roles, seats } = req.body;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status !== 'planned') {
      return res.status(400).json({ error: 'Изменение ролей запрещено после запуска игры' });
    }

    const items = roles || seats;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Не переданы назначения ролей' });
    }

    for (const item of items) {
      const seatNum = item.seat_number;
      const roleVal = normalizeRole(item.role);

      await db.run(
        'UPDATE tournament_game_seats SET role = ? WHERE game_id = ? AND seat_number = ?',
        [roleVal, gameId, seatNum]
      );
    }

    const updatedSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    res.json({ success: true, game_id: gameId, seats: updatedSeats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка обновления ролей' });
  }
});

// 9. PATCH /api/tournaments/:id/games/:gameId/judge - Assign judge to game
router.patch('/:id/games/:gameId/judge', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  const { judge_name } = req.body;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status !== 'planned') {
      return res.status(400).json({ error: 'Изменение судьи запрещено после запуска игры' });
    }

    await db.run('UPDATE tournament_games SET judge_name = ? WHERE id = ?', [judge_name || null, gameId]);

    const updated = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка обновления судьи' });
  }
});

// 10. POST /api/tournaments/:id/start - Launch tournament (with safe validations)
router.post('/:id/start', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'active') {
      return res.status(400).json({ error: 'Турнир уже запущен' });
    }

    const participants = await db.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);
    const gamesList = await db.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC', [tournamentId]);
    
    const games = [];
    for (const game of gamesList) {
      const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game.id]);
      games.push({ ...game, seats });
    }

    const start_readiness = computeStartReadiness(participants, games);
    if (!start_readiness.ready) {
      return res.status(400).json({
        error: `Турнир не готов к запуску: ${start_readiness.errors.join('; ')}`,
        start_readiness,
      });
    }

    const now = new Date().toISOString();
    await db.run("UPDATE tournaments SET status = 'active', updated_at = ? WHERE id = ?", [now, tournamentId]);

    const updated = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    res.json({ success: true, tournament: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка запуска турнира' });
  }
});

// 11. POST /api/tournaments/:id/games/:gameId/start - Launch specific game
router.post('/:id/games/:gameId/start', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    // Requirement: Game can be started ONLY if tournament.status === 'active'
    if (tournament.status !== 'active') {
      return res.status(400).json({ error: 'Запуск игры разрешён только в активном турнире (турнир находится в статусе черновика)' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status !== 'planned') {
      return res.status(400).json({ error: 'Игра уже была запущена или завершена' });
    }

    // Check if another game in this tournament is currently active
    const activeGamesCount = await db.get<any>(
      "SELECT COUNT(*) as cnt FROM tournament_games WHERE tournament_id = ? AND status = 'active' AND id != ?",
      [tournamentId, gameId]
    );
    if (activeGamesCount && activeGamesCount.cnt > 0) {
      return res.status(400).json({ error: 'В турнире уже идет другая игра' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ?', [gameId]);
    if (seats.length !== 10) {
      return res.status(400).json({ error: 'В игре должно быть ровно 10 мест' });
    }

    // Role validation: exactly 6 citizen, 1 sheriff, 2 mafia, 1 don
    const roleCounts: Record<string, number> = {
      citizen: 0,
      sheriff: 0,
      mafia: 0,
      don: 0,
    };

    for (const seat of seats) {
      const r = normalizeRole(seat.role);
      if (r && roleCounts[r] !== undefined) {
        roleCounts[r]++;
      }
    }

    if (
      roleCounts.citizen !== 6 ||
      roleCounts.sheriff !== 1 ||
      roleCounts.mafia !== 2 ||
      roleCounts.don !== 1
    ) {
      return res.status(400).json({
        error: 'Нельзя запустить игру с неправильным набором ролей. Требуется ровно: 6 мирных, 1 Шериф, 2 мафии и 1 Дон.',
        current_roles: roleCounts,
      });
    }

    const now = new Date().toISOString();
    await db.run(
      "UPDATE tournament_games SET status = 'active', started_at = ? WHERE id = ?",
      [now, gameId]
    );

    const updatedGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);
    res.json({ success: true, game: updatedGame });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка запуска игры' });
  }
});

function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// GET /api/tournaments/:tournamentId/standings
router.get('/:tournamentId/standings', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    // 1. Get all participants
    const participants = await db.all<any>(
      `SELECT tp.id as participant_id, tp.participant_number,
              COALESCE(tp.display_name, p.nickname, 'Участник') as display_name
       FROM tournament_participants tp
       LEFT JOIN players p ON tp.player_id = p.id
       WHERE tp.tournament_id = ?
       ORDER BY tp.participant_number ASC`,
      [tournamentId]
    );

    // 2. Map of stats per participant_id
    const statsMap = new Map<string, any>();
    for (const p of participants) {
      statsMap.set(p.participant_id, {
        place: 0,
        participant_id: p.participant_id,
        participant_number: p.participant_number,
        display_name: p.display_name,
        total_points: 0,
        additional_total: 0,
        positive_points: 0,
        penalty_points: 0,
        best_move_points: 0,
        ci_points: 0,
        wins: 0,
        don_wins: 0,
        sheriff_wins: 0,
        first_killed_count: 0,
        games_played: 0,
        games: [],
      });
    }

    // 3. Get completed games with completed protocols
    const completedGames = await db.all<any>(
      `SELECT g.id as game_id, g.game_number, p.winner_team, p.first_killed_participant_id,
              p.best_move_participant_id, p.best_move_seats_json
       FROM tournament_games g
       INNER JOIN tournament_game_protocols p ON p.game_id = g.id
       WHERE g.tournament_id = ? AND g.status = 'completed' AND p.status = 'completed'
       ORDER BY g.game_number ASC`,
      [tournamentId]
    );

    const completed_games_count = completedGames.length;

    if (completed_games_count === 0) {
      return res.json({
        tournament_id: tournamentId,
        completed_games_count: 0,
        standings: [],
      });
    }

    for (const g of completedGames) {
      const seats = await db.all<any>(
        `SELECT participant_id, seat_number, role FROM tournament_game_seats WHERE game_id = ?`,
        [g.game_id]
      );

      const seatsListForLh: Array<{ seat_number: number; role: string | null }> = [];
      for (const s of seats) {
        seatsListForLh.push({ seat_number: s.seat_number, role: s.role });
      }

      let bestMoveSeats: number[] = [];
      try {
        bestMoveSeats = JSON.parse(g.best_move_seats_json || '[]');
      } catch (_) {}
      const { bonusPoints: gameLhBonus } = calculateBestMovePoints(bestMoveSeats, seatsListForLh);

      const results = await db.all<any>(
        `SELECT participant_id, judge_bonus, protocol_bonus, penalty_points, ci_points
         FROM tournament_game_player_results WHERE game_id = ?`,
        [g.game_id]
      );

      const resultMap = new Map<string, any>();
      for (const r of results) {
        resultMap.set(r.participant_id, r);
      }

      for (const s of seats) {
        const pStats = statsMap.get(s.participant_id);
        if (!pStats) continue;

        const normRole = normalizeRole(s.role);
        const resRow = resultMap.get(s.participant_id);

        const judgeBonus = Number(resRow?.judge_bonus || 0);
        const protocolBonus = Number(resRow?.protocol_bonus || 0);
        const penalty = Number(resRow?.penalty_points || 0);
        const ci = (s.participant_id === g.first_killed_participant_id) ? Number(resRow?.ci_points || 0) : 0;

        let winPoint = 0;
        if (g.winner_team === 'red' && (normRole === 'citizen' || normRole === 'sheriff')) {
          winPoint = 1;
        } else if (g.winner_team === 'black' && (normRole === 'mafia' || normRole === 'don')) {
          winPoint = 1;
        }

        const posPoints = roundToTwo(judgeBonus + protocolBonus);
        const bmPoints = (s.participant_id === g.best_move_participant_id) ? roundToTwo(gameLhBonus) : 0;
        const penPoints = roundToTwo(penalty);
        const ciVal = roundToTwo(ci);

        const addTotalGame = roundToTwo(posPoints + bmPoints - penPoints);
        const gameTotal = roundToTwo(winPoint + addTotalGame + ciVal);

        pStats.games_played += 1;
        pStats.wins += winPoint;
        if (winPoint === 1 && normRole === 'don') pStats.don_wins += 1;
        if (winPoint === 1 && normRole === 'sheriff') pStats.sheriff_wins += 1;
        if (g.first_killed_participant_id && s.participant_id === g.first_killed_participant_id) {
          pStats.first_killed_count += 1;
        }

        pStats.positive_points = roundToTwo(pStats.positive_points + posPoints);
        pStats.best_move_points = roundToTwo(pStats.best_move_points + bmPoints);
        pStats.penalty_points = roundToTwo(pStats.penalty_points + penPoints);
        pStats.ci_points = roundToTwo(pStats.ci_points + ciVal);
        pStats.additional_total = roundToTwo(pStats.additional_total + addTotalGame);
        pStats.total_points = roundToTwo(pStats.total_points + gameTotal);

        pStats.games.push({
          game_number: g.game_number,
          seat_number: s.seat_number,
          role: s.role,
          winner_team: g.winner_team,
          win_point: winPoint,
          positive_points: posPoints,
          best_move_points: bmPoints,
          penalty_points: penPoints,
          ci_points: ciVal,
          game_total: gameTotal,
        });
      }
    }

    const standingsList = Array.from(statsMap.values());

    // Sort: total_points desc, additional_total desc, wins desc, participant_number asc
    standingsList.sort((a, b) => {
      if (Math.abs(b.total_points - a.total_points) > 0.0001) {
        return b.total_points - a.total_points;
      }
      if (Math.abs(b.additional_total - a.additional_total) > 0.0001) {
        return b.additional_total - a.additional_total;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.participant_number - b.participant_number;
    });

    for (let i = 0; i < standingsList.length; i++) {
      if (i === 0) {
        standingsList[i].place = 1;
      } else {
        const prev = standingsList[i - 1];
        const curr = standingsList[i];
        if (
          Math.abs(curr.total_points - prev.total_points) < 0.0001 &&
          Math.abs(curr.additional_total - prev.additional_total) < 0.0001 &&
          curr.wins === prev.wins
        ) {
          curr.place = prev.place;
        } else {
          curr.place = i + 1;
        }
      }
    }

    res.json({
      tournament_id: tournamentId,
      completed_games_count,
      standings: standingsList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка вычисления турнирной таблицы' });
  }
});

export default router;
