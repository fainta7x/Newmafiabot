import { Router, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import { calculateBestMovePoints } from './tournamentProtocolRoutes.ts';
import {
  normalizeRole,
  roundToTwo,
  calculateCiThreshold,
  calculateCiRate,
  calculateGameCi
} from '../utils/ciHelper.ts';
import {
  normalizeRoleValue,
  calculateRoleCounts,
  validateRoleCountsTransition,
  SeatRoleInput
} from '../../lib/tournamentRoleValidation.ts';
import { compareTournamentNominationCandidates, type TournamentNominationCategory, type NominationHeadToHeadGame } from '../services/tournamentNominationComparator.ts';

const router = Router();

// POST /api/tournaments/checkpoint
router.post('/checkpoint', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint is not available in production' });
  }

  const db = (req as any).db as DatabaseWrapper;
  const result = await createPreviewCheckpoint(db);

  if (result.success) {
    res.json({ message: result.message });
  } else {
    res.status(500).json({ error: result.message });
  }
});

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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

export async function computeCompleteReadiness(db: DatabaseWrapper, tournamentId: string) {
  const errors: string[] = [];

  const games = await db.all<any>(
    'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
    [tournamentId]
  );

  if (games.length === 0) {
    errors.push('В турнире ещё нет запланированных игр');
  } else if (games.length !== 10) {
    errors.push(`Необходимо ровно 10 игр (найдено: ${games.length})`);
  }

  const activeGames = games.filter((g) => g.status === 'active');
  if (activeGames.length > 0) {
    errors.push(`В турнире есть активная игра №${activeGames[0].game_number}. Сначала завершите её.`);
  }

  const uncompletedGames = games.filter((g) => g.status !== 'completed');
  if (uncompletedGames.length > 0) {
    errors.push(`Не все игры завершены (${games.length - uncompletedGames.length} из ${games.length}), некоторые игры не сыграно`);
  }

  for (const g of games) {
    const proto = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [g.id]);
    if (!proto || proto.status !== 'completed') {
      errors.push(`Игра №${g.game_number}: протокол не завершён`);
    } else if (!proto.winner_team) {
      errors.push(`Игра №${g.game_number}: не указана победившая команда`);
    }

    const resultsCount = await db.get<any>(
      'SELECT COUNT(*) as count FROM tournament_game_player_results WHERE game_id = ?',
      [g.id]
    );
    if (!resultsCount || Number(resultsCount.count) !== 10) {
      errors.push(`Игра №${g.game_number}: не найдены 10 результатов игроков`);
    }
  }

  return { isReady: errors.length === 0, errors };
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
      SELECT tp.*, p.nickname as player_nickname, p.telegram_username, p.phone, (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at
      FROM tournament_participants tp
      LEFT JOIN players p ON p.id = tp.player_id
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
        SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname, (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        LEFT JOIN players p ON p.id = tp.player_id
        WHERE tgs.game_id = ?
        ORDER BY tgs.seat_number ASC
      `, [game.id]);
      const proto = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
      games.push({ ...game, seats, protocol_status: proto?.status || null });
    }

    const start_readiness = computeStartReadiness(participants, games);
    const complete_readiness = await computeCompleteReadiness(db, tournamentId);

    res.json({
      ...tournament,
      participants,
      games,
      start_readiness,
      complete_readiness,
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

  const parts = Array.isArray(participants) ? participants : [];

  // Extract player_ids
  const playerIds = parts.map((p: any) => typeof p === 'string' ? p : p?.player_id).filter(Boolean);
  const uniquePlayerIds = Array.from(new Set(playerIds));

  if (uniquePlayerIds.length !== parts.length) {
    return res.status(400).json({ error: 'Участники не могут повторяться. Все игроки должны быть уникальными.' });
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

      // Save participants
      const participantRecords = [];
      for (let i = 0; i < parts.length; i++) {
        const rawPart = parts[i];
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

      if (parts.length === 10) {
        // Generate 10 games & seating
        await generateGamesAndSeating(tx, tournamentId, chief_judge_name || null, participantRecords);
      }

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

    const allowedMetadataStatuses = ['draft', 'active', 'correction'];
    if (!allowedMetadataStatuses.includes(tournament.status)) {
      return res.status(400).json({ error: 'Завершённый или невалидный турнир нельзя редактировать.' });
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

// 5b. PATCH /api/tournaments/:id/participants/:participantId/correct-player - Correct CRM profile for tournament participant
router.patch('/:id/participants/:participantId/correct-player', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, participantId } = req.params;
  const { player_id } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать. Сначала верните его на корректировку.' });
    }

    const allowedStatuses = ['draft', 'active', 'correction'];
    if (!allowedStatuses.includes(tournament.status)) {
      return res.status(400).json({ error: 'Изменение профиля участника запрещено в текущем статусе турнира' });
    }

    const participant = await db.get<any>(
      'SELECT * FROM tournament_participants WHERE id = ? AND tournament_id = ?',
      [participantId, tournamentId]
    );
    if (!participant) {
      return res.status(404).json({ error: 'Участник турнира не найден' });
    }

    if (!player_id) {
      return res.status(400).json({ error: 'Не указан player_id для исправления профиля' });
    }

    const newPlayer = await db.get<any>('SELECT * FROM players WHERE id = ?', [player_id]);
    if (!newPlayer) {
      return res.status(400).json({ error: 'Игрок с указанным ID не найден в CRM' });
    }

    const duplicateCheck = await db.get<any>(
      'SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ? AND id != ?',
      [tournamentId, player_id, participantId]
    );
    if (duplicateCheck) {
      return res.status(400).json({ error: 'Этот игрок CRM уже задействован в данном турнире' });
    }

    const displayName = newPlayer.nickname || newPlayer.first_name || participant.display_name;

    await db.run(
      'UPDATE tournament_participants SET player_id = ?, display_name = ? WHERE id = ?',
      [player_id, displayName, participantId]
    );

    const updatedParticipant = await db.get<any>('SELECT * FROM tournament_participants WHERE id = ?', [participantId]);
    res.json({ success: true, participant: updatedParticipant });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка исправления профиля участника' });
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

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const check = await checkGameEditingPermission(db, tournament, game);
    if (!check.allowed) {
      return res.status(400).json({ error: check.error || 'Перестановка мест запрещена' });
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

    const P1 = seat1.participant_id;
    const P2 = seat2.participant_id;

    await db.transaction(async (tx) => {
      await tx.exec('PRAGMA defer_foreign_keys = ON;');

      // 1. Swap participant_id in tournament_game_seats (seat numbers remain unchanged)
      const tempId = crypto.randomUUID();
      await tx.run('UPDATE tournament_game_seats SET participant_id = ? WHERE id = ?', [tempId, seat1.id]);
      await tx.run('UPDATE tournament_game_seats SET participant_id = ? WHERE id = ?', [P1, seat2.id]);
      await tx.run('UPDATE tournament_game_seats SET participant_id = ? WHERE id = ?', [P2, seat1.id]);

      // 2. Transfer personal data in protocol (PPK, best move, first killed, zero round voted)
      const proto = await tx.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
      if (proto) {
        let fk = proto.first_killed_participant_id;
        if (fk === P1) fk = P2;
        else if (fk === P2) fk = P1;

        let zr = proto.zero_round_voted_participant_id;
        if (zr === P1) zr = P2;
        else if (zr === P2) zr = P1;

        let bm = proto.best_move_participant_id;
        if (bm === P1) bm = P2;
        else if (bm === P2) bm = P1;

        let ppk = proto.ppk_culprit_participant_id;
        if (ppk === P1) ppk = P2;
        else if (ppk === P2) ppk = P1;

        await tx.run(
          `UPDATE tournament_game_protocols
           SET first_killed_participant_id = ?,
               zero_round_voted_participant_id = ?,
               best_move_participant_id = ?,
               ppk_culprit_participant_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [fk, zr, bm, ppk, proto.id]
        );
      }

      // 3. Swap tournament_game_player_results
      const resP1 = await tx.get<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ? AND participant_id = ?', [gameId, P1]);
      const resP2 = await tx.get<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ? AND participant_id = ?', [gameId, P2]);

      if (resP1 && resP2) {
        const tempResId = crypto.randomUUID();
        await tx.run('UPDATE tournament_game_player_results SET participant_id = ? WHERE id = ?', [tempResId, resP1.id]);
        await tx.run('UPDATE tournament_game_player_results SET participant_id = ? WHERE id = ?', [P1, resP2.id]);
        await tx.run('UPDATE tournament_game_player_results SET participant_id = ? WHERE id = ?', [P2, resP1.id]);
      } else if (resP1) {
        await tx.run('UPDATE tournament_game_player_results SET participant_id = ? WHERE id = ?', [P2, resP1.id]);
      } else if (resP2) {
        await tx.run('UPDATE tournament_game_player_results SET participant_id = ? WHERE id = ?', [P1, resP2.id]);
      }

      // 4. Swap tournament_game_best_moves
      const bmP1 = await tx.get<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ? AND participant_id = ?', [gameId, P1]);
      const bmP2 = await tx.get<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ? AND participant_id = ?', [gameId, P2]);

      if (bmP1 && bmP2) {
        const tempBmId = crypto.randomUUID();
        await tx.run('UPDATE tournament_game_best_moves SET participant_id = ? WHERE id = ?', [tempBmId, bmP1.id]);
        await tx.run('UPDATE tournament_game_best_moves SET participant_id = ? WHERE id = ?', [P1, bmP2.id]);
        await tx.run('UPDATE tournament_game_best_moves SET participant_id = ? WHERE id = ?', [P2, bmP1.id]);
      } else if (bmP1) {
        await tx.run('UPDATE tournament_game_best_moves SET participant_id = ? WHERE id = ?', [P2, bmP1.id]);
      } else if (bmP2) {
        await tx.run('UPDATE tournament_game_best_moves SET participant_id = ? WHERE id = ?', [P1, bmP2.id]);
      }
    });

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

