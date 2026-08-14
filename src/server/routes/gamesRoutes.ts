import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import baseRouter from './gamesRoutesBase.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';
import { getEveningAttendanceFact } from '../../lib/eveningResponse.ts';
import { requiredJudgeLevelForEveningFormat } from '../../db/ensureJudgeAuthoritySchema.ts';
import { setParticipantAttendance } from '../services/eveningParticipantState.ts';

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

router.use(baseRouter);
export default router;