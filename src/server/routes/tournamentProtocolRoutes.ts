import { Router, Response } from 'express';
import crypto from 'crypto';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';

const router = Router();

function normalizeRole(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
  return lower;
}

export function calculateBestMovePoints(
  bestMoveSeats: number[],
  seats: Array<{ seat_number: number; role: string | null }>
): { guessedBlacks: number; bonusPoints: number } {
  if (!bestMoveSeats || bestMoveSeats.length === 0) {
    return { guessedBlacks: 0, bonusPoints: 0 };
  }

  const roleMap = new Map<number, string>();
  for (const s of seats) {
    const r = normalizeRole(s.role);
    if (r) roleMap.set(s.seat_number, r);
  }

  let guessedBlacks = 0;
  for (const seatNum of bestMoveSeats) {
    const r = roleMap.get(seatNum);
    if (r === 'mafia' || r === 'don') {
      guessedBlacks++;
    }
  }

  let bonusPoints = 0;
  if (guessedBlacks === 1) bonusPoints = 0.1;
  else if (guessedBlacks === 2) bonusPoints = 0.3;
  else if (guessedBlacks >= 3) bonusPoints = 0.6;

  return { guessedBlacks, bonusPoints };
}

function validateBestMove(
  bestMoveSeats: any,
  bestMoveParticipantId: string | null | undefined,
  firstKilledParticipantId: string | null | undefined,
  zeroRoundVotedParticipantId: string | null | undefined,
  allParticipantIds: string[]
): string | null {
  // Validate bestMoveSeats
  if (bestMoveSeats !== undefined && bestMoveSeats !== null) {
    if (!Array.isArray(bestMoveSeats)) {
      return 'ЛХ должен быть массивом номеров мест';
    }
    if (bestMoveSeats.length > 3) {
      return 'В ЛХ нельзя указать больше 3 номеров';
    }
    const seen = new Set<number>();
    for (const seatNum of bestMoveSeats) {
      const num = Number(seatNum);
      if (!Number.isInteger(num) || num < 1 || num > 10) {
        return 'Все номера мест в ЛХ должны быть в диапазоне от 1 до 10';
      }
      if (seen.has(num)) {
        return 'Номера мест в ЛХ не могут повторяться';
      }
      seen.add(num);
    }
  }

  // Validate bestMoveParticipantId
  if (bestMoveParticipantId) {
    if (!allParticipantIds.includes(bestMoveParticipantId)) {
      return 'Получатель ЛХ не является участником этой игры';
    }
    const isFirstKilled = Boolean(firstKilledParticipantId && bestMoveParticipantId === firstKilledParticipantId);
    const isZeroRoundVoted = Boolean(zeroRoundVotedParticipantId && bestMoveParticipantId === zeroRoundVotedParticipantId);

    if (!isFirstKilled && !isZeroRoundVoted) {
      return 'Получателем лучшего хода может быть только первоубиенный игрок или игрок, заголосованный в нулевой круг';
    }
  }

  return null;
}

function validatePlayerResults(
  playerResults: any[],
  gameSeats: any[]
): string | null {
  if (!Array.isArray(playerResults)) {
    return 'Результаты игроков должны быть массивом';
  }
  const seatParticipantIds = gameSeats.map((s) => s.participant_id);
  for (const pr of playerResults) {
    if (!pr.participant_id || !seatParticipantIds.includes(pr.participant_id)) {
      return 'Результаты содержат участника, не принадлежащего этой игре';
    }
    if (pr.regular_fouls !== undefined && (typeof pr.regular_fouls !== 'number' || pr.regular_fouls < 0)) {
      return 'Обычные фолы должны быть неотрицательным числом';
    }
    if (pr.technical_fouls !== undefined && (typeof pr.technical_fouls !== 'number' || pr.technical_fouls < 0)) {
      return 'Технические фолы должны быть неотрицательным числом';
    }
  }
  return null;
}