async function checkGameEditingPermission(
  db: DatabaseWrapper,
  tournament: any,
  game: any
): Promise<{ allowed: boolean; error?: string }> {
  if (tournament.status === 'completed') {
    return { allowed: false, error: 'Турнир завершён. Изменение параметров игры запрещено' };
  }

  if (game.status === 'completed') {
    return { allowed: false, error: 'Сначала необходимо вернуть протокол игры в черновик' };
  }

  if (game.status === 'planned') {
    if (tournament.status === 'draft' || tournament.status === 'active') {
      return { allowed: true };
    }
    if (tournament.status === 'correction') {
      return { allowed: false, error: 'В режиме корректировки нельзя изменять запланированные игры' };
    }
    return { allowed: false, error: 'Изменение параметров игры запрещено в текущем статусе турнира' };
  }

  if (tournament.status === 'correction') {
    if (game.status === 'active') {
      const protocol = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
      if (!protocol || protocol.status !== 'draft') {
        return { allowed: false, error: 'Сначала необходимо вернуть протокол игры в черновик' };
      }
      const otherActive = await db.get<any>(
        "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'active' AND id != ?",
        [tournament.id, game.id]
      );
      if (otherActive) {
        return { allowed: false, error: 'В турнире уже есть другая активная игра' };
      }
      return { allowed: true };
    }
    return { allowed: false, error: 'Изменение параметров игры запрещено' };
  }

  return { allowed: false, error: 'Изменение ролей и судьи запрещено после запуска игры' };
}

