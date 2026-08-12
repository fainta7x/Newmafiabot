export const CANONICAL_EVENING_RESPONSES = [
  'going',
  'late',
  'thinking',
  'declined',
  'unanswered',
] as const;

export type CanonicalEveningResponse = typeof CANONICAL_EVENING_RESPONSES[number];

export const CANONICAL_EVENING_ATTENDANCE = [
  'pending',
  'on_time',
  'late',
  'no_show',
  'attended_unknown',
] as const;

export type CanonicalEveningAttendance = typeof CANONICAL_EVENING_ATTENDANCE[number];

export type PhysicalAttendanceStatus = 'pending' | 'attended' | 'no_show';
export type PhysicalArrivalStatus = 'unknown' | 'on_time' | 'late';

export interface PhysicalAttendancePair {
  attendance_status: PhysicalAttendanceStatus;
  arrival_status: PhysicalArrivalStatus;
}

const canonicalResponseSet = new Set<string>(CANONICAL_EVENING_RESPONSES);

/**
 * Single normalization rule for current response_status values and legacy
 * registration_status values. Current canonical values always pass through
 * unchanged. Legacy waitlist is not a reserve state in the current product:
 * without an explicit historical late marker it means that no answer exists.
 */
export function normalizeCanonicalEveningResponse(
  value: unknown,
  legacyArrivalStatus?: unknown,
): CanonicalEveningResponse {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (canonicalResponseSet.has(normalized)) {
    return normalized as CanonicalEveningResponse;
  }

  const legacyLate = String(legacyArrivalStatus ?? '').trim().toLowerCase() === 'late';

  switch (normalized) {
    case 'registered':
    case 'confirmed':
      return legacyLate ? 'late' : 'going';
    case 'waitlist':
      return legacyLate ? 'late' : 'unanswered';
    case 'cancelled':
      return 'declined';
    case 'invited':
    case '':
      return 'unanswered';
    default:
      return 'unanswered';
  }
}

/**
 * Tolerant read projection for persisted attendance. It preserves the legacy
 * "attended, but exact arrival time is unknown" state instead of guessing.
 * UI adapters may intentionally collapse attended_unknown for old screens.
 */
export function normalizeCanonicalEveningAttendance(
  attendanceStatus: unknown,
  arrivalStatus: unknown,
): CanonicalEveningAttendance {
  const attendance = String(attendanceStatus ?? '').trim().toLowerCase();
  const arrival = String(arrivalStatus ?? '').trim().toLowerCase();

  if (attendance === 'no_show') return 'no_show';
  if (attendance === 'attended') {
    if (arrival === 'late') return 'late';
    if (arrival === 'on_time') return 'on_time';
    return 'attended_unknown';
  }
  return 'pending';
}

/**
 * Converts a valid persisted physical attendance pair into the full-fidelity
 * canonical attendance domain. Impossible combinations throw rather than
 * being silently repaired on a write-oriented path.
 */
export function attendanceFactFromPhysicalPair(
  attendanceStatus: unknown,
  arrivalStatus: unknown,
): CanonicalEveningAttendance {
  const attendance = String(attendanceStatus ?? '').trim().toLowerCase();
  const arrival = String(arrivalStatus ?? '').trim().toLowerCase();

  if (attendance === 'pending' && arrival === 'unknown') return 'pending';
  if (attendance === 'attended' && arrival === 'on_time') return 'on_time';
  if (attendance === 'attended' && arrival === 'late') return 'late';
  if (attendance === 'attended' && arrival === 'unknown') return 'attended_unknown';
  if (attendance === 'no_show' && arrival === 'unknown') return 'no_show';

  throw new Error(`Impossible evening attendance pair: ${attendance || '<empty>'} + ${arrival || '<empty>'}`);
}

/**
 * Converts a writable canonical attendance fact back to the persisted physical pair.
 * attended_unknown is legacy/read-only and must never be created by a new write.
 */
export function physicalPairFromAttendanceFact(
  fact: CanonicalEveningAttendance,
): PhysicalAttendancePair {
  switch (fact) {
    case 'pending':
      return { attendance_status: 'pending', arrival_status: 'unknown' };
    case 'on_time':
      return { attendance_status: 'attended', arrival_status: 'on_time' };
    case 'late':
      return { attendance_status: 'attended', arrival_status: 'late' };
    case 'no_show':
      return { attendance_status: 'no_show', arrival_status: 'unknown' };
    case 'attended_unknown':
      throw new Error('attended_unknown is read-only and cannot be written');
    default: {
      const exhaustive: never = fact;
      throw new Error(`Unsupported evening attendance fact: ${String(exhaustive)}`);
    }
  }
}

export function isExpectedEveningParticipant(response: CanonicalEveningResponse): boolean {
  return response === 'going' || response === 'late';
}

export function isActualEveningAttendee(attendance: CanonicalEveningAttendance): boolean {
  return attendance === 'on_time' || attendance === 'late' || attendance === 'attended_unknown';
}

export function isEveningGameRosterEligible(
  response: CanonicalEveningResponse,
  attendance: CanonicalEveningAttendance,
): boolean {
  if (attendance === 'no_show') return false;
  if (isActualEveningAttendee(attendance)) return true;
  return attendance === 'pending' && isExpectedEveningParticipant(response);
}
