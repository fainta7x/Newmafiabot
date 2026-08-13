export type RotationTeam = 'red' | 'black';

export type RotationPlayerResult = {
  participant_id: string;
  seat_number?: number | null;
  role?: string | null;
  exit_type?: string | null;
  exit_order?: number | null;
  notes?: string | null;
};

export type RotationProtocol = {
  winner_team?: RotationTeam | string | null;
  first_killed_participant_id?: string | null;
  zero_round_voted_participant_id?: string | null;
  votes?: Array<{
    day_number?: number | null;
    eliminated_seats?: number[] | null;
    outcome?: string | null;
  }> | null;
  shots?: Array<{
    night_number?: number | null;
    target_seat?: number | null;
    result?: string | null;
  }> | null;
};

export type RotationPreviousGame = {
  protocol: RotationProtocol;
  player_results: RotationPlayerResult[];
};

export type RotationCandidate = {
  id: string;
  nickname?: string | null;
  play_count?: number | null;
};

export type RotationPriorityReason = 'sat_out' | 'early_exit' | 'winner' | 'loser';

const normalizeRole = (value: unknown) => String(value || '').trim().toLocaleLowerCase('ru-RU');

export const rotationTeamFromRole = (role: unknown): RotationTeam | null => {
  const value = normalizeRole(role);
  if (['mafia', 'don', 'мафия', 'дон', 'black', 'чёрные', 'черные'].includes(value)) return 'black';
  if (['citizen', 'sheriff', 'мирный', 'мирянин', 'шериф', 'red', 'красные'].includes(value)) return 'red';
  return null;
};

const finiteOrder = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const scoreFromNote = (note: unknown): number | null => {
  const value = String(note || '');
  const day = value.match(/День\s*(\d+)/i);
  if (day) return Number(day[1]) * 2 - 1;
  const night = value.match(/Ночь\s*(\d+)/i);
  if (night) return Number(night[1]) * 2;
  return null;
};

const scoreFromProtocol = (result: RotationPlayerResult, protocol: RotationProtocol): number | null => {
  const seat = Number(result.seat_number || 0);
  if (!seat) return null;

  let best: number | null = null;
  const accept = (score: number) => { best = best == null ? score : Math.min(best, score); };

  for (const vote of protocol.votes || []) {
    if (!Array.isArray(vote?.eliminated_seats) || !vote.eliminated_seats.includes(seat)) continue;
    const day = Number(vote.day_number || 0);
    accept(day <= 0 ? 0 : day * 2 - 1);
  }
  for (const shot of protocol.shots || []) {
    if (shot?.result !== 'killed' || Number(shot.target_seat || 0) !== seat) continue;
    const night = Math.max(1, Number(shot.night_number || 1));
    accept(night * 2);
  }
  return best;
};

/**
 * Relative time a player stayed in the previous game.
 * Smaller means the player left earlier; Infinity means they survived to the end
 * (or legacy data does not contain a reliable exit moment).
 */
export const rotationSurvivalScore = (
  result: RotationPlayerResult,
  protocol: RotationProtocol,
): number => {
  if (String(result.exit_type || 'alive') === 'alive') return Number.POSITIVE_INFINITY;
  const explicit = finiteOrder(result.exit_order);
  if (explicit != null) return explicit;
  const fromProtocol = scoreFromProtocol(result, protocol);
  if (fromProtocol != null) return fromProtocol;
  const fromNote = scoreFromNote(result.notes);
  if (fromNote != null) return fromNote;
  return Number.POSITIVE_INFINITY;
};

export const getRotationPriority = (
  participantId: string,
  previousGame: RotationPreviousGame | null | undefined,
): { tier: number; reason: RotationPriorityReason; survival: number } => {
  if (!previousGame) return { tier: 0, reason: 'sat_out', survival: 0 };

  const result = previousGame.player_results.find((item) => String(item.participant_id) === String(participantId));
  if (!result) return { tier: 0, reason: 'sat_out', survival: 0 };

  const protocol = previousGame.protocol || {};
  const special = [protocol.first_killed_participant_id, protocol.zero_round_voted_participant_id]
    .filter(Boolean)
    .map(String)
    .includes(String(participantId));
  if (special) return { tier: 1, reason: 'early_exit', survival: rotationSurvivalScore(result, protocol) };

  const team = rotationTeamFromRole(result.role);
  if (team && team === protocol.winner_team) return { tier: 2, reason: 'winner', survival: rotationSurvivalScore(result, protocol) };

  return { tier: 3, reason: 'loser', survival: rotationSurvivalScore(result, protocol) };
};

/**
 * Club rotation, highest priority first:
 * 1) players who sat out the previous game;
 * 2) first killed and singular zero-round elimination;
 * 3) winning team;
 * 4) losing team, with earlier exits before players who stayed longer.
 *
 * Total games played during the evening is only a tie-break inside the same class.
 */
export const sortEveningRotationCandidates = <T extends RotationCandidate>(
  candidates: T[],
  previousGame: RotationPreviousGame | null | undefined,
): T[] => candidates.slice().sort((a, b) => {
  const left = getRotationPriority(a.id, previousGame);
  const right = getRotationPriority(b.id, previousGame);
  if (left.tier !== right.tier) return left.tier - right.tier;
  if (left.reason === 'loser' && left.survival !== right.survival) return left.survival - right.survival;
  const playDiff = Number(a.play_count || 0) - Number(b.play_count || 0);
  if (playDiff !== 0) return playDiff;
  return String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru');
});
