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
