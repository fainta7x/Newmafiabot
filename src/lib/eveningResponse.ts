import {
  CANONICAL_EVENING_RESPONSES,
  normalizeCanonicalEveningAttendance,
  normalizeCanonicalEveningResponse,
  type CanonicalEveningResponse,
} from './eveningDomain.ts';

export const EVENING_RESPONSE_STATUSES = CANONICAL_EVENING_RESPONSES;
export type EveningResponseStatus = CanonicalEveningResponse;

export const EVENING_ATTENDANCE_FACTS = ['pending', 'attended_on_time', 'attended_late', 'no_show'] as const;
export type EveningAttendanceFact = typeof EVENING_ATTENDANCE_FACTS[number];

export const EVENING_RESPONSE_LABELS: Record<EveningResponseStatus, string> = {
  going: 'Иду',
  late: 'Приду позже',
  thinking: 'Пока думаю',
  declined: 'Не иду',
  unanswered: 'Не ответил',
};

export const EVENING_ATTENDANCE_LABELS: Record<EveningAttendanceFact, string> = {
  pending: 'Явка не отмечена',
  attended_on_time: 'Пришёл вовремя',
  attended_late: 'Пришёл позже',
  no_show: 'Не пришёл',
};

/**
 * Public compatibility adapter used by the current CRM/API layer.
 * Canonical response normalization lives in eveningDomain.ts.
 */
export const normalizeEveningResponse = (
  responseStatus: unknown,
  legacyArrivalStatus?: unknown,
): EveningResponseStatus => normalizeCanonicalEveningResponse(responseStatus, legacyArrivalStatus);

export const getEveningResponse = (participant: any): EveningResponseStatus =>
  normalizeEveningResponse(
    participant?.response_status ?? participant?.registration_status,
    participant?.arrival_status,
  );

export const getEveningResponseLabel = (
  participantOrStatus: any,
  legacyArrivalStatus?: unknown,
): string => {
  const status = typeof participantOrStatus === 'string'
    ? normalizeEveningResponse(participantOrStatus, legacyArrivalStatus)
    : getEveningResponse(participantOrStatus);
  return EVENING_RESPONSE_LABELS[status];
};

/**
 * The current UI has four attendance states. Full-fidelity persisted attendance
 * is normalized in eveningDomain.ts; legacy attended_unknown is intentionally
 * projected as attended_on_time here to preserve the existing UI/API contract.
 */
export const getEveningAttendanceFact = (participant: any): EveningAttendanceFact => {
  const canonical = normalizeCanonicalEveningAttendance(
    participant?.attendance_status,
    participant?.arrival_status,
  );
  if (canonical === 'no_show') return 'no_show';
  if (canonical === 'late') return 'attended_late';
  if (canonical === 'on_time' || canonical === 'attended_unknown') return 'attended_on_time';
  return 'pending';
};

export const getEveningAttendanceLabel = (participant: any): string =>
  EVENING_ATTENDANCE_LABELS[getEveningAttendanceFact(participant)];

export const getEveningTimelineLabel = (participant: any): string => {
  const response = getEveningResponseLabel(participant);
  const attendance = getEveningAttendanceFact(participant);
  return attendance === 'pending'
    ? response
    : `${response} → ${EVENING_ATTENDANCE_LABELS[attendance]}`;
};

export const isAttendingResponse = (statusOrParticipant: any): boolean => {
  const status = typeof statusOrParticipant === 'string'
    ? normalizeEveningResponse(statusOrParticipant)
    : getEveningResponse(statusOrParticipant);
  return status === 'going' || status === 'late';
};

export const isActuallyPresent = (participant: any): boolean => {
  const fact = getEveningAttendanceFact(participant);
  return fact === 'attended_on_time' || fact === 'attended_late';
};

export const countEveningResponses = (participants: any[]) => {
  const counts = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0, responded: 0, audience: participants.length };
  for (const participant of participants) counts[getEveningResponse(participant)] += 1;
  counts.responded = counts.audience - counts.unanswered;
  return counts;
};
