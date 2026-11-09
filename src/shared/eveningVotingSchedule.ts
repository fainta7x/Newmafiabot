/**
 * «MVP вечера»: when the poll opens, when voting ends and when the additional vote between tied leaders ends
 * (owner, 2026-11-09; docs/BUSINESS_RULES.md «MVP вечера: schedule of the vote»). One place for the app, the bot, the
 * group posts, the year awards and the cards. All wall-clock times are Moscow time (UTC+3, no daylight saving).
 */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FRIDAY = 5;

export const VOTE_POLL_HOUR_MSK = 12;
export const VOTE_END_HOUR_MSK = 21;

export interface EveningVotingSchedule {
  /** The poll goes out and voting opens: the next day 12:00, or right after a late closing. */
  openAtMs: number;
  /** The first round ends. */
  deadlineMs: number;
  /** The additional vote between tied leaders ends. */
  runoffDeadlineMs: number;
}

type EveningTimes = { starts_at?: unknown; settled_at?: unknown; updated_at?: unknown };

const ms = (value: unknown) => new Date(String(value ?? '')).getTime();

/**
 * Friday evening: Saturday 12:00 → Tuesday 21:00 → (additional vote) Thursday 21:00.
 * Any other day: next day 12:00 → 3rd day 21:00 → 5th day 21:00.
 * An evening closed after the poll time is polled right after its closing; closed after the end of voting it has no poll
 * (`openAtMs` is then after `deadlineMs`).
 */
export function eveningVotingSchedule(evening: EveningTimes): EveningVotingSchedule | null {
  let start = ms(evening.starts_at);
  if (!Number.isFinite(start)) start = ms(evening.settled_at ?? evening.updated_at);
  if (!Number.isFinite(start)) return null;
  const midnightMsk = Math.floor((start + MSK_OFFSET_MS) / DAY_MS) * DAY_MS; // Moscow midnight, shifted by the offset
  const friday = new Date(midnightMsk).getUTCDay() === FRIDAY;
  const at = (dayOffset: number, hour: number) => midnightMsk + dayOffset * DAY_MS + hour * HOUR_MS - MSK_OFFSET_MS;
  const scheduledOpen = at(1, VOTE_POLL_HOUR_MSK);
  const closedAt = ms(evening.settled_at ?? evening.updated_at);
  return {
    openAtMs: Number.isFinite(closedAt) ? Math.max(scheduledOpen, closedAt) : scheduledOpen,
    deadlineMs: at(friday ? 4 : 3, VOTE_END_HOUR_MSK),
    runoffDeadlineMs: at(friday ? 6 : 5, VOTE_END_HOUR_MSK),
  };
}

/** The first round is open now. */
export const isVotingOpen = (schedule: EveningVotingSchedule | null, now = Date.now()) =>
  Boolean(schedule) && now >= schedule!.openAtMs && now < schedule!.deadlineMs;