// 8. PATCH /api/tournaments/:id/games/:gameId/roles - Assign roles to seats
router.patch('/:id/games/:gameId/roles', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  const { roles, seats } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const check = await checkGameEditingPermission(db, tournament, game);
    if (!check.allowed) {
      return res.status(400).json({ error: check.error || 'Изменение ролей запрещено' });
    }

    const items = roles || seats;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Не переданы назначения ролей' });
    }

    const seenSeats = new Set<number>();
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'Некорректный элемент в списке назначений ролей' });
      }

      const seatNum = item.seat_number;
      if (typeof seatNum !== 'number' || !Number.isInteger(seatNum) || seatNum < 1 || seatNum > 10) {
        return res.status(400).json({
          error: `Некорректный номер места: ${seatNum}. Место должно быть целым числом от 1 до 10`,
        });
      }

      if (seenSeats.has(seatNum)) {
        return res.status(400).json({
          error: `Повторяющийся номер места ${seatNum} в одном запросе`,
        });
      }
      seenSeats.add(seatNum);

      const rawRole = item.role;
      if (rawRole !== null && rawRole !== undefined && rawRole !== '') {
        const normalized = normalizeRoleValue(rawRole);
        if (!normalized) {
          return res.status(400).json({
            error: `Неизвестное значение роли: "${rawRole}"`,
          });
        }
      }
    }

    const currentSeats = await db.all<any>(
      'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ?',
      [gameId]
    );

    const currentCounts = calculateRoleCounts(
      currentSeats.map((s) => ({ seat_number: s.seat_number, role: s.role }))
    );

    const seatMap = new Map<number, string | null>();
    for (const s of currentSeats) {
      seatMap.set(s.seat_number, s.role ? normalizeRoleValue(s.role) : null);
    }
    for (const item of items) {
      seatMap.set(item.seat_number, normalizeRoleValue(item.role));
    }

    const prospectiveSeatInputs: SeatRoleInput[] = Array.from(seatMap.entries()).map(([seat_number, role]) => ({
      seat_number,
      role,
    }));
    const prospectiveCounts = calculateRoleCounts(prospectiveSeatInputs);

    const transition = validateRoleCountsTransition(currentCounts, prospectiveCounts);
    if (!transition.allowed) {
      return res.status(400).json({
        error: transition.error,
        current_counts: currentCounts,
        prospective_counts: prospectiveCounts,
      });
    }

    await db.transaction(async (tx) => {
      for (const item of items) {
        const seatNum = item.seat_number;
        const roleVal = normalizeRoleValue(item.role);
        await tx.run(
          'UPDATE tournament_game_seats SET role = ? WHERE game_id = ? AND seat_number = ?',
          [roleVal, gameId, seatNum]
        );
      }
    });

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
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const check = await checkGameEditingPermission(db, tournament, game);
    if (!check.allowed) {
      return res.status(400).json({ error: check.error || 'Изменение судьи запрещено' });
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

    if (tournament.status !== 'draft') {
      return res.status(400).json({ error: 'Турнир не может быть запущен из текущего статуса' });
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

// Helper function to calculate standings, incorporating tie-breaking resolutions
export async function internalGetStandings(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) {
    throw new Error('Турнир не найден');
  }

  const participants = await db.all<any>(
    `SELECT tp.id as participant_id, tp.player_id, tp.participant_number, (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at,
            COALESCE(tp.display_name, p.nickname, 'Участник') as display_name
     FROM tournament_participants tp
     LEFT JOIN players p ON tp.player_id = p.id
     WHERE tp.tournament_id = ?
     ORDER BY tp.participant_number ASC`,
    [tournamentId]
  );

  const statsMap = new Map<string, any>();
  for (const p of participants) {
    statsMap.set(p.participant_id, {
      place: 0,
      calculated_place: 0,
      official_place: 0,
      participant_id: p.participant_id,
      player_id: p.player_id || null,
      avatar_updated_at: p.avatar_updated_at || null,
      participant_number: p.participant_number,
      display_name: p.display_name,
      total_points: 0,
      additional_total: 0,
      positive_points: 0,
      positive_judge_points: 0,
      negative_judge_points: 0,
      positive_protocol_points: 0,
      negative_protocol_points: 0,
      game_penalty_points: 0,
      disciplinary_penalty_points: 0,
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

  const completedGames = await db.all<any>(
    `SELECT g.id as game_id, g.game_number, COALESCE(p.winner_team, g.winner_team) as winner_team, p.first_killed_participant_id,
            p.best_move_participant_id, p.best_move_seats_json
     FROM tournament_games g
     INNER JOIN tournament_game_protocols p ON p.game_id = g.id
     WHERE g.tournament_id = ? AND g.status = 'completed' AND p.status = 'completed'
     ORDER BY g.game_number ASC`,
    [tournamentId]
  );

  const completed_games_count = completedGames.length;

  if (completed_games_count === 0) {
    return {
      tournament_id: tournamentId,
      completed_games_count: 0,
      tie_requires_draw: false,
      standings: [],
      tie_groups: [],
    };
  }

  const redFirstKilledCounts = new Map<string, number>();
  for (const p of participants) {
    redFirstKilledCounts.set(p.participant_id, 0);
  }

  for (const g of completedGames) {
    if (g.first_killed_participant_id) {
      const seats = await db.all<any>(
        `SELECT participant_id, role FROM tournament_game_seats WHERE game_id = ?`,
        [g.game_id]
      );
      const fkSeat = seats.find((s) => s.participant_id === g.first_killed_participant_id);
      if (fkSeat) {
        const normR = normalizeRole(fkSeat.role);
        if (normR === 'citizen' || normR === 'sheriff') {
          const cur = redFirstKilledCounts.get(g.first_killed_participant_id) || 0;
          redFirstKilledCounts.set(g.first_killed_participant_id, cur + 1);
        }
      }
    }
  }

  const distanceGames = 10;
  const thresholdB = calculateCiThreshold(distanceGames);
  const ciRatesMap = new Map<string, number>();
  for (const [partId, count] of redFirstKilledCounts.entries()) {
    const rate = calculateCiRate(count, thresholdB);
    ciRatesMap.set(partId, rate);
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

    const gameBms = await db.all<any>(`SELECT * FROM tournament_game_best_moves WHERE game_id = ?`, [g.game_id]);
    let bestMovesList = [];
    
    if (gameBms.length > 0) {
      for (const bm of gameBms) {
        let seat_numbers = [];
        try { seat_numbers = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
        bestMovesList.push({
          participant_id: bm.participant_id,
          source: bm.source,
          seat_numbers,
        });
      }
    } else if (g.best_move_participant_id) {
      let legacySeats = [];
      try { legacySeats = JSON.parse(g.best_move_seats_json || '[]'); } catch (_) {}
      
      let source = g.best_move_source;
      if (!source) {
        if (g.best_move_participant_id === g.first_killed_participant_id) source = 'first_killed';
        else if (g.best_move_participant_id === g.zero_round_voted_participant_id) source = 'zero_round_voted';
      }
      
      if (source) {
        bestMovesList.push({
          participant_id: g.best_move_participant_id,
          source,
          seat_numbers: legacySeats,
        });
      }
    }

    const bmPointsMap = new Map<string, number>();
    for (const bm of bestMovesList) {
      const points = calculateBestMovePoints(bm.seat_numbers, seatsListForLh).bonusPoints;
      bmPointsMap.set(bm.participant_id, (bmPointsMap.get(bm.participant_id) || 0) + points);
    }

    let hasBlackInFirstKilledBestMove = false;
    const fkBestMove = bestMovesList.find(bm => bm.source === 'first_killed' && bm.participant_id === g.first_killed_participant_id);
    if (fkBestMove) {
      for (const seatNum of fkBestMove.seat_numbers) {
        const targetSeat = seats.find((s) => s.seat_number === seatNum);
        if (targetSeat) {
          const targetRole = normalizeRole(targetSeat.role);
          if (targetRole === 'mafia' || targetRole === 'don') {
            hasBlackInFirstKilledBestMove = true;
            break;
          }
        }
      }
    }

    const results = await db.all<any>(
      `SELECT participant_id, judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points
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
      const discPenalty = Number(resRow?.disciplinary_penalty_points || 0);

      let winPoint = 0;
      if (g.winner_team === 'red' && (normRole === 'citizen' || normRole === 'sheriff')) {
        winPoint = 1;
      } else if (g.winner_team === 'black' && (normRole === 'mafia' || normRole === 'don')) {
        winPoint = 1;
      }

      const positiveJudge = Math.max(judgeBonus, 0);
      const negativeJudge = Math.max(-judgeBonus, 0);

      const positiveProtocol = Math.max(protocolBonus, 0);
      const negativeProtocol = Math.max(-protocolBonus, 0);

      const posPoints = roundToTwo(positiveJudge + positiveProtocol);
      const gamePenPoints = roundToTwo(negativeJudge + negativeProtocol);
      const bmPoints = roundToTwo(bmPointsMap.get(s.participant_id) || 0);
      const discPenPoints = roundToTwo(discPenalty);

      const playerRate = ciRatesMap.get(s.participant_id) || 0;
      const ciResult = calculateGameCi({
        isFirstKilled: g.first_killed_participant_id === s.participant_id,
        role: s.role,
        winnerTeam: g.winner_team,
        bestMoveParticipantId: fkBestMove ? fkBestMove.participant_id : null,
        participantId: s.participant_id,
        hasBlackInBestMove: hasBlackInFirstKilledBestMove,
        playerRate,
      });
      const gameCi = ciResult.gameCi;
      const ciReason = ciResult.ciReason;

      const addTotalGame = roundToTwo(posPoints + bmPoints - discPenPoints - gamePenPoints);
      const gameTotal = roundToTwo(winPoint + addTotalGame + gameCi);

      pStats.games_played += 1;
      pStats.wins += winPoint;
      if (winPoint === 1 && normRole === 'don') pStats.don_wins += 1;
      if (winPoint === 1 && normRole === 'sheriff') pStats.sheriff_wins += 1;
      if (g.first_killed_participant_id && s.participant_id === g.first_killed_participant_id) {
        pStats.first_killed_count += 1;
      }

      pStats.positive_judge_points = roundToTwo(pStats.positive_judge_points + positiveJudge);
      pStats.negative_judge_points = roundToTwo(pStats.negative_judge_points + negativeJudge);
      pStats.positive_protocol_points = roundToTwo(pStats.positive_protocol_points + positiveProtocol);
      pStats.negative_protocol_points = roundToTwo(pStats.negative_protocol_points + negativeProtocol);

      pStats.positive_points = roundToTwo(pStats.positive_points + posPoints);
      pStats.judge_bonus = roundToTwo((pStats.judge_bonus || 0) + judgeBonus);
      pStats.protocol_bonus = roundToTwo((pStats.protocol_bonus || 0) + protocolBonus);
      pStats.best_move_points = roundToTwo(pStats.best_move_points + bmPoints);
      pStats.game_penalty_points = roundToTwo(pStats.game_penalty_points + gamePenPoints);
      pStats.disciplinary_penalty_points = roundToTwo(pStats.disciplinary_penalty_points + discPenPoints);
      pStats.penalty_points = roundToTwo(pStats.game_penalty_points + pStats.disciplinary_penalty_points);
      pStats.ci_points = roundToTwo(pStats.ci_points + gameCi);
      pStats.additional_total = roundToTwo(pStats.additional_total + addTotalGame);
      pStats.total_points = roundToTwo(pStats.total_points + gameTotal);

      pStats.games.push({
        game_number: g.game_number,
        seat_number: s.seat_number,
        role: s.role,
        winner_team: g.winner_team,
        win_point: winPoint,
        judge_bonus: judgeBonus,
        protocol_bonus: protocolBonus,
        positive_judge_points: positiveJudge,
        negative_judge_points: negativeJudge,
        positive_protocol_points: positiveProtocol,
        negative_protocol_points: negativeProtocol,
        positive_points: posPoints,
        best_move_points: bmPoints,
        game_penalty_points: gamePenPoints,
        disciplinary_penalty_points: discPenPoints,
        penalty_points: roundToTwo(gamePenPoints + discPenPoints),
        ci_points: gameCi,
        ci_rate: playerRate,
        ci_reason: ciReason,
        game_total: gameTotal,
      });
    }
  }

  const standingsList = Array.from(statsMap.values());

  for (const item of standingsList) {
    const redCount = redFirstKilledCounts.get(item.participant_id) || 0;
    const rate = ciRatesMap.get(item.participant_id) || 0;
    item.ci_calculation = {
      distance_games: distanceGames,
      threshold_b: calculateCiThreshold(distanceGames),
      first_killed_count: redCount,
      ci_rate: rate,
      provisional: tournament.status !== 'completed',
    };
  }

  // Initial standard sorting
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
    const sumDS_b = b.don_wins + b.sheriff_wins;
    const sumDS_a = a.don_wins + a.sheriff_wins;
    if (sumDS_b !== sumDS_a) {
      return sumDS_b - sumDS_a;
    }
    if (b.first_killed_count !== a.first_killed_count) {
      return b.first_killed_count - a.first_killed_count;
    }
    return a.participant_number - b.participant_number;
  });

  // Assign calculated_place
  for (let i = 0; i < standingsList.length; i++) {
    if (i === 0) {
      standingsList[i].calculated_place = 1;
    } else {
      const prev = standingsList[i - 1];
      const curr = standingsList[i];
      const isEqual =
        Math.abs(curr.total_points - prev.total_points) < 0.0001 &&
        Math.abs(curr.additional_total - prev.additional_total) < 0.0001 &&
        curr.wins === prev.wins &&
        (curr.don_wins + curr.sheriff_wins) === (prev.don_wins + prev.sheriff_wins) &&
        curr.first_killed_count === prev.first_killed_count;

      if (isEqual) {
        standingsList[i].calculated_place = prev.calculated_place;
      } else {
        standingsList[i].calculated_place = i + 1;
      }
    }
    standingsList[i].official_place = standingsList[i].calculated_place;
    standingsList[i].place = standingsList[i].calculated_place;
  }

  // Find tie groups (only for players with games_played > 0)
  const tieGroups: Array<{ tie_group_id: string; participant_ids: string[] }> = [];
  const tieGroupMap = new Map<string, string[]>();

  for (const item of standingsList) {
    if (item.games_played === 0) continue;
    const sportKey = `${item.total_points}_${item.additional_total}_${item.wins}_${item.don_wins + item.sheriff_wins}_${item.first_killed_count}`;
    if (!tieGroupMap.has(sportKey)) {
      tieGroupMap.set(sportKey, []);
    }
    tieGroupMap.get(sportKey)!.push(item.participant_id);
  }

  for (const [sportKey, pids] of tieGroupMap.entries()) {
    if (pids.length >= 2) {
      const ptsStr = String(sportKey).replace(/\./g, '_');
      const tieGroupId = `tg_${ptsStr}`;
      tieGroups.push({
        tie_group_id: tieGroupId,
        participant_ids: pids,
      });
    }
  }

  // Associate tie_group_id
  for (const item of standingsList) {
    const group = tieGroups.find(g => g.participant_ids.includes(item.participant_id));
    item.tie_group_id = group ? group.tie_group_id : null;
  }

  // Load final standings resolutions
  const resolutions = await db.all<any>(
    'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = ?',
    [tournamentId, 'standings_tie']
  );

  const resMap = new Map<string, any>();
  for (const r of resolutions) {
    let pids: string[] = [];
    try { pids = JSON.parse(r.participant_ids_json || '[]'); } catch (_) {}
    const sortedKey = [...pids].sort().join(',');
    resMap.set(sortedKey, r);
  }

  let tieRequiresDraw = false;

  for (const group of tieGroups) {
    const sortedKey = [...group.participant_ids].sort().join(',');
    const resolution = resMap.get(sortedKey);

    if (resolution) {
      let orderedPids: string[] = [];
      try { orderedPids = JSON.parse(resolution.ordered_participant_ids_json || '[]'); } catch (_) {}

      const basePlace = Math.min(
        ...standingsList
          .filter(item => group.participant_ids.includes(item.participant_id))
          .map(item => item.calculated_place)
      );

      for (const item of standingsList) {
        if (group.participant_ids.includes(item.participant_id)) {
          const orderIndex = orderedPids.indexOf(item.participant_id);
          if (orderIndex !== -1) {
            item.official_place = basePlace + orderIndex;
            item.place = item.official_place;
          }
        }
      }
    } else {
      tieRequiresDraw = true;
    }
  }

  // Sort by official_place ASC, stable sorting by participant_number
  standingsList.sort((a, b) => {
    if (a.official_place !== b.official_place) {
      return a.official_place - b.official_place;
    }
    return a.participant_number - b.participant_number;
  });

  return {
    tournament_id: tournamentId,
    completed_games_count,
    tie_requires_draw: tieRequiresDraw,
    standings: standingsList,
    tie_groups: tieGroups,
  };
}

// Helper function to calculate nominations, incorporating tie-breaking resolutions
export async function internalGetNominations(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) throw new Error('Турнир не найден');

  const participants = await db.all<any>(
    `SELECT tp.id as participant_id, tp.participant_number,
            COALESCE(tp.display_name, p.nickname, 'Участник') as display_name
       FROM tournament_participants tp
       LEFT JOIN players p ON tp.player_id = p.id
      WHERE tp.tournament_id = ?
      ORDER BY tp.participant_number ASC`,
    [tournamentId]
  );

  const completedGames = await db.all<any>(
    `SELECT g.id as game_id, g.game_number, g.winner_team,
            p.best_move_participant_id, p.best_move_seats_json
       FROM tournament_games g
       INNER JOIN tournament_game_protocols p ON p.game_id = g.id
      WHERE g.tournament_id = ? AND g.status = 'completed' AND p.status = 'completed'
      ORDER BY g.game_number ASC`,
    [tournamentId]
  );

  const gameDataList: Array<{
    game_id: string;
    game_number: number;
    winner_team: 'red' | 'black' | null;
    seats: Array<{ participant_id: string; seat_number: number; role: string | null }>;
    resultsMap: Map<string, any>;
    bmPointsMap: Map<string, number>;
  }> = [];

  for (const g of completedGames) {
    const seats = await db.all<any>(
      'SELECT participant_id, seat_number, role FROM tournament_game_seats WHERE game_id = ?',
      [g.game_id]
    );
    const results = await db.all<any>(
      'SELECT participant_id, judge_bonus, protocol_bonus, penalty_points FROM tournament_game_player_results WHERE game_id = ?',
      [g.game_id]
    );
    const resultMap = new Map<string, any>();
    for (const r of results) resultMap.set(r.participant_id, r);

    const gameBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [g.game_id]);
    const bestMovesList: Array<{ participant_id: string; seat_numbers: number[] }> = [];
    if (gameBms.length > 0) {
      for (const bm of gameBms) {
        let seatNumbers: number[] = [];
        try { seatNumbers = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
        bestMovesList.push({ participant_id: bm.participant_id, seat_numbers: seatNumbers });
      }
    } else if (g.best_move_participant_id) {
      let legacySeats: number[] = [];
      try { legacySeats = JSON.parse(g.best_move_seats_json || '[]'); } catch (_) {}
      bestMovesList.push({ participant_id: g.best_move_participant_id, seat_numbers: legacySeats });
    }

    const bmPointsMap = new Map<string, number>();
    for (const bm of bestMovesList) {
      const points = calculateBestMovePoints(bm.seat_numbers, seats).bonusPoints;
      bmPointsMap.set(bm.participant_id, roundToTwo((bmPointsMap.get(bm.participant_id) || 0) + points));
    }

    gameDataList.push({
      game_id: g.game_id,
      game_number: g.game_number,
      winner_team: g.winner_team === 'red' || g.winner_team === 'black' ? g.winner_team : null,
      seats,
      resultsMap: resultMap,
      bmPointsMap,
    });
  }

  const categoriesDef: Array<{ category: TournamentNominationCategory; title: string; targetRoles: string[] }> = [
    { category: 'best_citizen', title: 'Лучший мирный', targetRoles: ['citizen'] },
    { category: 'best_mafia', title: 'Лучшая мафия', targetRoles: ['mafia'] },
    { category: 'best_sheriff', title: 'Лучший Шериф', targetRoles: ['sheriff'] },
    { category: 'best_don', title: 'Лучший Дон', targetRoles: ['don'] },
    { category: 'mvp', title: 'MVP', targetRoles: ['citizen', 'sheriff', 'mafia', 'don'] },
  ];

  const teamForRole = (role: string | null): 'red' | 'black' | null => {
    const normalized = normalizeRole(role);
    if (normalized === 'citizen' || normalized === 'sheriff') return 'red';
    if (normalized === 'mafia' || normalized === 'don') return 'black';
    return null;
  };

  const headToHeadGames: NominationHeadToHeadGame[] = gameDataList
    .filter((game) => game.winner_team)
    .map((game) => ({
      game_id: game.game_id,
      game_number: game.game_number,
      winner_team: game.winner_team!,
      participants: game.seats
        .map((seat) => ({ participant_id: seat.participant_id, team: teamForRole(seat.role) }))
        .filter((item): item is { participant_id: string; team: 'red' | 'black' } => Boolean(item.team)),
    }));

  const nominationsResult = [];

  for (const cat of categoriesDef) {
    const candidateList: any[] = [];

    for (const participant of participants) {
      let gamesInRole = 0;
      let sumJudge = 0;
      let sumProtocol = 0;
      let sumBestMove = 0;
      let roleWins = 0;
      const breakdown: any[] = [];

      for (const game of gameDataList) {
        const seat = game.seats.find((item) => item.participant_id === participant.participant_id);
        if (!seat) continue;
        const normalizedRole = normalizeRole(seat.role);
        if (!normalizedRole || !cat.targetRoles.includes(normalizedRole)) continue;

        gamesInRole++;
        const result = game.resultsMap.get(participant.participant_id);
        const judge = Number(result?.judge_bonus || 0);
        const protocol = Number(result?.protocol_bonus || 0);
        const bestMove = game.bmPointsMap.get(participant.participant_id) || 0;
        sumJudge = roundToTwo(sumJudge + judge);
        sumProtocol = roundToTwo(sumProtocol + protocol);
        sumBestMove = roundToTwo(sumBestMove + bestMove);

        const team = teamForRole(seat.role);
        if ((cat.category === 'best_sheriff' || cat.category === 'best_don') && team && team === game.winner_team) {
          roleWins++;
        }

        breakdown.push({
          game_number: game.game_number,
          role: seat.role,
          judge_bonus: judge,
          protocol_bonus: protocol,
          best_move_points: bestMove,
          nomination_points: roundToTwo(judge + protocol + bestMove),
        });
      }

      if (gamesInRole >= 1) {
        const additionalPoints = roundToTwo(sumProtocol + sumBestMove);
        candidateList.push({
          participant_id: participant.participant_id,
          participant_number: participant.participant_number,
          display_name: participant.display_name,
          points: sumJudge,
          additional_points: additionalPoints,
          role_wins: roleWins,
          nomination_points: roundToTwo(sumJudge + additionalPoints),
          games_in_role: gamesInRole,
          judge_bonus: sumJudge,
          protocol_bonus: sumProtocol,
          best_move_points: sumBestMove,
          breakdown,
        });
      }
    }

    const comparison = compareTournamentNominationCandidates(
      cat.category,
      candidateList.map((candidate) => ({
        participant_id: candidate.participant_id,
        display_name: candidate.display_name,
        points: candidate.points,
        additional_points: candidate.additional_points,
        role_wins: candidate.role_wins,
      })),
      headToHeadGames,
    );

    candidateList.sort((a, b) => {
      const byPoints = b.points - a.points;
      if (Math.abs(byPoints) > 0.0001) return byPoints;
      const byAdditional = b.additional_points - a.additional_points;
      if (Math.abs(byAdditional) > 0.0001) return byAdditional;
      if (cat.category === 'best_sheriff' || cat.category === 'best_don') {
        const byRoleWins = b.role_wins - a.role_wins;
        if (byRoleWins) return byRoleWins;
      }
      return Number(a.participant_number || 0) - Number(b.participant_number || 0);
    });

    nominationsResult.push({
      category: cat.category,
      title: cat.title,
      has_tie: comparison.has_exact_tie,
      candidates: candidateList,
      winner_participant_id: comparison.winner_participant_id,
      decisive_criterion: comparison.decisive_criterion,
      comparison,
    });
  }

  return {
    tournament_id: tournamentId,
    provisional: tournament.status !== 'completed',
    nominations: nominationsResult,
  };
}

// GET /api/tournaments/:tournamentId/standings
router.get('/:tournamentId/standings', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;

  try {
    const standingsData = await internalGetStandings(db, tournamentId);
    res.json(standingsData);
  } catch (err: any) {
    if (err.message === 'Турнир не найден') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Ошибка вычисления турнирной таблицы' });
  }
});

// POST /api/tournaments/:id/complete
router.post('/:id/complete', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Турнир уже завершён' });
    }

    if (tournament.status !== 'active' && tournament.status !== 'correction') {
      return res.status(400).json({ error: 'Завершить можно только активный турнир или турнир в режиме корректировки' });
    }

    const readiness = await computeCompleteReadiness(db, tournamentId);
    if (!readiness.isReady) {
      return res.status(400).json({
        error: 'Турнир не готов к завершению',
        reasons: readiness.errors,
      });
    }

    const now = new Date().toISOString();
    await db.run(
      "UPDATE tournaments SET status = 'completed', updated_at = ? WHERE id = ?",
      [now, tournamentId]
    );

    res.json({
      success: true,
      tournament_id: tournamentId,
      status: 'completed',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка завершения турнира' });
  }
});

// POST /api/tournaments/:id/reopen-for-correction - Reopen completed tournament for correction
router.post('/:id/reopen-for-correction', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status !== 'completed') {
      return res.status(400).json({ error: 'Редактировать можно только завершённый турнир' });
    }

    const result = await db.transaction(async (tx) => {
      const resolutions = await tx.all<any>(
        'SELECT id FROM tournament_final_resolutions WHERE tournament_id = ?',
        [tournamentId]
      );
      const invalidatedCount = resolutions.length;

      if (invalidatedCount > 0) {
        await tx.run(
          'DELETE FROM tournament_final_resolutions WHERE tournament_id = ?',
          [tournamentId]
        );
      }

      const awardOverrides = await tx.all<any>(
        'SELECT id FROM tournament_award_overrides WHERE tournament_id = ?',
        [tournamentId]
      );
      const invalidatedAwardOverridesCount = awardOverrides.length;
      if (invalidatedAwardOverridesCount > 0) {
        await tx.run(
          'DELETE FROM tournament_award_overrides WHERE tournament_id = ?',
          [tournamentId]
        );
      }

      const now = new Date().toISOString();
      await tx.run(
        "UPDATE tournaments SET status = 'correction', results_published_at = NULL, updated_at = ? WHERE id = ?",
        [now, tournamentId]
      );

      return {
        invalidated_resolutions_count: invalidatedCount,
        invalidated_award_overrides_count: invalidatedAwardOverridesCount,
      };
    });

    res.json({
      success: true,
      tournament_id: tournamentId,
      status: 'correction',
      public_results_hidden: true,
      invalidated_resolutions_count: result.invalidated_resolutions_count,
      invalidated_award_overrides_count: result.invalidated_award_overrides_count,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка возврата турнира на корректировку' });
  }
});

// GET /api/tournaments/:tournamentId/nominations
router.get('/:tournamentId/nominations', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;

  try {
    const nominationsData = await internalGetNominations(db, tournamentId);
    res.json(nominationsData);
  } catch (err: any) {
    if (err.message === 'Турнир не найден') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Ошибка вычисления номинаций' });
  }
});

// GET /api/tournaments/:id/final-resolutions - Load final resolutions
router.get('/:id/final-resolutions', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const resolutions = await db.all<any>(
      'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = ?',
      [tournamentId, 'standings_tie']
    );

    const formatted = resolutions.map(r => ({
      ...r,
      participant_ids: JSON.parse(r.participant_ids_json || '[]'),
      ordered_participant_ids: r.ordered_participant_ids_json ? JSON.parse(r.ordered_participant_ids_json) : null,
    }));

    res.json({
      tournament_id: tournamentId,
      resolutions: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка загрузки финальных решений' });
  }
});

// PUT /api/tournaments/:id/final-resolutions/standings/:tieGroupId - Set standing tie resolution
router.put('/:id/final-resolutions/standings/:tieGroupId', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, tieGroupId } = req.params;
  const { ordered_participant_ids, resolution_method, comment } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }
    if (tournament.status !== 'completed') {
      return res.status(400).json({ error: 'Решения разрешены только для completed-турнира' });
    }

    if (!Array.isArray(ordered_participant_ids) || ordered_participant_ids.length < 2) {
      return res.status(400).json({ error: 'Должен быть передан массив упорядоченных участников длиной от 2' });
    }

    if (!['draw', 'chief_judge_decision'].includes(resolution_method)) {
      return res.status(400).json({ error: 'Неверный способ решения' });
    }

    // Compute current standings to find the tie group
    const standingsData = await internalGetStandings(db, tournamentId);
    const tieGroup = standingsData.tie_groups.find(g => g.tie_group_id === tieGroupId);

    if (!tieGroup) {
      return res.status(400).json({ error: 'Группа равенства не найдена или неактивна' });
    }

    // Verify ordered_participant_ids matches exactly the tieGroup participants
    const inputSorted = [...ordered_participant_ids].sort().join(',');
    const groupSorted = [...tieGroup.participant_ids].sort().join(',');

    if (inputSorted !== groupSorted) {
      return res.status(400).json({ error: 'Нельзя включить в решение игрока, который не входит в эту группу равенства' });
    }

    const existing = await db.all<any>(
      'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = ?',
      [tournamentId, 'standings_tie']
    );

    const match = existing.find(r => {
      let pids: string[] = [];
      try { pids = JSON.parse(r.participant_ids_json || '[]'); } catch (_) {}
      return [...pids].sort().join(',') === groupSorted;
    });

    const now = new Date().toISOString();

    if (match) {
      await db.run(
        `UPDATE tournament_final_resolutions
         SET ordered_participant_ids_json = ?, resolution_method = ?, comment = ?, updated_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(ordered_participant_ids),
          resolution_method,
          comment || null,
          now,
          match.id
        ]
      );
    } else {
      const newId = crypto.randomUUID();
      await db.run(
        `INSERT INTO tournament_final_resolutions (
           id, tournament_id, type, category, participant_ids_json,
           ordered_participant_ids_json, winner_participant_id, resolution_method, comment, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          newId,
          tournamentId,
          'standings_tie',
          JSON.stringify(tieGroup.participant_ids),
          JSON.stringify(ordered_participant_ids),
          resolution_method,
          comment || null,
          now,
          now
        ]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения решения равенства таблиц' });
  }
});

// Legacy endpoint retained only as an explicit compatibility error.
// Nomination winners are deterministic and cannot be selected manually.
router.put('/:id/final-resolutions/nominations/:category', requireOrganizerAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({ error: 'Номинации определяются автоматически по каноническим критериям.' });
});

// GET /api/tournaments/:id/final-readiness - Get final readiness check results
router.get('/:id/final-readiness', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const standingsData = await internalGetStandings(db, tournamentId);
    const nominationsData = await internalGetNominations(db, tournamentId);

    // Standing resolutions
    const standingsResolutions = await db.all<any>(
      'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = ?',
      [tournamentId, 'standings_tie']
    );
    const standingsResolutionsMap = new Set<string>();
    for (const r of standingsResolutions) {
      let pids: string[] = [];
      try { pids = JSON.parse(r.participant_ids_json || '[]'); } catch (_) {}
      standingsResolutionsMap.add([...pids].sort().join(','));
    }

    const unresolvedStandings = [];
    for (const group of standingsData.tie_groups) {
      const sortedKey = [...group.participant_ids].sort().join(',');
      if (!standingsResolutionsMap.has(sortedKey)) {
        const displayNames = group.participant_ids.map(pid => {
          const item = standingsData.standings.find(s => s.participant_id === pid);
          return item ? item.display_name : pid;
        });
        unresolvedStandings.push({
          tie_group_id: group.tie_group_id,
          participant_ids: group.participant_ids,
          display_names: displayNames,
        });
      }
    }

    const unresolvedNominations = nominationsData.nominations
      .filter((cat) => cat.has_tie)
      .map((cat) => {
        const tiedIds = cat.comparison?.tied_participant_ids || [];
        const tiedCandidates = cat.candidates.filter((candidate) => tiedIds.includes(candidate.participant_id));
        return {
          category: cat.category,
          title: cat.title,
          candidate_ids: tiedIds,
          display_names: tiedCandidates.map((candidate) => candidate.display_name),
        };
      });

    const ready = unresolvedStandings.length === 0 && unresolvedNominations.length === 0;

    res.json({
      ready,
      unresolved_standings_ties: unresolvedStandings,
      unresolved_nomination_ties: unresolvedNominations,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка проверки готовности результатов' });
  }
});

// POST /api/tournaments/:id/publish - Publish tournament results
router.post('/:id/publish', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status !== 'completed') {
      return res.status(400).json({ error: 'Публикация результатов возможна только для завершённых турниров' });
    }

    const standingsData = await internalGetStandings(db, tournamentId);
    const nominationsData = await internalGetNominations(db, tournamentId);

    // Standing resolutions
    const standingsResolutions = await db.all<any>(
      'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = ?',
      [tournamentId, 'standings_tie']
    );
    const standingsResolutionsMap = new Set<string>();
    for (const r of standingsResolutions) {
      let pids: string[] = [];
      try { pids = JSON.parse(r.participant_ids_json || '[]'); } catch (_) {}
      standingsResolutionsMap.add([...pids].sort().join(','));
    }

    const unresolvedStandings = [];
    for (const group of standingsData.tie_groups) {
      const sortedKey = [...group.participant_ids].sort().join(',');
      if (!standingsResolutionsMap.has(sortedKey)) {
        unresolvedStandings.push(group.tie_group_id);
      }
    }

    const unresolvedNominations = nominationsData.nominations
      .filter((cat) => cat.has_tie)
      .map((cat) => cat.category);

    const ready = unresolvedStandings.length === 0 && unresolvedNominations.length === 0;
    if (!ready) {
      return res.status(400).json({ error: 'Нельзя опубликовать результаты: не все равенства разрешены' });
    }

    let publicToken = tournament.public_token;
    if (!publicToken) {
      publicToken = crypto.randomUUID();
    }
    const now = new Date().toISOString();

    await db.run(
      'UPDATE tournaments SET public_token = ?, results_published_at = ?, updated_at = ? WHERE id = ?',
      [publicToken, now, now, tournamentId]
    );

    res.json({ success: true, public_token: publicToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка публикации результатов' });
  }
});

// Helper for dynamic safe insertion using whitelist and PRAGMA table_info
const ALLOWED_BACKUP_TABLES = new Set([
  'players',
  'tournaments',
  'tournament_participants',
  'tournament_games',
  'tournament_game_seats',
  'tournament_game_protocols',
  'tournament_game_player_results',
  'tournament_game_best_moves',
  'tournament_final_resolutions',
  'tournament_protocol_imports',
]);

const cachedTableColumns = new Map<string, Set<string>>();

export async function insertRowSafe(
  tx: DatabaseWrapper,
  tableName: string,
  row: Record<string, any>,
  options: { upsertKey?: string; mode?: 'insert' | 'update' | 'upsert' } = {}
) {
  if (!ALLOWED_BACKUP_TABLES.has(tableName)) {
    throw new Error(`Таблица ${tableName} не входит в белый список разрешённых таблиц`);
  }

  let validColumns = cachedTableColumns.get(tableName);
  if (!validColumns) {
    const columnsInfo = await tx.all<any>(`PRAGMA table_info(${tableName})`);
    validColumns = new Set<string>(columnsInfo.map((c: any) => c.name));
    cachedTableColumns.set(tableName, validColumns);
  }

  const keysToInsert = Object.keys(row).filter((key) => validColumns!.has(key));
  if (keysToInsert.length === 0) return;

  const mode = options.mode || 'insert';
  const keyColumn = options.upsertKey || 'id';

  if (mode === 'update') {
    const setKeys = keysToInsert.filter((k) => k !== keyColumn);
    if (setKeys.length === 0) return;
    const setClause = setKeys.map((k) => `${k} = ?`).join(', ');
    const params = [...setKeys.map((k) => row[k] ?? null), row[keyColumn]];
    await tx.run(`UPDATE ${tableName} SET ${setClause} WHERE ${keyColumn} = ?`, params);
  } else if (mode === 'upsert') {
    const placeholders = keysToInsert.map(() => '?').join(', ');
    const updateKeys = keysToInsert.filter((k) => k !== keyColumn);
    if (updateKeys.length > 0) {
      const updateClause = updateKeys.map((k) => `${k} = excluded.${k}`).join(', ');
      const sql = `INSERT INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updateClause}`;
      const params = keysToInsert.map((k) => row[k] ?? null);
      await tx.run(sql, params);
    } else {
      const sql = `INSERT OR IGNORE INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders})`;
      const params = keysToInsert.map((k) => row[k] ?? null);
      await tx.run(sql, params);
    }
  } else {
    const placeholders = keysToInsert.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders})`;
    const params = keysToInsert.map((k) => row[k] ?? null);
    await tx.run(sql, params);
  }
}

// Helper for backup validation
export function validateTournamentBackupData(backupData: any, tournamentId: string) {
  if (!backupData || typeof backupData !== 'object') {
    return { valid: false, error: 'Невалидный формат резервной копии: ожидается JSON-объект' };
  }

  if (backupData.schema_version !== 1) {
    return { valid: false, error: `Неподдерживаемая версия схемы: ${backupData.schema_version}` };
  }

  if (!backupData.checksum || typeof backupData.checksum !== 'string') {
    return { valid: false, error: 'Отсутствует контрольная сумма (checksum)' };
  }

  const { checksum, ...payload } = backupData;
  const computedChecksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (checksum !== computedChecksum) {
    return { valid: false, error: 'Неправильная контрольная сумма (checksum). Файл повреждён или изменён.' };
  }

  if (payload.metadata?.tournament_id !== tournamentId || payload.tournament?.id !== tournamentId) {
    return { valid: false, error: 'Импортируемая резервная копия относится к другому турниру.' };
  }

  const participants = payload.tournament_participants || [];
  if (!Array.isArray(participants) || participants.length !== 10) {
    return { valid: false, error: `В копии должно быть ровно 10 участников, найдено: ${participants.length}` };
  }

  const games = payload.tournament_games || [];
  if (!Array.isArray(games) || games.length !== 10) {
    return { valid: false, error: `В копии должно быть ровно 10 игр, найдено: ${games.length}` };
  }

  const players = payload.players || [];
  if (!Array.isArray(players)) {
    return { valid: false, error: 'Список игроков имеет неверный формат' };
  }
  const playerIds = new Set(players.map((p: any) => p?.id).filter(Boolean));

  const participantIds = new Set<string>();
  const participantNumbers = new Set<number>();
  for (const participant of participants) {
    if (!participant?.id || participantIds.has(participant.id)) {
      return { valid: false, error: `Дублирующийся или пустой ID участника: ${participant?.id || 'пусто'}` };
    }
    if (participant.tournament_id !== tournamentId || !playerIds.has(participant.player_id)) {
      return { valid: false, error: `Участник ${participant.id} ссылается на неверный турнир или отсутствующего игрока` };
    }
    const number = Number(participant.participant_number);
    if (!Number.isInteger(number) || number < 1 || number > 10 || participantNumbers.has(number)) {
      return { valid: false, error: `Некорректный или повторяющийся номер участника: ${participant.participant_number}` };
    }
    participantIds.add(participant.id);
    participantNumbers.add(number);
  }

  const gameIds = new Set<string>();
  const gameNumbers = new Set<number>();
  for (const game of games) {
    const number = Number(game?.game_number);
    if (!game?.id || gameIds.has(game.id) || game.tournament_id !== tournamentId) {
      return { valid: false, error: `Игра содержит неверный турнир или повторяющийся ID: ${game?.id || 'пусто'}` };
    }
    if (!Number.isInteger(number) || number < 1 || number > 10 || gameNumbers.has(number)) {
      return { valid: false, error: `Некорректный или повторяющийся номер игры: ${game?.game_number}` };
    }
    gameIds.add(game.id);
    gameNumbers.add(number);
  }

  const seats = payload.tournament_game_seats || [];
  if (!Array.isArray(seats)) {
    return { valid: false, error: 'Список рассадки имеет неверный формат' };
  }
  const seatsByGame = new Map<string, number>();
  const seatNumbersByGame = new Map<string, Set<number>>();
  const seatedParticipantsByGame = new Map<string, Set<string>>();
  for (const s of seats) {
    if (!gameIds.has(s?.game_id) || !participantIds.has(s?.participant_id)) {
      return { valid: false, error: `Место ${s?.id || 'без ID'} ссылается на отсутствующую игру или участника` };
    }
    const seatNumber = Number(s.seat_number);
    const seatNumbers = seatNumbersByGame.get(s.game_id) || new Set<number>();
    const seatedParticipants = seatedParticipantsByGame.get(s.game_id) || new Set<string>();
    if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 10 || seatNumbers.has(seatNumber)) {
      return { valid: false, error: `В игре ${s.game_id} повторяется или некорректно место ${s.seat_number}` };
    }
    if (seatedParticipants.has(s.participant_id)) {
      return { valid: false, error: `В игре ${s.game_id} участник ${s.participant_id} посажен дважды` };
    }
    seatNumbers.add(seatNumber);
    seatedParticipants.add(s.participant_id);
    seatNumbersByGame.set(s.game_id, seatNumbers);
    seatedParticipantsByGame.set(s.game_id, seatedParticipants);
    seatsByGame.set(s.game_id, (seatsByGame.get(s.game_id) || 0) + 1);
  }
  for (const g of games) {
    const seatCount = seatsByGame.get(g.id) || 0;
    if (seatCount !== 10) {
      return { valid: false, error: `Игра №${g.game_number} имеет ${seatCount} мест вместо 10` };
    }
  }

  const protocols = payload.tournament_game_protocols || [];
  const results = payload.tournament_game_player_results || [];
  if (!Array.isArray(protocols) || !Array.isArray(results)) {
    return { valid: false, error: 'Протоколы или результаты игроков имеют неверный формат' };
  }
  const protocolGames = new Set<string>();
  for (const protocol of protocols) {
    if (!gameIds.has(protocol?.game_id) || protocolGames.has(protocol.game_id)) {
      return { valid: false, error: `Протокол ссылается на отсутствующую игру или дублирует игру ${protocol?.game_id}` };
    }
    protocolGames.add(protocol.game_id);
  }

  const resultsByGame = new Map<string, number>();
  const resultKeys = new Set<string>();
  for (const r of results) {
    const key = `${r?.game_id}:${r?.participant_id}`;
    if (
      !gameIds.has(r?.game_id) ||
      !participantIds.has(r?.participant_id) ||
      !seatedParticipantsByGame.get(r.game_id)?.has(r.participant_id) ||
      resultKeys.has(key)
    ) {
      return { valid: false, error: `Некорректный или повторяющийся результат ${key}` };
    }
    resultKeys.add(key);
    resultsByGame.set(r.game_id, (resultsByGame.get(r.game_id) || 0) + 1);
  }

  for (const [gameId, count] of resultsByGame) {
    if (!protocolGames.has(gameId) || count !== 10) {
      return { valid: false, error: `Игра ${gameId} содержит ${count} результатов без полного протокола` };
    }
  }

  for (const pr of protocols) {
    if (pr.status === 'completed') {
      const resCount = resultsByGame.get(pr.game_id) || 0;
      if (resCount !== 10) {
        return { valid: false, error: `Завершённый протокол содержит ${resCount} результатов вместо 10` };
      }
    }
  }

  const bestMoves = payload.tournament_game_best_moves || [];
  if (!Array.isArray(bestMoves)) {
    return { valid: false, error: 'Лучшие ходы имеют неверный формат' };
  }
  for (const bestMove of bestMoves) {
    if (!gameIds.has(bestMove?.game_id) || !participantIds.has(bestMove?.participant_id)) {
      return { valid: false, error: `Лучший ход ${bestMove?.id || 'без ID'} содержит неверную ссылку` };
    }
  }

  return { valid: true };
}

// GET /api/tournaments/:tournamentId/backup
router.get('/:tournamentId/backup', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const participants = await db.all<any>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC',
      [tournamentId]
    );

    const playerIds = Array.from(new Set(participants.map((p: any) => p.player_id).filter(Boolean)));
    let players: any[] = [];
    if (playerIds.length > 0) {
      const placeholders = playerIds.map(() => '?').join(',');
      players = await db.all<any>(`SELECT * FROM players WHERE id IN (${placeholders})`, playerIds);
    }

    const games = await db.all<any>(
      'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
      [tournamentId]
    );

    const gameIds = games.map((g: any) => g.id);
    let seats: any[] = [];
    let protocols: any[] = [];
    let playerResults: any[] = [];
    let bestMoves: any[] = [];

    if (gameIds.length > 0) {
      const gPlaceholders = gameIds.map(() => '?').join(',');
      seats = await db.all<any>(`SELECT * FROM tournament_game_seats WHERE game_id IN (${gPlaceholders})`, gameIds);
      protocols = await db.all<any>(`SELECT * FROM tournament_game_protocols WHERE game_id IN (${gPlaceholders})`, gameIds);
      playerResults = await db.all<any>(`SELECT * FROM tournament_game_player_results WHERE game_id IN (${gPlaceholders})`, gameIds);
      bestMoves = await db.all<any>(`SELECT * FROM tournament_game_best_moves WHERE game_id IN (${gPlaceholders})`, gameIds);
    }

    const finalResolutions = await db.all<any>(
      'SELECT * FROM tournament_final_resolutions WHERE tournament_id = ?',
      [tournamentId]
    );

    const protocolImports = await db.all<any>(
      'SELECT * FROM tournament_protocol_imports WHERE tournament_id = ?',
      [tournamentId]
    );

    const payload = {
      schema_version: 1,
      metadata: {
        created_at: new Date().toISOString(),
        data_updated_at: [
          tournament,
          ...games,
          ...protocols,
          ...bestMoves,
          ...finalResolutions,
          ...protocolImports,
        ].reduce((latest: string | null, row: any) => {
          for (const value of [row?.updated_at, row?.completed_at, row?.created_at]) {
            if (typeof value === 'string' && (!latest || Date.parse(value) > Date.parse(latest))) latest = value;
          }
          return latest;
        }, null),
        tournament_id: tournamentId,
        games_count: games.length,
        protocols_count: protocols.length,
        completed_protocols_count: protocols.filter((p: any) => p.status === 'completed').length,
        player_results_count: playerResults.length,
      },
      tournament,
      tournament_participants: participants,
      players,
      tournament_games: games,
      tournament_game_seats: seats,
      tournament_game_protocols: protocols,
      tournament_game_player_results: playerResults,
      tournament_game_best_moves: bestMoves,
      tournament_final_resolutions: finalResolutions,
      tournament_protocol_imports: protocolImports,
    };

    const checksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const backupData = { ...payload, checksum };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tournament_${tournamentId}_backup_${Date.now()}.json"`);
    res.json(backupData);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка генерации резервной копии' });
  }
});

