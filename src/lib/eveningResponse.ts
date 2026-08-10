export const EVENING_RESPONSE_STATUSES = ['going', 'late', 'thinking', 'declined', 'unanswered'] as const;
export type EveningResponseStatus = typeof EVENING_RESPONSE_STATUSES[number];

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

const responseSet = new Set<string>(EVENING_RESPONSE_STATUSES);

export const normalizeEveningResponse = (
  responseStatus: unknown,
  _legacyArrivalStatus?: unknown,
): EveningResponseStatus => {
  const value = String(responseStatus || '').trim().toLowerCase();
  if (responseSet.has(value)) return value as EveningResponseStatus;
  if (value === 'registered' || value === 'confirmed') return 'going';
  if (value === 'cancelled') return 'declined';
  return 'unanswered';
};

export const getEveningResponse = (participant: any): EveningResponseStatus =>
  normalizeEveningResponse(participant?.response_status ?? participant?.registration_status);

export const getEveningResponseLabel = (participantOrStatus: any): string => {
  const status = typeof participantOrStatus === 'string'
    ? normalizeEveningResponse(participantOrStatus)
    : getEveningResponse(participantOrStatus);
  return EVENING_RESPONSE_LABELS[status];
};

export const getEveningAttendanceFact = (participant: any): EveningAttendanceFact => {
  const attendance = String(participant?.attendance_status || 'pending').toLowerCase();
  const arrival = String(participant?.arrival_status || 'unknown').toLowerCase();
  if (attendance === 'no_show') return 'no_show';
  if (attendance === 'attended') return arrival === 'late' ? 'attended_late' : 'attended_on_time';
  return 'pending';
};

export const getEveningAttendanceLabel = (participant: any): string =>
  EVENING_ATTENDANCE_LABELS[getEveningAttendanceFact(participant)];

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