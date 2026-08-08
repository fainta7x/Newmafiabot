export type EveningResponseStatus = 'going' | 'late' | 'thinking' | 'declined' | 'unanswered';

export type EveningRegistrationStatus =
  | 'going'
  | 'late'
  | 'thinking'
  | 'declined'
  | 'invited'
  | 'registered'
  | 'confirmed'
  | 'waitlist'
  | 'cancelled';

export const normalizeEveningResponse = (
  registrationStatus?: string | null,
  arrivalStatus?: string | null,
): EveningResponseStatus => {
  switch (registrationStatus) {
    case 'going': return 'going';
    case 'late': return 'late';
    case 'thinking': return 'thinking';
    case 'declined': return 'declined';
    case 'invited': return 'unanswered';
    case 'cancelled': return 'declined';
    case 'waitlist': return 'going';
    case 'registered':
    case 'confirmed':
      return arrivalStatus === 'late' ? 'late' : 'going';
    default:
      return 'unanswered';
  }
};

export const EVENING_RESPONSE_LABELS: Record<EveningResponseStatus, string> = {
  going: 'Иду',
  late: 'Приду позже',
  thinking: 'Пока думаю',
  declined: 'Не иду',
  unanswered: 'Не ответил',
};

export const getEveningResponseLabel = (
  registrationStatus?: string | null,
  arrivalStatus?: string | null,
) => EVENING_RESPONSE_LABELS[normalizeEveningResponse(registrationStatus, arrivalStatus)];

export const isAttendingResponse = (registrationStatus?: string | null, arrivalStatus?: string | null) => {
  const response = normalizeEveningResponse(registrationStatus, arrivalStatus);
  return response === 'going' || response === 'late';
};

export const getEveningTimelineLabel = (participant: {
  registration_status?: string | null;
  arrival_status?: string | null;
  attendance_status?: string | null;
}) => {
  const response = getEveningResponseLabel(participant.registration_status, participant.arrival_status);
  if (participant.attendance_status === 'attended') return `${response} → Пришёл`;
  if (participant.attendance_status === 'no_show') return `${response} → Не пришёл`;
  return response;
};

export const countEveningResponses = <T extends {
  registration_status?: string | null;
  arrival_status?: string | null;
}>(participants: T[]) => {
  const counts = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0, responded: 0, audience: participants.length };
  for (const participant of participants) {
    const response = normalizeEveningResponse(participant.registration_status, participant.arrival_status);
    counts[response] += 1;
    if (response !== 'unanswered') counts.responded += 1;
  }
  return counts;
};
