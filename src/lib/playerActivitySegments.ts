export type PlayerActivitySegment = 'lead' | 'active' | 'loyal' | 'inactive';

type ActivityPlayer = {
  id?: string;
  nickname?: string | null;
  engagement_stage?: string | null;
  attendance_count?: number | null;
  days_since_last_visit?: number | null;
};

export const getPlayerActivitySegment = (player: ActivityPlayer): PlayerActivitySegment => {
  const stage = player.engagement_stage;
  if (stage === 'regular') return 'loyal';
  if (stage === 'newcomer' || stage === 'returning') return 'active';
  if (stage === 'inactive') return 'inactive';
  return 'lead';
};

const activityRank = (player: ActivityPlayer) => {
  const segment = getPlayerActivitySegment(player);
  if (segment === 'loyal') return 0;
  if (segment === 'active') return 1;
  if (segment === 'inactive') return 2;
  return 3;
};

export const sortPlayersForActivity = <T extends ActivityPlayer>(players: T[]): T[] => (
  [...players].sort((left, right) => {
    const rankDelta = activityRank(left) - activityRank(right);
    if (rankDelta !== 0) return rankDelta;

    const attendanceDelta = Number(right.attendance_count || 0) - Number(left.attendance_count || 0);
    if (attendanceDelta !== 0) return attendanceDelta;

    const leftDays = left.days_since_last_visit == null ? Number.POSITIVE_INFINITY : Number(left.days_since_last_visit);
    const rightDays = right.days_since_last_visit == null ? Number.POSITIVE_INFINITY : Number(right.days_since_last_visit);
    if (leftDays !== rightDays) return leftDays - rightDays;

    return String(left.nickname || '').localeCompare(String(right.nickname || ''), 'ru');
  })
);

/*
 * «Игроки → База» tabs follow the organizer's own statuses from «Роли» (owner decision 2026-09-30),
 * not visit counting: «Перестал ходить» wins, then the «Новичок» game level, then «Как часто ходит».
 * A guest from another city has a tab of their own (owner, 2026-09-30). Visits are only shown next to the name.
 */
export type PlayerStatusSegment = 'regular' | 'sometimes' | 'other_city' | 'novice' | 'stopped';

type StatusPlayer = {
  game_level?: string | null;
  club_role?: string | null;
  attends_sometimes?: number | boolean | null;
  stopped_attending?: number | boolean | null;
  from_other_city?: number | boolean | null;
  contact_status?: string | null;
  pause_reason?: string | null;
  stored_lifecycle_status?: string | null;
  source?: string | null;
};

export const STATUS_SEGMENT_LABELS: Record<PlayerStatusSegment, string> = {
  regular: 'Ходит постоянно', sometimes: 'Ходит иногда', other_city: 'Из другого города', novice: 'Новичок', stopped: 'Перестал ходить',
};

const STOPPED = 'Перестал ходить';

/** Service rows (merged guests, placeholders, archive) are not club players and stay only in «Вся база». */
export const isClubPlayer = (player: StatusPlayer) =>
  !['archived', 'guest_placeholder', 'legacy_guest_migrated'].includes(String(player.stored_lifecycle_status || ''))
  && String(player.source || '') !== 'legacy_guest_migrated';

export const getPlayerStatusSegment = (player: StatusPlayer): PlayerStatusSegment => {
  if (Number(player.stopped_attending || 0) === 1 || (player.contact_status === 'paused' && player.pause_reason === STOPPED)) return 'stopped';
  if (player.game_level === 'novice' || player.game_level === 'unrated') return 'novice';
  if (Number(player.from_other_city || 0) === 1) return 'other_city';
  if (player.club_role === 'guest' || Number(player.attends_sometimes || 0) === 1) return 'sometimes';
  return 'regular';
};