// POST /api/tournaments/:tournamentId/backup/validate
router.post('/:tournamentId/backup/validate', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;
  const backupData = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const validation = validateTournamentBackupData(backupData, tournamentId);
    if (!validation.valid) {
      return res.status(400).json({ valid: false, error: validation.error });
    }

    // Get current server stats
    const games = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    const gameIds = games.map((g: any) => g.id);
    let serverCompletedProtocols = 0;
    let serverPlayerResultsCount = 0;

    if (gameIds.length > 0) {
      const gPlaceholders = gameIds.map(() => '?').join(',');
      const prRes = await db.get<any>(
        `SELECT COUNT(*) as c FROM tournament_game_protocols WHERE game_id IN (${gPlaceholders}) AND status = 'completed'`,
        gameIds
      );
      serverCompletedProtocols = prRes?.c || 0;

      const resRes = await db.get<any>(
        `SELECT COUNT(*) as c FROM tournament_game_player_results WHERE game_id IN (${gPlaceholders})`,
        gameIds
      );
      serverPlayerResultsCount = resRes?.c || 0;
    }

    const backupCompletedProtocols = (backupData.tournament_game_protocols || []).filter(
      (p: any) => p.status === 'completed'
    ).length;

    res.json({
      valid: true,
      comparison: {
        server: {
          games_count: games.length,
          completed_protocols_count: serverCompletedProtocols,
          player_results_count: serverPlayerResultsCount,
        },
        backup: {
          created_at: backupData.metadata?.created_at,
          games_count: (backupData.tournament_games || []).length,
          completed_protocols_count: backupCompletedProtocols,
          player_results_count: (backupData.tournament_game_player_results || []).length,
          players_count: (backupData.players || []).length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message || 'Ошибка проверки резервной копии' });
  }
});

