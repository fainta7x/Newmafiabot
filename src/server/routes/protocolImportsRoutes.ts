import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { defaultRecognitionAdapter } from '../services/recognition/adapter.ts';
import { DetectedGame } from '../services/recognition/types.ts';

const router = Router();

// Memory storage for multer so we can inspect and write file securely
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

const uploadsDir = path.join(process.cwd(), 'uploads', 'protocol_imports');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 1. POST /api/tournaments/:id/protocol-imports - Upload and trigger recognition
router.post('/:id/protocol-imports', requireOrganizerAuth, (req: AuthenticatedRequest, res: Response) => {
  upload.single('image')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Размер файла превышает максимально допустимые 15 МБ' });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'Поддерживаются только форматы JPG, PNG и WEBP' });
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Файл фотографии не выбран' });
    }

    const db = req.db as DatabaseWrapper;
    const tournamentId = req.params.id;

    try {
      const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
      if (!tournament) {
        return res.status(404).json({ error: 'Турнир не найден' });
      }

      const importId = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const storedFileName = `${importId}${ext}`;
      const filePath = path.join(uploadsDir, storedFileName);

      fs.writeFileSync(filePath, file.buffer);

      const now = new Date().toISOString();
      const uploadedBy = (req as any).user?.username || (req as any).user?.id || 'organizer';

      await db.run(
        `INSERT INTO tournament_protocol_imports (id, tournament_id, uploaded_by, original_filename, mime_type, storage_path, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
        [importId, tournamentId, uploadedBy, file.originalname, file.mimetype, filePath, now, now]
      );

      // Perform server-side recognition
      try {
        const recognitionResult = await defaultRecognitionAdapter.recognizeScoresheet(file.buffer, file.mimetype);

        const updatedNow = new Date().toISOString();
        await db.run(
          `UPDATE tournament_protocol_imports
           SET status = 'review', recognition_json = ?, updated_at = ?
           WHERE id = ?`,
          [JSON.stringify(recognitionResult), updatedNow, importId]
        );

        return res.json({
          success: true,
          import_id: importId,
          status: 'review',
          recognition_json: recognitionResult,
          detected_games: recognitionResult.detected_games,
          image_url: `/api/tournaments/${tournamentId}/protocol-imports/${importId}/image`,
        });
      } catch (recErr: any) {
        const updatedNow = new Date().toISOString();
        let userMessage = recErr.message || 'Ошибка распознавания';

        if (recErr.message === 'GEMINI_KEY_MISSING' || userMessage.includes('GEMINI_KEY_MISSING')) {
          userMessage = 'Распознавание фотографий ещё не настроено. Можно сохранить изображение и заполнить протокол вручную.';
        }

        await db.run(
          `UPDATE tournament_protocol_imports
           SET status = 'failed', error_message = ?, updated_at = ?
           WHERE id = ?`,
          [userMessage, updatedNow, importId]
        );

        return res.status(400).json({
          error: userMessage,
          import_id: importId,
          status: 'failed',
          image_url: `/api/tournaments/${tournamentId}/protocol-imports/${importId}/image`,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Ошибка создания записи импорта' });
    }
  });
});

// 2. GET /api/tournaments/:id/protocol-imports - List imports for tournament
router.get('/:id/protocol-imports', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = req.params.id;

  try {
    const list = await db.all<any>(
      'SELECT * FROM tournament_protocol_imports WHERE tournament_id = ? ORDER BY created_at DESC',
      [tournamentId]
    );

    const parsed = list.map((item) => ({
      ...item,
      recognition_json: item.recognition_json ? JSON.parse(item.recognition_json) : null,
      image_url: `/api/tournaments/${tournamentId}/protocol-imports/${item.id}/image`,
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения списка импортов' });
  }
});

// 3. GET /api/tournaments/:id/protocol-imports/:importId - Single import details
router.get('/:id/protocol-imports/:importId', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { id: tournamentId, importId } = req.params;

  try {
    const item = await db.get<any>(
      'SELECT * FROM tournament_protocol_imports WHERE id = ? AND tournament_id = ?',
      [importId, tournamentId]
    );

    if (!item) {
      return res.status(404).json({ error: 'Импорт не найден' });
    }

    res.json({
      ...item,
      recognition_json: item.recognition_json ? JSON.parse(item.recognition_json) : null,
      image_url: `/api/tournaments/${tournamentId}/protocol-imports/${item.id}/image`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения импорта' });
  }
});

// 4. GET /api/tournaments/:id/protocol-imports/:importId/image - Authenticated image viewer
router.get('/:id/protocol-imports/:importId/image', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { id: tournamentId, importId } = req.params;

  try {
    const item = await db.get<any>(
      'SELECT * FROM tournament_protocol_imports WHERE id = ? AND tournament_id = ?',
      [importId, tournamentId]
    );

    if (!item) {
      return res.status(404).json({ error: 'Изображение не найдено' });
    }

    if (!fs.existsSync(item.storage_path)) {
      return res.status(404).json({ error: 'Файл изображения отсутствует на сервере' });
    }

    res.setHeader('Content-Type', item.mime_type || 'image/jpeg');
    fs.createReadStream(item.storage_path).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка загрузки изображения' });
  }
});

// Helper validation for applying draft data
function validateDraftData(draftData: DetectedGame): string[] {
  const errors: string[] = [];

  // Players / seats check
  if (!Array.isArray(draftData.players) || draftData.players.length !== 10) {
    errors.push('Бланк должен содержать данные ровно для 10 мест (1-10)');
  } else {
    for (const p of draftData.players) {
      if (p.seat_number < 1 || p.seat_number > 10) {
        errors.push(`Недопустимый номер места: ${p.seat_number}`);
      }
      if (p.role?.value && !['citizen', 'sheriff', 'mafia', 'don'].includes(p.role.value)) {
        errors.push(`Неизвестная роль на месте ${p.seat_number}: ${p.role.value}`);
      }
      if (typeof p.regular_fouls?.value === 'number' && (p.regular_fouls.value < 0 || p.regular_fouls.value > 4)) {
        errors.push(`Недопустимое количество фолов (${p.regular_fouls.value}) на месте ${p.seat_number}`);
      }
    }
  }

  // Best move check
  if (draftData.best_move && Array.isArray(draftData.best_move.seat_numbers)) {
    const seats = draftData.best_move.seat_numbers;
    const uniqueSeats = new Set(seats);
    if (uniqueSeats.size !== seats.length) {
      errors.push('Номера мест в Лучшем Ходе не должны повторяться');
    }
    for (const s of seats) {
      if (s < 1 || s > 10) {
        errors.push(`Недопустимый номер места в ЛХ: ${s}`);
      }
    }
  }

  // Votes check
  if (Array.isArray(draftData.votes)) {
    for (const v of draftData.votes) {
      if (Array.isArray(v.entries)) {
        for (const e of v.entries) {
          if (e.candidate_seat < 1 || e.candidate_seat > 10) {
            errors.push(`Голосование ссылается на недопустимое место: ${e.candidate_seat}`);
          }
        }
      }
    }
  }

  return errors;
}

// 5. POST /api/tournaments/:id/protocol-imports/:importId/apply - Apply draft(s) to tournament game(s)
router.post('/:id/protocol-imports/:importId/apply', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { id: tournamentId, importId } = req.params;
  const { game_mappings } = req.body;

  if (!Array.isArray(game_mappings) || game_mappings.length === 0) {
    return res.status(400).json({ error: 'Не переданы данные привязки игр' });
  }

  try {
    const importRecord = await db.get<any>(
      'SELECT * FROM tournament_protocol_imports WHERE id = ? AND tournament_id = ?',
      [importId, tournamentId]
    );

    if (!importRecord) {
      return res.status(404).json({ error: 'Запись импорта не найдена' });
    }

    const updatedGames: any[] = [];
    const errors: string[] = [];

    for (const mapping of game_mappings) {
      if (mapping.action === 'skip' || !mapping.target_game_id) {
        continue;
      }

      const targetGameId = mapping.target_game_id;
      const draftData: DetectedGame = mapping.draft_data;

      // Check target game belongs to tournament
      const targetGame = await db.get<any>(
        'SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?',
        [targetGameId, tournamentId]
      );

      if (!targetGame) {
        errors.push(`Игра ${targetGameId} не принадлежит турниру ${tournamentId}`);
        continue;
      }

      // Validate draft content
      const validationErrors = validateDraftData(draftData);
      if (validationErrors.length > 0) {
        errors.push(`Игра №${targetGame.game_number}: ${validationErrors.join(', ')}`);
        continue;
      }

      // Apply to game draft
      const winnerTeamVal = draftData.winner_team?.value || targetGame.winner_team || null;
      const judgeNameVal = draftData.judge_name?.value || targetGame.judge_name || null;
      const draftJson = JSON.stringify(draftData);

      await db.run(
        `UPDATE tournament_games
         SET draft_protocol_json = ?, protocol_import_id = ?, winner_team = ?, judge_name = ?
         WHERE id = ?`,
        [draftJson, importId, winnerTeamVal, judgeNameVal, targetGameId]
      );

      // Apply roles to seats if provided
      if (Array.isArray(draftData.players)) {
        for (const p of draftData.players) {
          if (p.role?.value) {
            await db.run(
              'UPDATE tournament_game_seats SET role = ? WHERE game_id = ? AND seat_number = ?',
              [p.role.value, targetGameId, p.seat_number]
            );
          }
        }
      }

      const updated = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [targetGameId]);
      updatedGames.push(updated);
    }

    if (updatedGames.length > 0) {
      const now = new Date().toISOString();
      await db.run(
        "UPDATE tournament_protocol_imports SET status = 'applied', updated_at = ? WHERE id = ?",
        [now, importId]
      );
    }

    res.json({
      success: updatedGames.length > 0,
      applied_count: updatedGames.length,
      updated_games: updatedGames,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка применения черновика игры' });
  }
});

// 6. GET /api/tournaments/:id/games/:gameId/protocol-draft - Get draft & stored details
router.get('/:id/games/:gameId/protocol-draft', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;

  try {
    const game = await db.get<any>(
      'SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?',
      [gameId, tournamentId]
    );

    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const seats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const draftProtocol = game.draft_protocol_json ? JSON.parse(game.draft_protocol_json) : null;

    res.json({
      game: { ...game, seats },
      draft_protocol: draftProtocol,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения черновика игры' });
  }
});

export default router;
