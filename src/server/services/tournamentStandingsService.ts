import type { DatabaseWrapper } from '../../db/index.ts';
import { calculateBestMovePoints } from './bestMovePoints.ts';
import {
  normalizeRole,
  roundToTwo,
  calculateCiThreshold,
  calculateCiRate,
  calculateGameCi
} from '../utils/ciHelper.ts';
import { compareTournamentNominationCandidates, type TournamentNominationCategory, type NominationHeadToHeadGame } from './tournamentNominationComparator.ts';

// Tournament standings and nominations, read by tournament routes and by rating/award/player services.
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

  // Legacy fixed distance: only the base of the standings. The real distance (`tournaments.game_count`) is applied by
  // getFlexibleTournamentStandings, the single owner of Ci and places (services/flexibleTournamentStandingsService.ts).
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
    { category: 'best_mafia', title: 'Лучший чёрный', targetRoles: ['mafia'] },
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
          // Owner rule 2026-10-06: a nomination counts the judge's extra points and the protocol points only.
          nomination_points: roundToTwo(judge + protocol),
        });
      }

      if (gamesInRole >= 1) {
        // Owner rule 2026-10-06: nomination points = the judge's extra points + protocol points. Best move (ЛХ),
        // disciplinary minuses, ПУ and CI never count. Ties: role wins (Sheriff/Don), then head-to-head.
        const nominationPoints = roundToTwo(sumJudge + sumProtocol);
        candidateList.push({
          participant_id: participant.participant_id,
          participant_number: participant.participant_number,
          display_name: participant.display_name,
          points: nominationPoints,
          additional_points: sumProtocol,
          role_wins: roleWins,
          nomination_points: nominationPoints,
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
        // Protocol points are already inside the nomination points: no second numeric tie-break.
        additional_points: 0,
        role_wins: candidate.role_wins,
      })),
      headToHeadGames,
    );

    candidateList.sort((a, b) => {
      const byPoints = b.points - a.points;
      if (Math.abs(byPoints) > 0.0001) return byPoints;
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