// 1. GET /api/tournaments/:tournamentId/games/:gameId/protocol
router.get('/:tournamentId/games/:gameId/protocol', async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const seats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const protocolRecord = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const playerResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of playerResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const playerResults = seats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try {
          colorProto = JSON.parse(existing.color_protocol_json);
        } catch (_) {}
      }

      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let protocolData: any = null;

    if (protocolRecord) {
      let bestMoveSeats = [];
      let votes = [];
      let shots = [];
      let replacement = null;

      try { bestMoveSeats = JSON.parse(protocolRecord.best_move_seats_json || '[]'); } catch (_) {}
      try { votes = JSON.parse(protocolRecord.votes_json || '[]'); } catch (_) {}
      try { shots = JSON.parse(protocolRecord.shots_json || '[]'); } catch (_) {}
      if (protocolRecord.replacement_json) {
        try { replacement = JSON.parse(protocolRecord.replacement_json); } catch (_) {}
      }

      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, seats);

      protocolData = {
        id: protocolRecord.id,
        game_id: gameId,
        status: protocolRecord.status,
        winner_team: protocolRecord.winner_team,
        first_killed_participant_id: protocolRecord.first_killed_participant_id,
        zero_round_voted_participant_id: protocolRecord.zero_round_voted_participant_id,
        best_move_participant_id: protocolRecord.best_move_participant_id,
        best_move_source: protocolRecord.best_move_source,
        best_move_seats: bestMoveSeats,
        votes,
        shots,
        replacement,
        judge_notes: protocolRecord.judge_notes,
        created_at: protocolRecord.created_at,
        updated_at: protocolRecord.updated_at,
        completed_at: protocolRecord.completed_at,
        best_move_score,
      };
    } else {
      protocolData = {
        game_id: gameId,
        status: 'draft',
        winner_team: game.winner_team || null,
        first_killed_participant_id: null,
        zero_round_voted_participant_id: null,
        best_move_participant_id: null,
        best_move_source: null,
        best_move_seats: [],
        votes: [],
        shots: [],
        replacement: null,
        judge_notes: null,
        best_move_score: 0,
      };
    }

    res.json({
      protocol: protocolData,
      player_results: playerResults,
      game: { ...game, seats },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения протокола' });
  }
});

