import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createGameSchema } from '../validation.ts';

const router = Router();

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeGame = (row: any) => {
  const clubProtocol = safeJsonParse<any>(row.protocol_text, null);
  const isClubProtocol = Boolean(clubProtocol && clubProtocol.version === 1 && clubProtocol.kind === 'club_evening_protocol');
  return {
    ...row,
    slots: safeJsonParse(row.slots_json, []),
    table_name: row.table_name ?? null,
    club_protocol: isClubProtocol ? clubProtocol : null,
    status: isClubProtocol
      ? (clubProtocol.protocol?.status || 'draft')
      : row.winner_team === 'draft'
        ? 'draft'
        : 'completed',
  };
};

const validateEveningGameSeats = async (db: any, eveningId: string, seats: any[]) => {
  if (!Array.isArray(seats) || seats.length !== 10) {
    throw new Error('Для игры необходимо выбрать ровно 10 игроков');
  }

  const seatNumbers = seats.map((seat) => Number(seat.seat_number));
  const participantIds = seats.map((seat) => String(seat.participant_id || ''));

  if (new Set(seatNumbers).size !== 10 || seatNumbers.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > 10)) {
    throw new Error('Места должны быть уникальными числами от 1 до 10');
  }
  if (participantIds.some((id) => !id) || new Set(participantIds).size !== 10) {
    throw new Error('Один игрок не может занимать несколько мест');
  }

  const placeholders = participantIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT ep.id AS participant_id, ep.player_id, ep.evening_id, ep.table_id,
            p.nickname, p.full_name
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
      WHERE ep.id IN (${placeholders})`,
    participantIds
  );

  if (rows.length !== 10 || rows.some((row: any) => row.evening_id !== eveningId)) {
    throw new Error('Все выбранные игроки должны быть участниками этого вечера');
  }

  const byParticipant = new Map(rows.map((row: any) => [row.participant_id, row]));
  return seats
    .map((seat) => {
      const source: any = byParticipant.get(String(seat.participant_id));
      return {
        participant_id: String(seat.participant_id),
        player_id: source.player_id,
        seat_number: Number(seat.seat_number),
        display_name: source.nickname || source.full_name || `Игрок ${seat.seat_number}`,
        role: seat.role ?? null,
      };
    })
    .sort((a, b) => a.seat_number - b.seat_number);
};

const buildInitialClubProtocol = (gameId: number | null, seats: any[]) => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: {
    game_id: gameId == null ? '' : String(gameId),
    status: 'draft',
    winner_team: null,
    end_reason: 'normal',
    ppk_culprit_participant_id: null,
    first_killed_participant_id: null,
    zero_round_voted_participant_id: null,
    best_move_participant_id: null,
    best_move_source: null,
    best_move_seats: [],
    best_moves: [],
    votes: [],
    shots: [],
    replacement: null,
    judge_notes: null,
    best_move_score: 0,
  },
  player_results: seats.map((seat) => ({
    participant_id: seat.participant_id,
    player_id: seat.player_id,
    seat_number: seat.seat_number,
    display_name: seat.display_name,
    role: seat.role,
    exit_type: 'alive',
    exit_order: null,
    regular_fouls: 0,
    minor_technical_fouls: 0,
    major_technical_fouls: 0,
    technical_fouls: 0,
    judge_bonus: 0,
    protocol_bonus: 0,
    penalty_points: 0,
    disciplinary_penalty_points: 0,
    removal_reason: null,
    ci_points: 0,
    color_protocol: [],
    notes: null,
  })),
});

const clubSlotsFromResults = (playerResults: any[]) => (playerResults || [])
  .slice()
  .sort((a: any, b: any) => Number(a.seat_number) - Number(b.seat_number))
  .map((result: any) => ({
    slot_num: Number(result.seat_number),
    participant_id: result.participant_id,
    player_id: result.player_id,
    nickname: result.display_name,
    role: result.role,
    team: result.role === 'mafia' || result.role === 'don' || result.role === 'Мафия' || result.role === 'Дон'
      ? 'Чёрные'
      : result.role
        ? 'Красные'
        : null,
    exit_reason: result.exit_type || 'alive',
    fouls: result.regular_fouls || 0,
    minor_technical_fouls: result.minor_technical_fouls || 0,
    major_technical_fouls: result.major_technical_fouls || 0,
  }));

// GET /api/games - list games; evening games include structured club_protocol when available.
router.get('/', async (req, res) => {
  try {
    const { evening_id, archived } = req.query;
    const db = (req as any).db || (await getDb());

    let query = `SELECT g.*, et.name AS table_name
                   FROM games g
              LEFT JOIN evening_tables et ON et.id = g.evening_table_id
                  WHERE 1=1`;
    const params: any[] = [];

    if (evening_id) {
      query += ' AND g.evening_id = ?';
      params.push(evening_id);
    }

    if (archived === '1' || archived === 'true') query += ' AND g.archived_at IS NOT NULL';
    else query += ' AND g.archived_at IS NULL';

    query += ' ORDER BY g.global_game_number DESC, g.id DESC';
    const games = await db.all(query, params);
    res.json(games.map(normalizeGame));
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/games/evening/:eveningId - create a rating-free draft game for a club evening.
router.post('/evening/:eveningId', requireOrganizerAuth, async (req, res) => {
  try {
    const eveningId = String(req.params.eveningId);
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const tableId = req.body?.evening_table_id ? String(req.body.evening_table_id) : null;
    if (tableId) {
      const table = await db.get('SELECT * FROM evening_tables WHERE id = ? AND evening_id = ?', [tableId, eveningId]);
      if (!table) return res.status(400).json({ error: 'Выбранный стол не относится к этому вечеру' });
    }

    const seats = await validateEveningGameSeats(db, eveningId, req.body?.seats || []);
    const now = new Date().toISOString();
    const nextNumberRow = await db.get('SELECT COALESCE(MAX(global_game_number), 0) + 1 AS next_number FROM games');
    const globalGameNumber = Number(nextNumberRow?.next_number || 1);
    const initialProtocol = buildInitialClubProtocol(null, seats);

    const insert = await db.run(
      `INSERT INTO games (
        evening_id, evening_table_id, global_game_number, game_date,
        winner_team, winner_label, judge_name, protocol_text, slots_json, created_at
      ) VALUES (?, ?, ?, ?, 'draft', 'Черновик', ?, ?, ?, ?)`,
      [
        eveningId,
        tableId,
        globalGameNumber,
        evening.starts_at || now,
        req.body?.judge_name ? String(req.body.judge_name) : null,
        JSON.stringify(initialProtocol),
        JSON.stringify(clubSlotsFromResults(initialProtocol.player_results)),
        now,
      ]
    );

    const gameId = Number(insert.lastID);
    initialProtocol.protocol.game_id = String(gameId);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(initialProtocol), gameId]);

    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.status(201).json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось создать игру' });
  }
});

// PUT /api/games/:gameId/evening-protocol - save a club protocol without rating side effects.
router.put('/:gameId/evening-protocol', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });

    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Это не игра обычного вечера' });
    if (existing.archived_at) return res.status(409).json({ error: 'Игра находится в архиве. Сначала восстановите её.' });

    const incomingProtocol = req.body?.protocol;
    const incomingResults = req.body?.player_results;
    if (!incomingProtocol || !Array.isArray(incomingResults) || incomingResults.length !== 10) {
      return res.status(400).json({ error: 'Нужны protocol и 10 player_results' });
    }

    const previous = safeJsonParse<any>(existing.protocol_text, null);
    if (!previous || previous.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'У игры отсутствует структурированный клубный протокол' });
    }

    const status = incomingProtocol.status === 'completed' ? 'completed' : 'draft';
    const winner = incomingProtocol.winner_team === 'red'
      ? 'Красные'
      : incomingProtocol.winner_team === 'black'
        ? 'Чёрные'
        : null;

    if (status === 'completed' && !winner) {
      return res.status(400).json({ error: 'Для завершения игры укажите победившую команду' });
    }

    const nextProtocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        ...incomingProtocol,
        game_id: String(gameId),
        status,
        updated_at: new Date().toISOString(),
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      },
      player_results: incomingResults,
    };

    await db.run(
      `UPDATE games
          SET winner_team = ?, winner_label = ?, protocol_text = ?, slots_json = ?
        WHERE id = ?`,
      [
        winner || 'draft',
        winner ? `Победа ${winner}` : 'Черновик',
        JSON.stringify(nextProtocol),
        JSON.stringify(clubSlotsFromResults(incomingResults)),
        gameId,
      ]
    );

    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось сохранить протокол' });
  }
});


// POST /api/games/:gameId/archive - soft-delete any club evening game.
router.post('/:gameId/archive', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Архив доступен только для игр обычного вечера' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Архив доступен только для клубных игр вечера' });
    }
    if (!existing.archived_at) {
      await db.run('UPDATE games SET archived_at = ? WHERE id = ?', [new Date().toISOString(), gameId]);
    }
    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось перенести игру в архив' });
  }
});

// POST /api/games/:gameId/archive/restore - restore a soft-deleted club evening game.
router.post('/:gameId/archive/restore', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!existing.evening_id || !protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Это не клубная игра обычного вечера' });
    }
    await db.run('UPDATE games SET archived_at = NULL WHERE id = ?', [gameId]);
    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось восстановить игру' });
  }
});

// DELETE /api/games/:gameId/archive - permanent deletion is allowed only from archive.
router.delete('/:gameId/archive', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!existing.evening_id || !protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Это не клубная игра обычного вечера' });
    }
    if (!existing.archived_at) {
      return res.status(409).json({ error: 'Сначала перенесите игру в архив' });
    }
    await db.run('DELETE FROM games WHERE id = ?', [gameId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось окончательно удалить игру' });
  }
});

// DELETE /api/games/:gameId/evening-draft - legacy hard-delete for unfinished drafts.
router.delete('/:gameId/evening-draft', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Можно удалить только клубный черновик' });
    }
    if (protocol.protocol?.status === 'completed') {
      return res.status(409).json({ error: 'Завершённую игру удалить нельзя. Сначала верните её в черновик.' });
    }
    await db.run('DELETE FROM games WHERE id = ?', [gameId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось удалить игру' });
  }
});

// Legacy POST /api/games - preserved for compatibility with the old game workflow.
// IMPORTANT: EveningGamesView does not use this endpoint because it updates ELO/tokens.
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createGameSchema.parse(req.body);
    const db = (req as any).db || (await getDb());
    const now = new Date().toISOString();

    let createdGame: any = null;

    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run(
        `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.evening_id || null,
          data.global_game_number,
          data.game_date,
          data.winner_team,
          data.winner_label,
          data.judge_name,
          data.protocol_text || '',
          JSON.stringify(data.slots),
          now,
        ]
      );

      createdGame = await db.get(
        'SELECT * FROM games WHERE global_game_number = ? ORDER BY id DESC LIMIT 1',
        [data.global_game_number]
      );

      const isRedWin =
        data.winner_team.toLowerCase().includes('красн') ||
        data.winner_team.toLowerCase().includes('мирн') ||
        data.winner_team.toLowerCase().includes('red');

      for (const slot of data.slots) {
        let player = null;
        if (slot.player_id) player = await db.get('SELECT * FROM players WHERE id = ?', [slot.player_id]);
        if (!player && slot.nickname) player = await db.get('SELECT * FROM players WHERE nickname = ?', [slot.nickname]);

        if (!player && slot.nickname) {
          const playerId = crypto.randomUUID();
          await db.run(
            `INSERT INTO players (id, nickname, lifecycle_status, source, elo, tokens, created_at, updated_at)
             VALUES (?, ?, 'newcomer', 'game_protocol', 1000, 0, ?, ?)`,
            [playerId, slot.nickname, now, now]
          );
          player = await db.get('SELECT * FROM players WHERE id = ?', [playerId]);
        }

        if (player) {
          const isRedRole = slot.role === 'Мирный' || slot.role === 'Шериф';
          let eloDelta = 0;
          let tokensDelta = 0;

          if (isRedWin) {
            if (isRedRole) { eloDelta = 15; tokensDelta = 1; }
            else eloDelta = -10;
          } else {
            if (!isRedRole) { eloDelta = 20; tokensDelta = 2; }
            else eloDelta = -15;
          }

          await db.run(
            'UPDATE players SET elo = ?, tokens = ?, updated_at = ? WHERE id = ?',
            [Math.max(100, (player.elo || 1000) + eloDelta), (player.tokens || 0) + tokensDelta, now, player.id]
          );
        }
      }

      await db.exec('COMMIT');
    } catch (err: any) {
      try { await db.exec('ROLLBACK'); } catch {}
      throw err;
    }

    res.status(201).json({ ...createdGame, slots: safeJsonParse(createdGame?.slots_json, []) });
  } catch (err: any) {
    if (err.errors) {
      return res.status(400).json({ error: 'Ошибка валидации протокола игры', details: err.errors });
    }
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
