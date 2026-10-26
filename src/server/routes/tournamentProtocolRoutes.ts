import { validateBestMoves, validateFirstKilled, validatePlayerResults, validateShots } from '../../lib/protocolConsistency.ts';
export { validateFirstKilled, validatePlayerResults, validateShots } from '../../lib/protocolConsistency.ts';
import { sanitizeLiveGameEvents } from '../../shared/liveGameEvents.ts';
import { Router, Response } from 'express';
import crypto from 'crypto';
import { DatabaseWrapper } from '../../db/index.ts';
import { getAuthenticatedOrganizerActorId, requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { recordTournamentGameEdit } from '../services/tournamentGameEditPolicy.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { validateVotes } from '../../lib/protocolVotingValidation.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';
import { blackParticipantIds, withoutBlackBestMoves } from '../services/blackBestMoves.ts';
import { calculateBestMovePoints } from '../services/bestMovePoints.ts';
import { gameTeamOfRole, normalizeGameRole } from '../../shared/gameRoles.ts';

const router = Router();

/**
 * The protocol payload from the browser carries results by participant, without the seat number, while the
 * vote checks compare seats. Without this every voted-out player made completion fail with «Игрок #undefined…»
 * (owner, 2026-10-03, tournament game 2). The seat comes from the game's own seating.
 */
function withSeatNumbers(playerResults: any[], seats: any[]): any[] {
  const seatByParticipant = new Map<string, number>(seats.map((seat: any) => [String(seat.participant_id), Number(seat.seat_number)]));
  return playerResults.map((result: any) => ({
    ...result,
    // The game's own seating wins over whatever the browser sent; a seat number is only a fallback for an unknown participant.
    seat_number: seatByParticipant.get(String(result?.participant_id)) ?? result?.seat_number,
  }));
}

// 1. GET /api/tournaments/:tournamentId/games/:gameId/protocol
router.get('/:tournamentId/games/:gameId/protocol', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
  const gameId = String(req.params.gameId);
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
        minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
        major_technical_fouls: existing?.major_technical_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
        removal_reason: existing?.removal_reason || null,
        ci_points: existing?.ci_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let protocolData: any = null;

    if (protocolRecord) {
      let bestMoveSeats = [];




      try { bestMoveSeats = JSON.parse(protocolRecord.best_move_seats_json || '[]'); } catch (_) {}

      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, seats);

      const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      let best_moves: any[] = [];

      if (bmRecords.length > 0) {
        best_moves = bmRecords.map(bm => {
          let bmSeats = [];
          try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
          const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, seats);
          return {
            participant_id: bm.participant_id,
            source: bm.source,
            seat_numbers: bmSeats,
            guessed_blacks: guessedBlacks,
            bonus_points: bonusPoints
          };
        });
      } else if (protocolRecord.best_move_participant_id) {
        const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bestMoveSeats, seats);
        best_moves.push({
          participant_id: protocolRecord.best_move_participant_id,
          source: protocolRecord.best_move_source || 'first_killed',
          seat_numbers: bestMoveSeats,
          guessed_blacks: guessedBlacks,
          bonus_points: bonusPoints
        });
      }

      protocolData = serializeProtocolOutput(protocolRecord, best_moves, best_move_score);
      protocolData.best_move_score = best_move_score;
    } else {
      protocolData = {
        game_id: gameId,
        status: 'draft',
        winner_team: game.winner_team || null,
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
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
  const gameId = String(req.params.gameId);
  const { protocol, player_results } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать' });
    }

    if (tournament.status !== 'active' && tournament.status !== 'correction') {
      return res.status(400).json({ error: 'Сохранить протокол можно только в активном турнире или режиме корректировки' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status === 'planned') {
      return res.status(400).json({ error: 'Нельзя сохранить запланированную игру. Сначала запустите игру' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const allParticipantIds = seats.map((s) => s.participant_id);

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if ((existingProtocol && existingProtocol.status === 'completed') || game.status === 'completed') {
      return res.status(400).json({ error: 'Завершённую игру можно править, только открыв её протокол для правки' });
    }

    // PPK: one rule (processPPK) for the draft save and the completion; an unknown culprit role is an error, never «red».
    const ppkErr = processPPK(protocol, seats);
    if (ppkErr) return res.status(400).json({ error: ppkErr });

    if (player_results && Array.isArray(player_results)) {
      for (const pr of player_results) {
        if (pr.penalty_points && pr.penalty_points > 0) {
          if (!pr.judge_bonus || pr.judge_bonus === 0) {
            pr.judge_bonus = -Math.abs(pr.penalty_points);
            pr.penalty_points = 0;
          } else if (pr.judge_bonus !== 0) {
            return res.status(400).json({
              error: 'Конфликт данных: одновременно зафиксированы позитивный penalty_points и балл судьи (judge_bonus)'
            });
          }
        } else {
          pr.penalty_points = 0;
        }
        pr.technical_fouls = (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0);
        pr.disciplinary_penalty_points = calculateDisciplinaryPenalty(
          pr.minor_technical_fouls || 0,
          pr.major_technical_fouls || 0,
          pr.exit_type === 'removed',
          protocol?.end_reason === 'ppk' && protocol?.ppk_culprit_participant_id === pr.participant_id
        );
      }
    }

    if (!player_results || !Array.isArray(player_results)) {
      return res.status(400).json({ error: 'В протоколе нет результатов игроков' });
    }
    const playerErr = validatePlayerResults(player_results, seats, protocol?.first_killed_participant_id);
    if (playerErr) {
      return res.status(400).json({ error: playerErr });
    }

    const votesErr = validateVotes(protocol?.votes, false, withSeatNumbers(player_results, seats), protocol?.zero_round_voted_participant_id);
    if (votesErr) {
      return res.status(400).json({ error: votesErr });
    }

    const shotsErr = validateShots(protocol?.shots, 10, seats, false);
    if (shotsErr) {
      return res.status(400).json({ error: shotsErr });
    }

    let bestMoves = protocol?.best_moves;
    if (bestMoves === undefined && protocol?.best_move_participant_id) {
      bestMoves = [{
        participant_id: protocol.best_move_participant_id,
        source: protocol.best_move_participant_id === protocol.first_killed_participant_id ? 'first_killed' : 'zero_round_voted',
        seat_numbers: protocol.best_move_seats || []
      }];
    }
    if (!bestMoves) bestMoves = [];
    // A black first-killed goes through the ЛХ step but it scores nothing for him (owner, 2026-10-10).
    bestMoves = withoutBlackBestMoves(bestMoves, blackParticipantIds(seats));

    const bestMoveErr = validateBestMoves(
      bestMoves,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds,
      player_results
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    const fkErr = validateFirstKilled(
      protocol?.first_killed_participant_id,
      seats,
      player_results,
      protocol?.shots
    );
    if (fkErr) {
      return res.status(400).json({ error: fkErr });
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
          votes_json, shots_json, replacement_json, events_json, judge_notes, end_reason, ppk_culprit_participant_id,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          protocolId,
          gameId,
          protocol?.winner_team || null,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          null, // deprecated
          null, // deprecated
          '[]', // deprecated
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          resolveEventsJson(protocol, existingProtocol),
          protocol?.judge_notes || null,
          protocol?.end_reason || 'normal',
          protocol?.ppk_culprit_participant_id || null,
          existingProtocol?.created_at || now,
          now,
        ]
      );

      await tx.run('DELETE FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      for (const bm of bestMoves) {
        await tx.run(
          `INSERT INTO tournament_game_best_moves (id, game_id, participant_id, source, seat_numbers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), gameId, bm.participant_id, bm.source, JSON.stringify(bm.seat_numbers || []), now, now]
        );
      }

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, minor_technical_fouls, major_technical_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, removal_reason, ci_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.minor_technical_fouls ?? 0,
              pr.major_technical_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              pr.disciplinary_penalty_points ?? 0,
              pr.removal_reason || null,
              0,
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

    const playerResultsList = serializePlayerResultsOutput(fullSeats, savedResultsRecords, gameId);

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves = bmRecords.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    // Draft autosaves are real tournament data too. Without this checkpoint a
    // Preview restart restored the last completed game and discarded later drafts.
    const cpResult = await createPreviewCheckpoint(db);

    res.json({
      protocol: serializeProtocolOutput(savedProtocol, responseBestMoves, best_move_score),
      player_results: playerResultsList,
      game,
      best_move_score,
      checkpoint_warning: cpResult.success ? undefined : cpResult.message,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения протокола' });
  }
});

// 3. POST /api/tournaments/:tournamentId/games/:gameId/protocol/complete
router.post('/:tournamentId/games/:gameId/protocol/complete', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
  const gameId = String(req.params.gameId);
  const { protocol, player_results } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать' });
    }

    if (tournament.status !== 'active' && tournament.status !== 'correction') {
      return res.status(400).json({ error: 'Завершить протокол можно только в активном турнире или режиме корректировки' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status === 'planned') {
      return res.status(400).json({ error: 'Нельзя завершить запланированную игру. Сначала запустите игру' });
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

      const playerResultsList = serializePlayerResultsOutput(fullSeats, savedResultsRecords, gameId);

      let bestMoveSeats = [];
      try { bestMoveSeats = JSON.parse(existingProtocol.best_move_seats_json || '[]'); } catch (_) {}
      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

      const bmRecords1 = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      const responseBestMoves1 = bmRecords1.map(bm => {
        let bmSeats = [];
        try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
        const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
        return {
          participant_id: bm.participant_id,
          source: bm.source,
          seat_numbers: bmSeats,
          guessed_blacks: guessedBlacks,
          bonus_points: bonusPoints
        };
      });

      return res.json({
        protocol: serializeProtocolOutput(existingProtocol, responseBestMoves1, best_move_score),
        player_results: playerResultsList,
        game,
      });
    }

    // Completion Validations
    const ppkErr = processPPK(protocol, seats);
    if (ppkErr) return res.status(400).json({ error: ppkErr });

    if (!protocol?.winner_team || !['red', 'black'].includes(protocol.winner_team)) {
      return res.status(400).json({ error: 'Необходимо выбрать победившую команду (Красные или Чёрные)' });
    }

    // Check roles distribution
    const roleCounts: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
    for (const seat of seats) {
      const r = normalizeGameRole(seat.role);
      if (r && roleCounts[r] !== undefined) roleCounts[r]++;
    }
    if (roleCounts.citizen !== 6 || roleCounts.sheriff !== 1 || roleCounts.mafia !== 2 || roleCounts.don !== 1) {
      return res.status(400).json({ error: 'Не все роли участников корректно распределены (требуется: 6 мирных, 1 Шериф, 2 Мафии, 1 Дон)' });
    }

    if (player_results && Array.isArray(player_results)) {
      for (const pr of player_results) {
        if (pr.penalty_points && pr.penalty_points > 0) {
          if (!pr.judge_bonus || pr.judge_bonus === 0) {
            pr.judge_bonus = -Math.abs(pr.penalty_points);
            pr.penalty_points = 0;
          } else if (pr.judge_bonus !== 0) {
            return res.status(400).json({
              error: 'Конфликт данных: одновременно зафиксированы позитивный penalty_points и балл судьи (judge_bonus)'
            });
          }
        } else {
          pr.penalty_points = 0;
        }
        pr.technical_fouls = (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0);
        pr.disciplinary_penalty_points = calculateDisciplinaryPenalty(
          pr.minor_technical_fouls || 0,
          pr.major_technical_fouls || 0,
          pr.exit_type === 'removed',
          protocol?.end_reason === 'ppk' && protocol?.ppk_culprit_participant_id === pr.participant_id
        );
      }
    }

    if (!player_results || !Array.isArray(player_results)) {
      return res.status(400).json({ error: 'В протоколе нет результатов игроков' });
    }
    const playerErr = validatePlayerResults(player_results, seats, protocol?.first_killed_participant_id);
    if (playerErr) {
      return res.status(400).json({ error: playerErr });
    }

    const votesErr = validateVotes(protocol?.votes, true, withSeatNumbers(player_results, seats), protocol?.zero_round_voted_participant_id);
    if (votesErr) {
      return res.status(400).json({ error: votesErr });
    }

    const shotsErr = validateShots(protocol?.shots, 10, seats, true);
    if (shotsErr) {
      return res.status(400).json({ error: shotsErr });
    }

    let bestMoves = protocol?.best_moves;
    if (bestMoves === undefined && protocol?.best_move_participant_id) {
      bestMoves = [{
        participant_id: protocol.best_move_participant_id,
        source: protocol.best_move_participant_id === protocol.first_killed_participant_id ? 'first_killed' : 'zero_round_voted',
        seat_numbers: protocol.best_move_seats || []
      }];
    }
    if (!bestMoves) bestMoves = [];
    // A black first-killed goes through the ЛХ step but it scores nothing for him (owner, 2026-10-10).
    bestMoves = withoutBlackBestMoves(bestMoves, blackParticipantIds(seats));

    const bestMoveErr = validateBestMoves(
      bestMoves,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds,
      player_results
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    const fkErr = validateFirstKilled(
      protocol?.first_killed_participant_id,
      seats,
      player_results,
      protocol?.shots
    );
    if (fkErr) {
      return res.status(400).json({ error: fkErr });
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
          votes_json, shots_json, replacement_json, events_json, judge_notes, end_reason, ppk_culprit_participant_id,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          protocolId,
          gameId,
          protocol.winner_team,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          null, // deprecated
          null, // deprecated
          '[]', // deprecated
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          resolveEventsJson(protocol, existingProtocol),
          protocol?.judge_notes || null,
          protocol?.end_reason || 'normal',
          protocol?.ppk_culprit_participant_id || null,
          existingProtocol?.created_at || now,
          now,
          now,
        ]
      );

      await tx.run('DELETE FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      for (const bm of bestMoves) {
        await tx.run(
          `INSERT INTO tournament_game_best_moves (id, game_id, participant_id, source, seat_numbers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), gameId, bm.participant_id, bm.source, JSON.stringify(bm.seat_numbers || []), now, now]
        );
      }

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, minor_technical_fouls, major_technical_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, removal_reason, ci_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.minor_technical_fouls ?? 0,
              pr.major_technical_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              pr.disciplinary_penalty_points ?? 0,
              pr.removal_reason || null,
              0,
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

    const achievementPlayers = await db.all<any>(`
      SELECT DISTINCT tp.player_id
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
       WHERE tgs.game_id = ? AND tp.player_id IS NOT NULL
    `, [gameId]);
    const achievementPlayerIds = achievementPlayers.map((row: any) => String(row.player_id));
    if (game.judge_player_id) achievementPlayerIds.push(String(game.judge_player_id));
    await evaluateAchievementsForPlayers(db, achievementPlayerIds);

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

    const playerResultsList = serializePlayerResultsOutput(fullSeats, savedResultsRecords, gameId);

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords2 = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves2 = bmRecords2.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    const cpResult = await createPreviewCheckpoint(db);

    res.json({
      protocol: serializeProtocolOutput(savedProtocol, responseBestMoves2, best_move_score),
      player_results: playerResultsList,
      game: updatedGame,
      best_move_score: best_move_score,
      checkpoint_warning: cpResult.success ? undefined : cpResult.message
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка завершения протокола' });
  }
});

// 4. POST /api/tournaments/:tournamentId/games/:gameId/protocol/revert-to-draft
router.post('/:tournamentId/games/:gameId/protocol/revert-to-draft', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.tournamentId);
  const gameId = String(req.params.gameId);
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Турнир завершён. Нажмите «Исправить» на игре — турнир откроется для исправления' });
    }

    if (tournament.status !== 'active' && tournament.status !== 'correction') {
      return res.status(400).json({ error: 'Открыть игру для правки можно только в идущем турнире или в режиме исправления' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    // Another game running at the same time does not block a correction (owner, 2026-10-22).
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

    const playerResultsList = serializePlayerResultsOutput(fullSeats, savedResultsRecords, gameId);

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves = bmRecords.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    await recordTournamentGameEdit(db, {
      tournamentId, gameId, action: 'game_reopened_for_correction', actorId: getAuthenticatedOrganizerActorId(req),
      payload: { tournament_status: tournament.status },
    });

    const cpResult = await createPreviewCheckpoint(db);

    res.json({
      protocol: serializeProtocolOutput(savedProtocol, responseBestMoves, best_move_score),
      player_results: playerResultsList,
      game: updatedGame,
      best_move_score: best_move_score,
      checkpoint_warning: cpResult.success ? undefined : cpResult.message
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось открыть протокол для правки' });
  }
});


function processPPK(protocol: any, seats: any[]): string | null {
  if (protocol?.end_reason && !['normal', 'ppk'].includes(protocol.end_reason)) {
    return 'Неверная причина завершения (end_reason)';
  }
  if (protocol?.end_reason === 'ppk') {
    if (!protocol.ppk_culprit_participant_id) {
      return 'При ППК виновник обязателен';
    }
    const culprit = seats.find((s: any) => s.participant_id === protocol.ppk_culprit_participant_id);
    if (!culprit) {
      return 'Виновник ППК не участвует в игре';
    }
    const culpritTeam = gameTeamOfRole(culprit.role);
    if (culpritTeam === 'red') {
      protocol.winner_team = 'black';
    } else if (culpritTeam === 'black') {
      protocol.winner_team = 'red';
    } else {
      return 'Неизвестная роль виновника ППК';
    }
  } else if (protocol?.end_reason === 'normal' && protocol?.ppk_culprit_participant_id) {
    return 'При обычном завершении виновник ППК должен быть null';
  }
  return null;
}

/**
 * The chronology of the live game is stored next to the protocol. A save that carries `events` replaces it (cleaned up);
 * a save without them (the manual protocol screen) keeps what is already stored, so editing a protocol never wipes it.
 */
function resolveEventsJson(protocol: any, existingProtocol: any): string {
  if (Array.isArray(protocol?.events)) return JSON.stringify(sanitizeLiveGameEvents(protocol.events));
  return existingProtocol?.events_json || '[]';
}

function serializeProtocolOutput(savedProtocol: any, responseBestMoves: any[], best_move_score?: number) {
  return {
    id: savedProtocol.id,
    game_id: savedProtocol.game_id,
    status: savedProtocol.status,
    winner_team: savedProtocol.winner_team,
    end_reason: savedProtocol.end_reason,
    ppk_culprit_participant_id: savedProtocol.ppk_culprit_participant_id,
    first_killed_participant_id: savedProtocol.first_killed_participant_id,
    zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
    best_move_participant_id: savedProtocol.best_move_participant_id,
    best_move_source: savedProtocol.best_move_source,
    best_moves: responseBestMoves,
    best_move_seats: (function(){ try { return JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch(e){return [];} })(),
    votes: (function(){ try { return JSON.parse(savedProtocol.votes_json || '[]'); } catch(e){return [];} })(),
    shots: (function(){ try { return JSON.parse(savedProtocol.shots_json || '[]'); } catch(e){return [];} })(),
    events: (function(){ try { return JSON.parse(savedProtocol.events_json || '[]'); } catch(e){return [];} })(),
    replacement: (function(){ try { return JSON.parse(savedProtocol.replacement_json || 'null'); } catch(e){return null;} })(),
    judge_notes: savedProtocol.judge_notes,
    created_at: savedProtocol.created_at,
    updated_at: savedProtocol.updated_at,
    completed_at: savedProtocol.completed_at,
    best_move_score: best_move_score ?? 0
  };
}

function serializePlayerResultsOutput(seats: any[], existingResults: any[], gameId: string) {
  return seats.map((seat: any) => {
    const existing = existingResults.find((r: any) => r.participant_id === seat.participant_id);
    let colorProto = [];
    try { colorProto = JSON.parse(existing?.color_protocol_json || '[]'); } catch (_) {}
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
      minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
      major_technical_fouls: existing?.major_technical_fouls ?? 0,
      technical_fouls: existing?.technical_fouls ?? 0,
      judge_bonus: existing?.judge_bonus ?? 0,
      protocol_bonus: existing?.protocol_bonus ?? 0,
      penalty_points: existing?.penalty_points ?? 0,
      disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
      removal_reason: existing?.removal_reason || null,
      ci_points: existing?.ci_points ?? 0,
      color_protocol: colorProto,
      notes: existing?.notes || null,
    };
  });
}

export default router;

