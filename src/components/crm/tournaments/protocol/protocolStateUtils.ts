import {
  PlayerResultData,
  TournamentGameProtocolData
} from '../../../../lib/api';
import { calculateVoteRemainder } from '../../../../shared/tournamentVoting';

export const getOppositeTeam = (role: string | null): 'red' | 'black' | null => {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r === 'citizen' || r === 'sheriff' || r === 'мирный' || r === 'мирянин' || r === 'шериф') return 'black';
  if (r === 'mafia' || r === 'don' || r === 'мафия' || r === 'дон') return 'red';
  return null;
};

export const calculateGuessedBlacks = (
  seats: number[],
  results: PlayerResultData[]
) => {
  let guessedBlacks = 0;
  for (const seatNum of seats) {
    const p = results.find((pr) => pr.seat_number === seatNum);
    if (p && p.role) {
      const lower = p.role.toLowerCase();
      if (lower === 'mafia' || lower === 'don' || lower === 'black' || lower === 'мафия' || lower === 'дон') {
        guessedBlacks++;
      }
    }
  }
  let bonusPoints = 0;
  if (guessedBlacks === 1) bonusPoints = 0.1;
  else if (guessedBlacks === 2) bonusPoints = 0.3;
  else if (guessedBlacks >= 3) bonusPoints = 0.6;
  return { guessedBlacks, bonusPoints };
};

export const syncAllEventsToResults = (
  votes: any[],
  shots: any[],
  firstKilledId: string | null,
  results: PlayerResultData[],
  proto: TournamentGameProtocolData
) => {
  const confirmedVotes = votes.filter((v: any) => v.outcome && v.outcome !== 'pending');

  const zeroRoundEliminatedSeats = new Set<number>();
  const otherDayEliminatedSeats = new Set<number>();

  for (const r of confirmedVotes) {
    const seats = r.eliminated_seats || [];
    if (r.day_number === 0) {
      seats.forEach((s: number) => zeroRoundEliminatedSeats.add(s));
    } else {
      seats.forEach((s: number) => otherDayEliminatedSeats.add(s));
    }
  }

  const shotSeats = new Set<number>();
  for (const s of (shots || [])) {
    if (s && s.result === 'killed' && s.target_seat) {
      shotSeats.add(Number(s.target_seat));
    }
  }

  const firstKilledSeat = firstKilledId
    ? results.find(p => p.participant_id === firstKilledId)?.seat_number || null
    : null;

  const removedSeats = new Set<number>();
  for (const pr of results) {
    const techSum = (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0);
    const isRemovedByRules = pr.regular_fouls === 4 || techSum === 2 || Boolean(pr.removal_reason) || pr.exit_type === 'removed';
    if (isRemovedByRules) {
      removedSeats.add(Number(pr.seat_number));
    }
  }

  const updatedResults = results.map(pr => {
    const seat = Number(pr.seat_number);
    let nextExitType = pr.exit_type;

    if (removedSeats.has(seat)) {
      nextExitType = 'removed';
    } else if (zeroRoundEliminatedSeats.has(seat)) {
      nextExitType = 'voted_zero_round';
    } else if (otherDayEliminatedSeats.has(seat)) {
      nextExitType = 'voted_day';
    } else if (seat === firstKilledSeat || shotSeats.has(seat)) {
      nextExitType = 'killed';
    } else {
      nextExitType = 'alive';
    }

    const isAlive = nextExitType === 'alive';
    return {
      ...pr,
      exit_type: nextExitType,
      exit_order: isAlive ? null : pr.exit_order,
      removal_reason: nextExitType === 'removed' ? pr.removal_reason : null
    };
  });

  let zeroRoundVotedId: string | null = null;
  const zeroRoundRounds = confirmedVotes.filter((v: any) => v.day_number === 0);
  const day0ElimSeats = zeroRoundRounds.reduce<number[]>((acc, r: any) => [...acc, ...(r.eliminated_seats || [])], []);
  if (day0ElimSeats.length === 1) {
    const targetSeat = day0ElimSeats[0];
    const player = results.find(p => p.seat_number === targetSeat);
    if (player) {
      zeroRoundVotedId = player.participant_id;
    }
  }

  let nextBestMoves = [...(proto.best_moves || [])];
  if (!zeroRoundVotedId) {
    nextBestMoves = nextBestMoves.filter(bm => bm.source !== 'zero_round_voted');
  } else {
    const zrBmIdx = nextBestMoves.findIndex(bm => bm.source === 'zero_round_voted');
    if (zrBmIdx >= 0) {
      nextBestMoves[zrBmIdx] = {
        ...nextBestMoves[zrBmIdx],
        participant_id: zeroRoundVotedId
      };
    }
  }

  const updatedProto = {
    ...proto,
    zero_round_voted_participant_id: zeroRoundVotedId,
    best_moves: nextBestMoves
  };

  return { player_results: updatedResults, protocol: updatedProto };
};

export const recalculateVoteRemainder = (r: any) => {
  return {
    ...r,
    vote_counts: calculateVoteRemainder(r.nominated_seats || [], r.eligible_voters ?? 10, r.vote_counts || {})
  };
};