// 2. PUT /api/tournaments/:tournamentId/games/:gameId/protocol
router.put('/:tournamentId/games/:gameId/protocol', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;
  const { protocol, player_results } = req.body;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const allParticipantIds = seats.map((s) => s.participant_id);

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if (existingProtocol && existingProtocol.status === 'completed') {
      return res.status(400).json({ error: 'Завершённую игру нельзя редактировать без возврата в черновик' });
    }

    // Validations
    const bestMoveErr = validateBestMove(
      protocol?.best_move_seats,
      protocol?.best_move_participant_id,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    if (player_results) {
      const playerErr = validatePlayerResults(player_results, seats);
      if (playerErr) {
        return res.status(400).json({ error: playerErr });
      }
    }

    // Determine best_move_source
    let bestMoveSource: string | null = null;
    if (protocol?.best_move_participant_id) {
      if (protocol.best_move_participant_id === protocol.first_killed_participant_id) {
        bestMoveSource = 'first_killed';
      } else if (protocol.best_move_participant_id === protocol.zero_round_voted_participant_id) {
        bestMoveSource = 'zero_round_voted';
      }
    }

    const now = new Date().toISOString();
    const protocolId = existingProtocol?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Delete old protocol if exists and insert
      await tx.run('DELETE FROM tournament_game_protocols WHERE game_id = ?', [gameId]);

      await tx.run(
        `INSERT INTO tournament_game_protocols (
          id, game_id, status, winner_team,
          first_killed_participant_id, zero_round_voted_participant_id,
          best_move_participant_id, best_move_source, best_move_seats_json,
          votes_json, shots_json, replacement_json, judge_notes,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          protocolId,
          gameId,
          protocol?.winner_team || null,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          protocol?.best_move_participant_id || null,
          bestMoveSource,
          JSON.stringify(protocol?.best_move_seats || []),
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          protocol?.judge_notes || null,
          existingProtocol?.created_at || now,
          now,
        ]
      );

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              JSON.stringify(pr.color_protocol || []),
              pr.notes || null,
            ]
          );
        }
      }

      // Update winner team on game if provided
      if (protocol?.winner_team) {
        await tx.run('UPDATE tournament_games SET winner_team = ? WHERE id = ?', [protocol.winner_team, gameId]);
      }
    });

    // Fetch and return saved protocol
    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения протокола' });
  }
});

// 3. POST /api/tournaments/:tournamentId/games/:gameId/protocol/complete
router.post('/:tournamentId/games/:gameId/protocol/complete', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;
  const { protocol, player_results } = req.body;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const allParticipantIds = seats.map((s) => s.participant_id);

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if (existingProtocol && existingProtocol.status === 'completed') {
      // Already completed, return gracefully
      const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
      const resultsMap = new Map<string, any>();
      for (const pr of savedResultsRecords) {
        resultsMap.set(pr.participant_id, pr);
      }

      const fullSeats = await db.all<any>(`
        SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        JOIN players p ON p.id = tp.player_id
        WHERE tgs.game_id = ?
        ORDER BY tgs.seat_number ASC
      `, [gameId]);

      const playerResultsList = fullSeats.map((seat) => {
        const existing = resultsMap.get(seat.participant_id);
        let colorProto = [];
        if (existing?.color_protocol_json) {
          try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
        }
        return {
          id: existing?.id,
          game_id: gameId,
          participant_id: seat.participant_id,
          seat_number: seat.seat_number,
          display_name: seat.display_name,
          player_id: seat.player_id,
          role: seat.role,
          exit_type: existing?.exit_type || 'alive',
          exit_order: existing?.exit_order ?? null,
          regular_fouls: existing?.regular_fouls ?? 0,
          technical_fouls: existing?.technical_fouls ?? 0,
          judge_bonus: existing?.judge_bonus ?? 0,
          protocol_bonus: existing?.protocol_bonus ?? 0,
          penalty_points: existing?.penalty_points ?? 0,
          color_protocol: colorProto,
          notes: existing?.notes || null,
        };
      });

      let bestMoveSeats = [];
      try { bestMoveSeats = JSON.parse(existingProtocol.best_move_seats_json || '[]'); } catch (_) {}
      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

      return res.json({
        protocol: {
          id: existingProtocol.id,
          game_id: gameId,
          status: 'completed',
          winner_team: existingProtocol.winner_team,
          first_killed_participant_id: existingProtocol.first_killed_participant_id,
          zero_round_voted_participant_id: existingProtocol.zero_round_voted_participant_id,
          best_move_participant_id: existingProtocol.best_move_participant_id,
          best_move_source: existingProtocol.best_move_source,
          best_move_seats: bestMoveSeats,
          votes: JSON.parse(existingProtocol.votes_json || '[]'),
          shots: JSON.parse(existingProtocol.shots_json || '[]'),
          replacement: existingProtocol.replacement_json ? JSON.parse(existingProtocol.replacement_json) : null,
          judge_notes: existingProtocol.judge_notes,
          created_at: existingProtocol.created_at,
          updated_at: existingProtocol.updated_at,
          completed_at: existingProtocol.completed_at,
          best_move_score,
        },
        player_results: playerResultsList,
        game,
      });
    }

    // Completion Validations
    if (!protocol?.winner_team || !['red', 'black'].includes(protocol.winner_team)) {
      return res.status(400).json({ error: 'Необходимо выбрать победившую команду (Красные или Чёрные)' });
    }

    // Check roles distribution
    const roleCounts: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
    for (const seat of seats) {
      const r = normalizeRole(seat.role);
      if (r && roleCounts[r] !== undefined) roleCounts[r]++;
    }
    if (roleCounts.citizen !== 6 || roleCounts.sheriff !== 1 || roleCounts.mafia !== 2 || roleCounts.don !== 1) {
      return res.status(400).json({ error: 'Не все роли участников корректно распределены (требуется: 6 мирных, 1 Шериф, 2 Мафии, 1 Дон)' });
    }

    const bestMoveErr = validateBestMove(
      protocol?.best_move_seats,
      protocol?.best_move_participant_id,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    if (player_results) {
      const playerErr = validatePlayerResults(player_results, seats);
      if (playerErr) {
        return res.status(400).json({ error: playerErr });
      }
    }

    let bestMoveSource: string | null = null;
    if (protocol?.best_move_participant_id) {
      if (protocol.best_move_participant_id === protocol.first_killed_participant_id) {
        bestMoveSource = 'first_killed';
      } else if (protocol.best_move_participant_id === protocol.zero_round_voted_participant_id) {
        bestMoveSource = 'zero_round_voted';
      }
    }

    const now = new Date().toISOString();
    const protocolId = existingProtocol?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Delete old protocol if exists and insert
      await tx.run('DELETE FROM tournament_game_protocols WHERE game_id = ?', [gameId]);

      await tx.run(
        `INSERT INTO tournament_game_protocols (
          id, game_id, status, winner_team,
          first_killed_participant_id, zero_round_voted_participant_id,
          best_move_participant_id, best_move_source, best_move_seats_json,
          votes_json, shots_json, replacement_json, judge_notes,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          protocolId,
          gameId,
          protocol.winner_team,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          protocol?.best_move_participant_id || null,
          bestMoveSource,
          JSON.stringify(protocol?.best_move_seats || []),
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          protocol?.judge_notes || null,
          existingProtocol?.created_at || now,
          now,
          now,
        ]
      );

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              JSON.stringify(pr.color_protocol || []),
              pr.notes || null,
            ]
          );
        }
      }

      // Update tournament_games status to completed
      await tx.run(
        "UPDATE tournament_games SET status = 'completed', winner_team = ?, completed_at = ? WHERE id = ?",
        [protocol.winner_team, now, gameId]
      );
    });

    // Fetch and return completed protocol
    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    const updatedGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game: updatedGame,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка завершения протокола' });
  }
});

// 4. POST /api/tournaments/:tournamentId/games/:gameId/protocol/revert-to-draft
router.post('/:tournamentId/games/:gameId/protocol/revert-to-draft', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if (!existingProtocol) {
      return res.status(400).json({ error: 'Протокол не найден' });
    }

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE tournament_game_protocols SET status = 'draft', completed_at = NULL, updated_at = ? WHERE id = ?",
        [now, existingProtocol.id]
      );
      await tx.run(
        "UPDATE tournament_games SET status = 'active', completed_at = NULL WHERE id = ?",
        [gameId]
      );
    });

    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    const updatedGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game: updatedGame,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка возврата в черновик' });
  }
});

export default router;
