import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import baseRouter from './gamesRoutesBase.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';

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
    status: isClubProtocol ? (clubProtocol.protocol?.status || 'draft') : row.winner_team === 'draft' ? 'draft' : 'completed',
  };
};

const validateEveningGameSeats = async (db: any, eveningId: string, seats: any[]) => {
  if (!Array.isArray(seats) || seats.length !== 10) throw new Error('Для игры необходимо выбрать ровно 10 игроков');
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
    `SELECT ep.id AS participant_id, ep.player_id, ep.evening_id, p.nickname, p.full_name
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
      WHERE ep.id IN (${placeholders})`,
    participantIds,
  );
  if (rows.length !== 10 || rows.some((row: any) => row.evening_id !== eveningId)) {
    throw new Error('Все выбранные игроки должны быть участниками этого вечера');
  }
  const byParticipant = new Map(rows.map((row: any) => [row.participant_id, row]));
  return seats.map((seat) => {
    const source: any = byParticipant.get(String(seat.participant_id));
    return {
      participant_id: String(seat.participant_id),
      player_id: source.player_id,
      seat_number: Number(seat.seat_number),
      display_name: source.nickname || source.full_name || `Игрок ${seat.seat_number}`,
      role: seat.role ?? null,
    };
  }).sort((a, b) => a.seat_number - b.seat_number);
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

const clubSlotsFromResults = (results: any[]) => results.slice().sort((a, b) => Number(a.seat_number) - Number(b.seat_number)).map((result) => ({
  slot_num: Number(result.seat_number), participant_id: result.participant_id, player_id: result.player_id,
  nickname: result.display_name, role: result.role,
  team: result.role === 'mafia' || result.role === 'don' || result.role === 'Мафия' || result.role === 'Дон' ? 'Чёрные' : result.role ? 'Красные' : null,
  exit_reason: result.exit_type || 'alive', fouls: result.regular_fouls || 0,
  minor_technical_fouls: result.minor_technical_fouls || 0, major_technical_fouls: result.major_technical_fouls || 0,
}));

// Stable judge identity cutover for the active club-game creation flow.
router.post('/evening/:eveningId', requireOrganizerAuth, async (req, res) => {
  try {
    const eveningId = String(req.params.eveningId);
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const tableId = req.body?.evening_table_id ? String(req.body.evening_table_id) : null;
    if (tableId) {
      const table = await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [tableId, eveningId]);
      if (!table) return res.status(400).json({ error: 'Выбранный стол не относится к этому вечеру' });
    }

    const judge = await resolveJudgeAssignment(db, {
      judge_player_id: req.body?.judge_player_id ?? null,
      judge_name: req.body?.judge_name ?? null,
    });
    const seats = await validateEveningGameSeats(db, eveningId, req.body?.seats || []);
    const now = new Date().toISOString();
    const nextNumberRow = await db.get('SELECT COALESCE(MAX(global_game_number), 0) + 1 AS next_number FROM games');
    const initialProtocol = buildInitialClubProtocol(seats);
    const insert = await db.run(
      `INSERT INTO games (
        evening_id, evening_table_id, global_game_number, game_date,
        winner_team, winner_label, judge_name, judge_player_id, protocol_text, slots_json, created_at
      ) VALUES (?, ?, ?, ?, 'draft', 'Черновик', ?, ?, ?, ?, ?)`,
      [
        eveningId, tableId, Number(nextNumberRow?.next_number || 1), evening.starts_at || now,
        judge.judge_name, judge.judge_player_id, JSON.stringify(initialProtocol),
        JSON.stringify(clubSlotsFromResults(initialProtocol.player_results)), now,
      ],
    );
    const gameId = Number(insert.lastID);
    initialProtocol.protocol.game_id = String(gameId);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(initialProtocol), gameId]);
    const row = await db.get(
      `SELECT g.*, et.name AS table_name FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id WHERE g.id = ?`,
      [gameId],
    );
    return res.status(201).json(normalizeGame(row));
  } catch (err: any) {
    const status = err instanceof JudgeAssignmentError ? 400 : 400;
    return res.status(status).json({ error: err.message || 'Не удалось создать игру' });
  }
});

router.use(baseRouter);
export default router;