// POST /api/tournaments/:tournamentId/backup/restore
router.post('/:tournamentId/backup/restore', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId } = req.params;
  const backupData = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    const validation = validateTournamentBackupData(backupData, tournamentId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Create online safety backup of current runtime database to os.tmpdir() first
    const safetyDir = path.join(os.tmpdir(), 'newmafia-safety-backups');
    if (!fs.existsSync(safetyDir)) {
      fs.mkdirSync(safetyDir, { recursive: true });
    }
    const safetyBackupPath = path.join(safetyDir, `safety_${Date.now()}_${tournamentId}.sqlite`);
    await db.sqlite.backup(safetyBackupPath);

    // Single transaction restore
    await db.transaction(async (tx) => {
      // 1. Upsert players safely by ID
      for (const p of backupData.players || []) {
        await insertRowSafe(tx, 'players', p, { mode: 'upsert', upsertKey: 'id' });
      }

      // 2. Update existing tournament metadata (do not delete or recreate tournament row)
      if (backupData.tournament) {
        await insertRowSafe(tx, 'tournaments', backupData.tournament, { mode: 'update', upsertKey: 'id' });
      }

      // 3. Clear child rows for this tournament only
      const existingGames = await tx.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
      if (existingGames.length > 0) {
        const gIds = existingGames.map((g: any) => g.id);
        const gPlaceholders = gIds.map(() => '?').join(',');
        await tx.run(`DELETE FROM tournament_game_seats WHERE game_id IN (${gPlaceholders})`, gIds);
        await tx.run(`DELETE FROM tournament_game_protocols WHERE game_id IN (${gPlaceholders})`, gIds);
        await tx.run(`DELETE FROM tournament_game_player_results WHERE game_id IN (${gPlaceholders})`, gIds);
        await tx.run(`DELETE FROM tournament_game_best_moves WHERE game_id IN (${gPlaceholders})`, gIds);
      }

      await tx.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
      await tx.run('DELETE FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);
      await tx.run('DELETE FROM tournament_final_resolutions WHERE tournament_id = ?', [tournamentId]);
      if (Array.isArray(backupData.tournament_protocol_imports)) {
        await tx.run('DELETE FROM tournament_protocol_imports WHERE tournament_id = ?', [tournamentId]);
      }

      // 4. Insert restored tournament participants
      for (const tp of backupData.tournament_participants || []) {
        await insertRowSafe(tx, 'tournament_participants', tp, { mode: 'insert' });
      }

      // 5. Insert restored games
      for (const g of backupData.tournament_games || []) {
        await insertRowSafe(tx, 'tournament_games', g, { mode: 'insert' });
      }

      // 6. Insert seats
      for (const s of backupData.tournament_game_seats || []) {
        await insertRowSafe(tx, 'tournament_game_seats', s, { mode: 'insert' });
      }

      // 7. Insert protocols
      for (const pr of backupData.tournament_game_protocols || []) {
        await insertRowSafe(tx, 'tournament_game_protocols', pr, { mode: 'insert' });
      }

      // 8. Insert player results
      for (const r of backupData.tournament_game_player_results || []) {
        await insertRowSafe(tx, 'tournament_game_player_results', r, { mode: 'insert' });
      }

      // 9. Insert best moves
      for (const bm of backupData.tournament_game_best_moves || []) {
        await insertRowSafe(tx, 'tournament_game_best_moves', bm, { mode: 'insert' });
      }

      // 10. Insert final resolutions
      for (const fr of backupData.tournament_final_resolutions || []) {
        await insertRowSafe(tx, 'tournament_final_resolutions', fr, { mode: 'insert' });
      }

      // 11. Insert protocol imports if present in backup
      for (const pi of backupData.tournament_protocol_imports || []) {
        await insertRowSafe(tx, 'tournament_protocol_imports', pi, { mode: 'insert' });
      }

      // Verify the destructive restore before COMMIT so any mismatch rolls back
      // automatically to the untouched tournament state.
      const restoredGamesCount = (await tx.get<any>(
        'SELECT COUNT(*) as c FROM tournament_games WHERE tournament_id = ?',
        [tournamentId]
      ))?.c || 0;
      const restoredProtocolsCount = (await tx.get<any>(
        `SELECT COUNT(*) as c FROM tournament_game_protocols p
         JOIN tournament_games g ON g.id = p.game_id
         WHERE g.tournament_id = ?`,
        [tournamentId]
      ))?.c || 0;
      const restoredResultsCount = (await tx.get<any>(
        `SELECT COUNT(*) as c FROM tournament_game_player_results r
         JOIN tournament_games g ON g.id = r.game_id
         WHERE g.tournament_id = ?`,
        [tournamentId]
      ))?.c || 0;

      const expectedGames = (backupData.tournament_games || []).length;
      const expectedProtocols = (backupData.tournament_game_protocols || []).length;
      const expectedResults = (backupData.tournament_game_player_results || []).length;
      if (
        restoredGamesCount !== expectedGames ||
        restoredProtocolsCount !== expectedProtocols ||
        restoredResultsCount !== expectedResults
      ) {
        throw new Error(
          `Restore verification failed before commit: expected ${expectedGames}/${expectedProtocols}/${expectedResults}, ` +
          `got ${restoredGamesCount}/${restoredProtocolsCount}/${restoredResultsCount}`
        );
      }

      // Foreign key & Integrity check before committing transaction
      const fkCheck = tx.sqlite.pragma('foreign_key_check', { simple: false }) as any[];
      if (Array.isArray(fkCheck) && fkCheck.length > 0) {
        throw new Error(`Foreign key constraint check failed: ${JSON.stringify(fkCheck)}`);
      }

      const integrityCheck = tx.sqlite.pragma('integrity_check', { simple: false }) as any[];
      if (!Array.isArray(integrityCheck) || integrityCheck[0]?.integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${JSON.stringify(integrityCheck)}`);
      }
    });

    // Verification after transaction
    const integrityCheckResult = db.sqlite.pragma('integrity_check', { simple: false }) as any[];
    const playersCount = (await db.get<any>('SELECT COUNT(*) as c FROM players'))?.c || 0;
    const tournamentsCount = (await db.get<any>('SELECT COUNT(*) as c FROM tournaments'))?.c || 0;
    const gamesCount = (await db.get<any>('SELECT COUNT(*) as c FROM tournament_games WHERE tournament_id = ?', [tournamentId]))?.c || 0;
    const completedProtocolsCount = (await db.get<any>(
      `SELECT COUNT(*) as c FROM tournament_game_protocols pr JOIN tournament_games g ON pr.game_id = g.id WHERE g.tournament_id = ? AND pr.status = 'completed'`,
      [tournamentId]
    ))?.c || 0;
    const playerResultsCount = (await db.get<any>(
      `SELECT COUNT(*) as c FROM tournament_game_player_results r JOIN tournament_games g ON r.game_id = g.id WHERE g.tournament_id = ?`,
      [tournamentId]
    ))?.c || 0;

    const expectedGamesCount = (backupData.tournament_games || []).length;
    const expectedCompletedProtocolsCount = (backupData.tournament_game_protocols || []).filter((p: any) => p.status === 'completed').length;

    const expectedPlayerResultsCount = (backupData.tournament_game_player_results || []).length;
    if (
      gamesCount !== expectedGamesCount ||
      completedProtocolsCount !== expectedCompletedProtocolsCount ||
      playerResultsCount !== expectedPlayerResultsCount
    ) {
      throw new Error(
        `Restored counts mismatch: expected ${expectedGamesCount} games / ${expectedCompletedProtocolsCount} completed protocols / ${expectedPlayerResultsCount} results, ` +
        `got ${gamesCount} games / ${completedProtocolsCount} completed protocols / ${playerResultsCount} results`
      );
    }

    // Trigger recovery checkpoint in os.tmpdir()
    const checkpointResult = await createPreviewCheckpoint(db);

    res.json({
      success: true,
      message: 'Турнир успешно восстановлен из резервной копии.',
      checkpoint_warning: checkpointResult.success ? undefined : checkpointResult.message,
      integrity: integrityCheckResult[0]?.integrity_check || 'ok',
      counts: {
        players: playersCount,
        tournaments: tournamentsCount,
        games: gamesCount,
        completed_protocols: completedProtocolsCount,
        player_results: playerResultsCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка восстановления турнира из резервной копии' });
  }
});

export default router;
