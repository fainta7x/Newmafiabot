import { Router, type Response } from 'express';
import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import baseRouter from './tournamentsRoutesBase.ts';
export { internalGetStandings, internalGetNominations, validateTournamentBackupData } from './tournamentsRoutesBase.ts';
import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import {
  computeFlexibleCompleteReadiness,
  computeFlexibleStartReadiness,
  normalizeTournamentGameCount,
  regenerateTournamentGames,
} from '../services/tournamentDistanceService.ts';

const router = Router();

const parseRequestedGameCount = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return 10;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

const loadTournamentGames = async (db: DatabaseWrapper, tournamentId: string) => {
  const gamesList = await db.all<any>(
    'SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC',
    [tournamentId],
  );
  const games: any[] = [];
  for (const game of gamesList) {
    const seats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname AS original_nickname,
             (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        LEFT JOIN players p ON p.id = tp.player_id
       WHERE tgs.game_id = ?
       ORDER BY tgs.seat_number ASC
    `, [game.id]);
    const protocol = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    games.push({ ...game, seats, protocol_status: protocol?.status || null });
  }
  return games;
};

// Flexible tournament creation shadows the legacy fixed-10-games route.
// A mafia table still has exactly 10 participants; only the tournament distance is variable.
router.post('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { title, date, venue, stage, chief_judge_name, notes, participants } = req.body || {};
  const gameCount = parseRequestedGameCount(req.body?.game_count);
  if (!title || !date) return res.status(400).json({ error: 'Название и дата обязательны' });
  if (!gameCount) return res.status(400).json({ error: 'Количество игр должно быть положительным целым числом' });

  const parts = Array.isArray(participants) ? participants : [];
  const playerIds = parts.map((part: any) => typeof part === 'string' ? part : part?.player_id).filter(Boolean);
  if (new Set(playerIds).size !== parts.length) {
    return res.status(400).json({ error: 'Участники не могут повторяться. Все игроки должны быть уникальными.' });
  }
  for (const playerId of playerIds) {
    if (!await db.get<any>('SELECT id FROM players WHERE id = ?', [playerId])) {
      return res.status(400).json({ error: `Игрок с ID ${playerId} не найден в CRM` });
    }
  }

  try {
    const result = await db.transaction(async (tx: DatabaseWrapper) => {
      const tournamentId = crypto.randomUUID();
      const now = new Date().toISOString();
      await tx.run(
        `INSERT INTO tournaments (id, title, date, venue, stage, status, chief_judge_name, notes, game_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [
          tournamentId,
          String(title),
          new Date(date).toISOString(),
          venue || null,
          stage || null,
          chief_judge_name || null,
          notes || null,
          gameCount,
          now,
          now,
        ],
      );

      const participantRecords: any[] = [];
      for (let index = 0; index < parts.length; index += 1) {
        const raw = parts[index];
        const playerId = typeof raw === 'string' ? raw : raw.player_id;
        const player = await tx.get<any>('SELECT nickname FROM players WHERE id = ?', [playerId]);
        const customName = typeof raw === 'object' && raw?.display_name ? String(raw.display_name).trim() : '';
        const participantId = crypto.randomUUID();
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [participantId, tournamentId, playerId, customName || player?.nickname || `Игрок ${index + 1}`, index + 1],
        );
        participantRecords.push({ id: participantId, player_id: playerId });
      }

      if (participantRecords.length === 10) {
        await regenerateTournamentGames(tx as DatabaseWrapper, tournamentId, chief_judge_name || null, participantRecords, gameCount);
      }

      const tournament = await tx.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
      const savedParticipants = await tx.all<any>(
        'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC',
        [tournamentId],
      );
      const games = await loadTournamentGames(tx as DatabaseWrapper, tournamentId);
      return { ...tournament, participants: savedParticipants, games };
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка создания турнира' });
  }
});

