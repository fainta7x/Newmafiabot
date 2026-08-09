export type TournamentNominationCategory =
  | 'mvp'
  | 'best_citizen'
  | 'best_mafia'
  | 'best_sheriff'
  | 'best_don';

export type NominationCriterion = 'points' | 'additional_points' | 'role_wins' | 'head_to_head' | 'exact_tie';

export interface NominationComparatorCandidate {
  participant_id: string;
  display_name: string;
  /** Canonical "Баллы": accumulated judge score in eligible games. */
  points: number;
  /** Canonical "Доп. баллы": protocol bonus + best-move points in eligible games. */
  additional_points: number;
  /** Wins specifically as Sheriff/Don. Used only by those two nominations. */
  role_wins: number;
}

export interface NominationHeadToHeadParticipant {
  participant_id: string;
  team: 'red' | 'black';
}

export interface NominationHeadToHeadGame {
  game_id: string;
  game_number: number;
  winner_team: 'red' | 'black' | null;
  participants: NominationHeadToHeadParticipant[];
}

export interface NominationComparatorStage {
  criterion: Exclude<NominationCriterion, 'exact_tie'>;
  candidate_ids: string[];
  values: Record<string, number>;
  advancing_ids: string[];
  decisive: boolean;
}

export interface NominationComparatorResult {
  winner_participant_id: string | null;
  tied_participant_ids: string[];
  has_exact_tie: boolean;
  decisive_criterion: NominationCriterion | null;
  decisive_value: number | null;
  head_to_head_scores: Record<string, number> | null;
  stages: NominationComparatorStage[];
}

const EPSILON = 0.0001;

const equalNumber = (a: number, b: number) => Math.abs(a - b) < EPSILON;
const stableIds = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));

function filterMax(
  candidates: NominationComparatorCandidate[],
  getValue: (candidate: NominationComparatorCandidate) => number,
) {
  if (candidates.length === 0) return { max: 0, advancing: [] as NominationComparatorCandidate[] };
  const max = Math.max(...candidates.map(getValue));
  return {
    max,
    advancing: candidates.filter((candidate) => equalNumber(getValue(candidate), max)),
  };
}

export function calculateNominationHeadToHeadScores(
  candidates: NominationComparatorCandidate[],
  games: NominationHeadToHeadGame[],
): Record<string, number> {
  const ids = new Set(candidates.map((candidate) => candidate.participant_id));
  const result: Record<string, number> = {};
  for (const candidate of candidates) result[candidate.participant_id] = 0;

  for (const game of games) {
    if (!game.winner_team) continue;
    const participants = game.participants.filter((participant) => ids.has(participant.participant_id));
    if (participants.length < 2) continue;

    for (const participant of participants) {
      const hasDifferentTeamOpponent = participants.some(
        (other) => other.participant_id !== participant.participant_id && other.team !== participant.team,
      );
      if (!hasDifferentTeamOpponent) continue;
      if (participant.team === game.winner_team) {
        // A qualifying game counts once for a candidate even if several tied opponents
        // happened to be on the opposite team in the same game.
        result[participant.participant_id] += 1;
      }
    }
  }

  return result;
}

export function compareTournamentNominationCandidates(
  category: TournamentNominationCategory,
  candidates: NominationComparatorCandidate[],
  games: NominationHeadToHeadGame[],
): NominationComparatorResult {
  if (candidates.length === 0) {
    return {
      winner_participant_id: null,
      tied_participant_ids: [],
      has_exact_tie: false,
      decisive_criterion: null,
      decisive_value: null,
      head_to_head_scores: null,
      stages: [],
    };
  }

  let remaining = [...candidates];
  const stages: NominationComparatorStage[] = [];

  const applyNumericStage = (
    criterion: 'points' | 'additional_points' | 'role_wins',
    getValue: (candidate: NominationComparatorCandidate) => number,
  ) => {
    const before = [...remaining];
    const { max, advancing } = filterMax(before, getValue);
    const decisive = advancing.length === 1 && before.length > 1;
    stages.push({
      criterion,
      candidate_ids: stableIds(before.map((candidate) => candidate.participant_id)),
      values: Object.fromEntries(before.map((candidate) => [candidate.participant_id, getValue(candidate)])),
      advancing_ids: stableIds(advancing.map((candidate) => candidate.participant_id)),
      decisive,
    });
    remaining = advancing;
    return { decisive, value: max };
  };

  const primary = applyNumericStage('points', (candidate) => candidate.points);
  if (remaining.length === 1) {
    return {
      winner_participant_id: remaining[0].participant_id,
      tied_participant_ids: [],
      has_exact_tie: false,
      decisive_criterion: 'points',
      decisive_value: primary.value,
      head_to_head_scores: null,
      stages,
    };
  }

  const additional = applyNumericStage('additional_points', (candidate) => candidate.additional_points);
  if (remaining.length === 1) {
    return {
      winner_participant_id: remaining[0].participant_id,
      tied_participant_ids: [],
      has_exact_tie: false,
      decisive_criterion: 'additional_points',
      decisive_value: additional.value,
      head_to_head_scores: null,
      stages,
    };
  }

  if (category === 'best_sheriff' || category === 'best_don') {
    const roleWins = applyNumericStage('role_wins', (candidate) => candidate.role_wins);
    if (remaining.length === 1) {
      return {
        winner_participant_id: remaining[0].participant_id,
        tied_participant_ids: [],
        has_exact_tie: false,
        decisive_criterion: 'role_wins',
        decisive_value: roleWins.value,
        head_to_head_scores: null,
        stages,
      };
    }
  }

  const beforeHeadToHead = [...remaining];
  const headToHeadScores = calculateNominationHeadToHeadScores(beforeHeadToHead, games);
  const maxHeadToHead = Math.max(...beforeHeadToHead.map((candidate) => headToHeadScores[candidate.participant_id] || 0));
  const advancing = beforeHeadToHead.filter(
    (candidate) => (headToHeadScores[candidate.participant_id] || 0) === maxHeadToHead,
  );
  stages.push({
    criterion: 'head_to_head',
    candidate_ids: stableIds(beforeHeadToHead.map((candidate) => candidate.participant_id)),
    values: Object.fromEntries(beforeHeadToHead.map((candidate) => [candidate.participant_id, headToHeadScores[candidate.participant_id] || 0])),
    advancing_ids: stableIds(advancing.map((candidate) => candidate.participant_id)),
    decisive: advancing.length === 1,
  });

  if (advancing.length === 1) {
    return {
      winner_participant_id: advancing[0].participant_id,
      tied_participant_ids: [],
      has_exact_tie: false,
      decisive_criterion: 'head_to_head',
      decisive_value: maxHeadToHead,
      head_to_head_scores: headToHeadScores,
      stages,
    };
  }

  return {
    winner_participant_id: null,
    tied_participant_ids: stableIds(advancing.map((candidate) => candidate.participant_id)),
    has_exact_tie: true,
    decisive_criterion: 'exact_tie',
    decisive_value: null,
    head_to_head_scores: headToHeadScores,
    stages,
  };
}
