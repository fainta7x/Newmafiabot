import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { evaluateAchievementsForPlayers, reconcileEvaluatorAchievements } from '../services/playerAchievementsService.ts';
import { normalizeTournamentGameCount } from '../services/tournamentDistanceService.ts';
import { Router, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import { internalGetNominations } from '../services/tournamentStandingsService.ts';
import { normalizeRole } from '../utils/ciHelper.ts';
import {
  normalizeRoleValue,
  calculateRoleCounts,
  validateRoleCountsTransition,
  SeatRoleInput
} from '../../lib/tournamentRoleValidation.ts';

const router = Router();

// POST /api/tournaments/checkpoint
router.post('/checkpoint', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint is not available in production' });
  }

  const db = req.db as DatabaseWrapper;
  const result = await createPreviewCheckpoint(db);

  if (result.success) {
    res.json({ message: result.message });
  } else {
    res.status(500).json({ error: result.message });
  }
});

// 1. GET /api/tournaments - Get list of tournaments
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    // Registration-flow tournaments also report their FIFO reserve for the list card.
    const hasRegistrations = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'tournament_registrations'");
    const reserveSelect = hasRegistrations
      ? "(SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.tournament_id = t.id AND tr.status = 'reserve') as reserve_count,"
      : '0 as reserve_count,';
    const tournamentsList = await db.all<any>(`
      SELECT t.*, ${reserveSelect}
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

// 4. PATCH /api/tournaments/:id - Edit draft metadata (status is NOT modified)
router.patch('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
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

// 5b. PATCH /api/tournaments/:id/participants/:participantId/correct-player - Correct CRM profile for tournament participant
router.patch('/:id/participants/:participantId/correct-player', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const participantId = String(req.params.participantId);
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
      return res.status(400).json({ error: 'Игрок не найден в клубе' });
    }

    const duplicateCheck = await db.get<any>(
      'SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ? AND id != ?',
      [tournamentId, player_id, participantId]
    );
    if (duplicateCheck) {
      return res.status(400).json({ error: 'Этот игрок уже участвует в турнире' });
    }

    const displayName = newPlayer.nickname || newPlayer.first_name || participant.display_name;

    // Played games stay with the participant slot, so the rating must be recounted. The identity change and the
    // rating rebuild succeed or roll back together; achievements are recounted for both players afterwards.
    const playedGame = await db.get<any>("SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'completed' LIMIT 1", [tournamentId]);
    const playerChanged = String(participant.player_id) !== String(player_id);
    await db.transaction(async (tx: DatabaseWrapper) => {
      await tx.run(
        'UPDATE tournament_participants SET player_id = ?, display_name = ? WHERE id = ?',
        [player_id, displayName, participantId]
      );
      if (playedGame && playerChanged) await rebuildCanonicalEloRatings(tx);
    });
    if (playedGame && playerChanged) {
      for (const affected of [String(participant.player_id), String(player_id)]) {
        await reconcileEvaluatorAchievements(db, affected);
      }
      await evaluateAchievementsForPlayers(db, [String(participant.player_id), String(player_id)]);
    }

    const updatedParticipant = await db.get<any>('SELECT * FROM tournament_participants WHERE id = ?', [participantId]);
    res.json({ success: true, participant: updatedParticipant });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка исправления профиля участника' });
  }
});

// 7. POST /api/tournaments/:id/games/:gameId/swap-seats - Swap two seats in a game
router.post('/:id/games/:gameId/swap-seats', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const gameId = String(req.params.gameId);
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
  game: any,
  purpose: 'roles' | 'other' = 'other'
): Promise<{ allowed: boolean; error?: string }> {
  if (tournament.status === 'completed') {
    return { allowed: false, error: 'Турнир завершён. Изменение параметров игры запрещено' };
  }

  if (game.status === 'completed') {
    return { allowed: false, error: 'Сначала откройте протокол игры для правки' };
  }

  // A wrong role after the deal (owner, 2026-10-03): the roles of a game that is already running can be
  // corrected until its protocol is completed (the judge and the seating stay locked).
  if (purpose === 'roles' && game.status === 'active' && tournament.status === 'active') {
    const protocol = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    if (protocol?.status === 'completed') {
      return { allowed: false, error: 'Протокол игры завершён. Сначала откройте его для правки' };
    }
    return { allowed: true };
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
        return { allowed: false, error: 'Сначала откройте протокол игры для правки' };
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const gameId = String(req.params.gameId);
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

    const check = await checkGameEditingPermission(db, tournament, game, 'roles');
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

// 11. POST /api/tournaments/:id/games/:gameId/start - Launch specific game
router.post('/:id/games/:gameId/start', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const gameId = String(req.params.gameId);
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

// POST /api/tournaments/:id/reopen-for-correction - Reopen completed tournament for correction
router.post('/:id/reopen-for-correction', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
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

// Legacy endpoint retained only as an explicit compatibility error.
// Nomination winners are deterministic and cannot be selected manually.
router.put('/:id/final-resolutions/nominations/:category', requireOrganizerAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({ error: 'Номинации определяются автоматически по итогам турнира.' });
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
    return { valid: false, error: 'Файл не подходит: это не резервная копия турнира' };
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
  const expectedGames = normalizeTournamentGameCount(payload.tournament?.game_count);
  if (!Array.isArray(games) || games.length !== expectedGames) {
    return { valid: false, error: `В копии должно быть ровно ${expectedGames} игр, найдено: ${games.length}` };
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
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