// Dynamic detail/readiness shadows the legacy fixed-distance readiness response.
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    const participants = await db.all<any>(`
      SELECT tp.*, p.nickname AS player_nickname, p.telegram_username, p.phone,
             (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
        FROM tournament_participants tp
        LEFT JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = ?
       ORDER BY tp.participant_number ASC
    `, [req.params.id]);
    const games = await loadTournamentGames(db, req.params.id);
    const gameCount = normalizeTournamentGameCount(tournament.game_count);
    const startReadiness = computeFlexibleStartReadiness(participants, games, gameCount);
    const completeReadiness = await computeFlexibleCompleteReadiness(db, req.params.id, gameCount);
    return res.json({
      ...tournament,
      game_count: gameCount,
      participants,
      games,
      start_readiness: startReadiness,
      complete_readiness: completeReadiness,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

router.put('/:id/participants', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = req.params.id;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'draft') return res.status(400).json({ error: 'Состав участников заблокирован после запуска турнира' });
    const parts = req.body?.participants;
    if (!Array.isArray(parts) || parts.length !== 10) {
      return res.status(400).json({ error: 'Турнир должен содержать ровно 10 участников' });
    }
    const playerIds = parts.map((part: any) => typeof part === 'string' ? part : part?.player_id);
    if (new Set(playerIds.filter(Boolean)).size !== 10) {
      return res.status(400).json({ error: 'Требуется ровно 10 уникальных игроков' });
    }
    for (const playerId of playerIds) {
      if (!await db.get<any>('SELECT id FROM players WHERE id = ?', [playerId])) {
        return res.status(400).json({ error: `Игрок с ID ${playerId} не найден в CRM` });
      }
    }

    const updatedParticipants = await db.transaction(async (tx: DatabaseWrapper) => {
      await tx.run('DELETE FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);
      const records: any[] = [];
      for (let index = 0; index < parts.length; index += 1) {
        const raw = parts[index];
        const playerId = typeof raw === 'string' ? raw : raw.player_id;
        const player = await tx.get<any>('SELECT nickname FROM players WHERE id = ?', [playerId]);
        const customName = typeof raw === 'object' && raw?.display_name ? String(raw.display_name).trim() : '';
        const participantId = crypto.randomUUID();
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [participantId, tournamentId, playerId, customName || player?.nickname || `Игрок ${index + 1}`, index + 1],
        );
        records.push({ id: participantId, player_id: playerId });
      }
      await regenerateTournamentGames(
        tx as DatabaseWrapper,
        tournamentId,
        tournament.chief_judge_name || null,
        records,
        normalizeTournamentGameCount(tournament.game_count),
      );
      return tx.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [tournamentId]);
    });
    return res.json({ success: true, participants: updatedParticipants });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка обновления участников' });
  }
});

router.post('/:id/generate-seating', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'draft') return res.status(400).json({ error: 'Рассадка заблокирована после запуска турнира' });
    const participants = await db.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [req.params.id]);
    if (participants.length !== 10) return res.status(400).json({ error: 'Для генерации рассадки требуется ровно 10 участников' });
    await regenerateTournamentGames(
      db,
      req.params.id,
      tournament.chief_judge_name || null,
      participants,
      normalizeTournamentGameCount(tournament.game_count),
    );
    const games = await loadTournamentGames(db, req.params.id);
    return res.json({ success: true, game_count: normalizeTournamentGameCount(tournament.game_count), games });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка генерации рассадки' });
  }
});

router.post('/:id/start', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'draft') return res.status(400).json({ error: 'Турнир не может быть запущен из текущего статуса' });
    const participants = await db.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ?', [req.params.id]);
    const games = await loadTournamentGames(db, req.params.id);
    const readiness = computeFlexibleStartReadiness(participants, games, normalizeTournamentGameCount(tournament.game_count));
    if (!readiness.ready) {
      return res.status(400).json({ error: `Турнир не готов к запуску: ${readiness.errors.join('; ')}`, start_readiness: readiness });
    }
    const now = new Date().toISOString();
    await db.run("UPDATE tournaments SET status = 'active', updated_at = ? WHERE id = ?", [now, req.params.id]);
    return res.json({ success: true, tournament: await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка запуска турнира' });
  }
});

