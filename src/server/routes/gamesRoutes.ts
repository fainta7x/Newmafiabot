import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import baseRouter from './gamesRoutesBase.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';
import { getEveningAttendanceFact } from '../../lib/eveningResponse.ts';
import { requiredJudgeLevelForEveningFormat } from '../../db/ensureJudgeAuthoritySchema.ts';
import { setParticipantAttendance } from '../services/eveningParticipantState.ts';
import { canonicalizeClubGameSave } from '../services/clubGameProtocolService.ts';
import { reconcileClubGameTokenSettlement } from '../services/clubGameTokenSettlementService.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';

const router = Router();

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
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
      : row.winner_team === 'draft' ? 'draft' : 'completed',
  };
};

const loadEveningGameSeatRows = async (db: any, eveningId: string, seats: any[]) => {
  if (!Array.isArray(seats) || seats.length !== 10) throw new Error('Для игры необходимо выбрать ровно 10 игроков');

  const seatNumbers = seats.map((seat) => Number(seat.seat_number));
  const ids = seats.map((seat) => String(seat.participant_id || ''));
  if (new Set(seatNumbers).size !== 10 || seatNumbers.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > 10)) {
    throw new Error('Места должны быть уникальными числами от 1 до 10');
  }
  if (ids.some((id) => !id) || new Set(ids).size !== 10) throw new Error('Один игрок не может занимать несколько мест');

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT ep.id AS participant_id, ep.player_id, ep.evening_id, ep.response_status, ep.registration_status,
            ep.attendance_status, ep.arrival_status, p.nickname, p.full_name
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
      WHERE ep.id IN (${placeholders})`,
    ids,
  );
  if (rows.length !== 10 || rows.some((row: any) => String(row.evening_id) !== eveningId)) {
    throw new Error('Все выбранные игроки должны быть участниками этого вечера');
  }
  return rows;
};

const validateEveningGameSeats = async (db: any, eveningId: string, seats: any[]) => {
  const rows = await loadEveningGameSeatRows(db, eveningId, seats);
  const absent = rows.filter((row: any) => !['attended_on_time', 'attended_late'].includes(getEveningAttendanceFact(row)));
  if (absent.length) {
    throw new Error(`В игру можно посадить только фактически пришедших игроков: ${absent.map((row: any) => row.nickname || row.full_name || row.participant_id).join(', ')}`);
  }

  const byId = new Map(rows.map((row: any) => [String(row.participant_id), row]));
  return seats
    .map((seat) => {
      const source: any = byId.get(String(seat.participant_id));
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

const markJudgeSelectedPlayersPresent = async (db: any, eveningId: string, seats: any[]) => {
  const rows = await loadEveningGameSeatRows(db, eveningId, seats);
  for (const row of rows) {
    if (['attended_on_time', 'attended_late'].includes(getEveningAttendanceFact(row))) continue;
    const fact = String(row.response_status || row.registration_status || '') === 'late'
      ? 'attended_late'
      : 'attended_on_time';
    await setParticipantAttendance(db, String(row.participant_id), fact);
  }
};

const buildInitialClubProtocol = (seats: any[]) => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: {
    game_id: '', status: 'draft', winner_team: null, end_reason: 'normal',
    ppk_culprit_participant_id: null, first_killed_participant_id: null,
    zero_round_voted_participant_id: null, best_move_participant_id: null,
    best_move_source: null, best_move_seats: [], best_moves: [], votes: [], shots: [],
    replacement: null, judge_notes: null, best_move_score: 0,
  },
  player_results: seats.map((seat) => ({
    participant_id: seat.participant_id, player_id: seat.player_id, seat_number: seat.seat_number,
    display_name: seat.display_name, role: seat.role, exit_type: 'alive', exit_order: null,
    regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0,
    judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, disciplinary_penalty_points: 0,
    removal_reason: null, ci_points: 0, color_protocol: [], notes: null,
  })),
});

const clubSlotsFromResults = (results: any[]) => results
  .slice()
  .sort((a, b) => Number(a.seat_number) - Number(b.seat_number))
  .map((result) => ({
    slot_num: Number(result.seat_number), participant_id: result.participant_id, player_id: result.player_id,
    nickname: result.display_name, role: result.role,
    team: result.role === 'mafia' || result.role === 'don' || result.role === 'Мафия' || result.role === 'Дон'
      ? 'Чёрные' : result.role ? 'Красные' : null,
    exit_reason: result.exit_type || 'alive', fouls: result.regular_fouls || 0,
    minor_technical_fouls: result.minor_technical_fouls || 0,
    major_technical_fouls: result.major_technical_fouls || 0,
  }));

router.post('/evening/:eveningId', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const eveningId = String(req.params.eveningId);
    const db = (req as any).db || (await getDb());
    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    if (evening.settled_at || evening.status === 'completed') {
      return res.status(409).json({ error: 'Завершённый вечер доступен только для чтения' });
    }
    if (!['published', 'active'].includes(String(evening.status || ''))) {
      return res.status(409).json({ error: 'Перед созданием игры опубликуйте вечер' });
    }

    const tableId = req.body?.evening_table_id ? String(req.body.evening_table_id) : null;
    if (tableId && !await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [tableId, eveningId])) {
      return res.status(400).json({ error: 'Выбранный стол не относится к этому вечеру' });
    }

    const delegatedJudgeId = req.delegatedPlayerId ? String(req.delegatedPlayerId) : null;
    const requestedJudgeId = delegatedJudgeId || (req.body?.judge_player_id ? String(req.body.judge_player_id) : null);
    const judge = await resolveJudgeAssignment(db, {
      judge_player_id: requestedJudgeId,
      judge_name: delegatedJudgeId ? null : (req.body?.judge_name ?? null),
      required_level: requestedJudgeId ? requiredJudgeLevelForEveningFormat(evening.format) : undefined,
    });

    const createdId = await db.transaction(async (tx: any) => {
      if (delegatedJudgeId) {
        await markJudgeSelectedPlayersPresent(tx, eveningId, req.body?.seats || []);
      }

      const seats = await validateEveningGameSeats(tx, eveningId, req.body?.seats || []);
      const now = new Date().toISOString();
      const next = await tx.get<any>('SELECT COALESCE(MAX(global_game_number), 0) + 1 AS next_number FROM games');
      const protocol = buildInitialClubProtocol(seats);
      const insert = await tx.run(
        `INSERT INTO games (
          evening_id, evening_table_id, global_game_number, game_date, winner_team, winner_label,
          judge_name, judge_player_id, protocol_text, slots_json, created_at
        ) VALUES (?, ?, ?, ?, 'draft', 'Черновик', ?, ?, ?, ?, ?)`,
        [
          eveningId, tableId, Number(next?.next_number || 1), evening.starts_at || now,
          judge.judge_name, judge.judge_player_id, JSON.stringify(protocol),
          JSON.stringify(clubSlotsFromResults(protocol.player_results)), now,
        ],
      );
      const id = Number(insert.lastID);
      protocol.protocol.game_id = String(id);
      await tx.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(protocol), id]);
      if (evening.status === 'published') {
        await tx.run(
          'UPDATE game_evenings SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
          ['active', now, eveningId, 'published'],
        );
      }
      return id;
    });

    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [createdId],
    );
    return res.status(201).json(normalizeGame(row));
  } catch (err: any) {
    return res.status(400).json({ error: err instanceof JudgeAssignmentError ? err.message : (err.message || 'Не удалось создать игру') });
  }
});

// Canonical club-game save lives before the legacy base router so completion/correction
// cannot drift identities, discipline fields, Elo inputs or token settlement state.
router.put('/:gameId/evening-protocol', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });

    const db = (req as any).db || (await getDb());
    const existing = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Это не игра обычного вечера' });
    if (existing.archived_at) return res.status(409).json({ error: 'Игра находится в архиве. Сначала восстановите её.' });

    const incomingProtocol = req.body?.protocol;
    const rawResults = req.body?.player_results;
    if (!incomingProtocol || !Array.isArray(rawResults) || rawResults.length !== 10) {
      return res.status(400).json({ error: 'Нужны protocol и 10 player_results' });
    }

    const previous = safeJsonParse<any>(existing.protocol_text, null);
    if (!previous || previous.kind !== 'club_evening_protocol' || previous.version !== 1) {
      return res.status(400).json({ error: 'У игры отсутствует структурированный клубный протокол' });
    }

    const previousStatus: 'draft' | 'completed' = previous.protocol?.status === 'completed' ? 'completed' : 'draft';
    const status: 'draft' | 'completed' = incomingProtocol.status === 'completed' ? 'completed' : 'draft';
    const canonical = canonicalizeClubGameSave(previous, incomingProtocol, rawResults, status);
    const winner = canonical.protocol.winner_team === 'red'
      ? 'Красные'
      : canonical.protocol.winner_team === 'black'
        ? 'Чёрные'
        : null;

    const hasJudgePatch = Object.prototype.hasOwnProperty.call(req.body || {}, 'judge_player_id')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'judge_name');
    const judge = hasJudgePatch
      ? await resolveJudgeAssignment(db, {
          judge_player_id: req.body?.judge_player_id ?? null,
          judge_name: req.body?.judge_name ?? null,
        })
      : { judge_player_id: existing.judge_player_id || null, judge_name: existing.judge_name || null };

    const now = new Date().toISOString();
    const completedAt = status === 'completed'
      ? (previousStatus === 'completed' ? previous.protocol?.completed_at || now : now)
      : null;
    const nextProtocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        ...canonical.protocol,
        game_id: String(gameId),
        status,
        updated_at: now,
        completed_at: completedAt,
      },
      player_results: canonical.playerResults,
    };
    const settlementContext = status === 'completed'
      ? (previousStatus === 'completed' ? 'correction' : 'completion')
      : (previousStatus === 'completed' ? 'reopen' : 'correction');

    await db.transaction(async (tx: any) => {
      await tx.run(
        `UPDATE games
            SET winner_team = ?, winner_label = ?, judge_name = ?, judge_player_id = ?, protocol_text = ?, slots_json = ?
          WHERE id = ?`,
        [
          winner || 'draft',
          winner ? `Победа ${winner}` : 'Черновик',
          judge.judge_name,
          judge.judge_player_id,
          JSON.stringify(nextProtocol),
          JSON.stringify(clubSlotsFromResults(canonical.playerResults)),
          gameId,
        ],
      );
      await reconcileClubGameTokenSettlement(tx, gameId, {
        activateIfUntracked: previousStatus !== 'completed' && status === 'completed',
        context: settlementContext,
      });
    });

    if (previousStatus === 'completed' || status === 'completed') {
      await rebuildCanonicalEloRatings(db);
    }

    if (status === 'completed') {
      const achievementIds = canonical.playerResults.map((item: any) => String(item.player_id || '')).filter(Boolean);
      if (judge.judge_player_id) achievementIds.push(String(judge.judge_player_id));
      await evaluateAchievementsForPlayers(db, achievementIds);
    }

    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId],
    );
    return res.json(normalizeGame(row));
  } catch (err: any) {
    const message = err instanceof JudgeAssignmentError ? err.message : (err.message || 'Не удалось сохранить протокол');
    return res.status(400).json({ error: message });
  }
});

router.use(baseRouter);
export default router;