router.post('/:id/complete', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status === 'completed') return res.status(400).json({ error: 'Турнир уже завершён' });
    if (tournament.status !== 'active' && tournament.status !== 'correction') {
      return res.status(400).json({ error: 'Завершить можно только активный турнир или турнир в режиме корректировки' });
    }
    const readiness = await computeFlexibleCompleteReadiness(
      db,
      req.params.id,
      normalizeTournamentGameCount(tournament.game_count),
    );
    if (!readiness.isReady) {
      return res.status(400).json({ error: 'Турнир не готов к завершению', reasons: readiness.errors, complete_readiness: readiness });
    }
    const now = new Date().toISOString();
    await db.run("UPDATE tournaments SET status = 'completed', updated_at = ? WHERE id = ?", [now, req.params.id]);
    await rebuildCanonicalEloRatings(db);
    return res.json({ success: true, tournament_id: req.params.id, status: 'completed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка завершения турнира' });
  }
});

const checkJudgeEditingPermission = async (db: DatabaseWrapper, tournament: any, game: any) => {
  if (tournament.status === 'completed') {
    return { allowed: false, error: 'Турнир завершён. Сначала верните его на корректировку' };
  }

  if (tournament.status === 'correction' && game.status === 'completed') {
    return { allowed: true };
  }

  if (game.status === 'planned') {
    if (tournament.status === 'draft' || tournament.status === 'active') return { allowed: true };
    if (tournament.status === 'correction') return { allowed: false, error: 'В режиме корректировки нельзя изменять запланированные игры' };
    return { allowed: false, error: 'Изменение судьи запрещено в текущем статусе турнира' };
  }

  if (tournament.status === 'correction' && game.status === 'active') {
    const protocol = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    if (!protocol || protocol.status !== 'draft') return { allowed: false, error: 'Сначала необходимо вернуть протокол игры в черновик' };
    const otherActive = await db.get<any>(
      "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'active' AND id != ?",
      [tournament.id, game.id],
    );
    if (otherActive) return { allowed: false, error: 'В турнире уже есть другая активная игра' };
    return { allowed: true };
  }

  return { allowed: false, error: 'Изменение судьи запрещено после запуска игры' };
};

router.patch('/:id/games/:gameId/judge', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });

    const permission = await checkJudgeEditingPermission(db, tournament, game);
    if (!permission.allowed) return res.status(400).json({ error: permission.error || 'Изменение судьи запрещено' });

    const judge = await resolveJudgeAssignment(db, {
      judge_player_id: req.body?.judge_player_id ?? null,
      judge_name: req.body?.judge_name ?? null,
    });
    await db.run(
      'UPDATE tournament_games SET judge_name = ?, judge_player_id = ? WHERE id = ? AND tournament_id = ?',
      [judge.judge_name, judge.judge_player_id, gameId, tournamentId],
    );

    if (game.status === 'completed' && judge.judge_player_id) {
      await evaluateAchievementsForPlayers(db, [judge.judge_player_id]);
    }

    const updated = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    return res.json(updated);
  } catch (err: any) {
    if (err instanceof JudgeAssignmentError) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: err.message || 'Ошибка обновления судьи' });
  }
});

router.use((req: AuthenticatedRequest, res: Response, next) => {
  const isRatingTransition = req.method === 'POST' && (
    /^\/[^/]+\/games\/[^/]+\/protocol\/complete\/?$/.test(req.path) ||
    /^\/[^/]+\/games\/[^/]+\/protocol\/revert-to-draft\/?$/.test(req.path)
  );
  if (!isRatingTransition) return next();

  const originalJson = res.json.bind(res);
  let intercepted = false;
  res.json = ((body: any) => {
    if (intercepted || res.statusCode >= 400) return originalJson(body);
    intercepted = true;
    const db = req.db as DatabaseWrapper;
    void (async () => {
      try {
        await rebuildCanonicalEloRatings(db);
        if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_PATH) {
          await createPreviewCheckpoint(db);
        }
        originalJson(body);
      } catch (error) {
        console.error('Canonical Elo rebuild failed:', error);
        if (!res.headersSent) res.status(500);
        originalJson({ error: 'Не удалось пересчитать рейтинг Elo' });
      }
    })();
    return res;
  }) as typeof res.json;

  return next();
});

router.use(baseRouter);
export default router;
