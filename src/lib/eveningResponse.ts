export type EveningResponseStatus = 'unanswered' | 'going' | 'late' | 'thinking' | 'declined';
export type ActualAttendanceFact = 'pending' | 'on_time' | 'late' | 'no_show' | 'attended_unknown';
export type WritableAttendanceFact = Exclude<ActualAttendanceFact, 'attended_unknown'>;

export const EVENING_RESPONSE_STATUSES: EveningResponseStatus[] = ['unanswered', 'going', 'late', 'thinking', 'declined'];
export const WRITABLE_ATTENDANCE_FACTS: WritableAttendanceFact[] = ['pending', 'on_time', 'late', 'no_show'];

export const EVENING_RESPONSE_LABELS: Record<EveningResponseStatus, string> = {
  unanswered: 'Не ответил', going: 'Иду', late: 'Приду позже', thinking: 'Пока думаю', declined: 'Не иду',
};
export const ATTENDANCE_FACT_LABELS: Record<ActualAttendanceFact, string> = {
  pending: 'Не отмечено', on_time: 'Пришёл вовремя', late: 'Пришёл позже', no_show: 'Не пришёл', attended_unknown: 'Пришёл, время не указано',
};

export const isCanonicalEveningResponse = (value: unknown): value is EveningResponseStatus =>
  typeof value === 'string' && EVENING_RESPONSE_STATUSES.includes(value as EveningResponseStatus);

// Compatibility boundary only. New business code reads response_status.
export const normalizeLegacyEveningResponseInput = (value: unknown): EveningResponseStatus => {
  if (isCanonicalEveningResponse(value)) return value;
  switch (String(value || '').trim()) {
    case 'registered': case 'confirmed': case 'waitlist': return 'going';
    case 'cancelled': return 'declined';
    case 'invited': default: return 'unanswered';
  }
};

export const normalizeEveningResponse = (responseStatus?: string | null, legacyRegistrationStatus?: string | null): EveningResponseStatus => {
  if (isCanonicalEveningResponse(responseStatus)) return responseStatus;
  return normalizeLegacyEveningResponseInput(responseStatus || legacyRegistrationStatus);
};

export const isExpectedEveningResponse = (value: unknown) => {
  const status = normalizeEveningResponse(String(value ?? ''));
  return status === 'going' || status === 'late';
};
export const isAttendingResponse = isExpectedEveningResponse;

export const getActualAttendanceFact = (
  attendanceStatus?: string | null,
  arrivalStatus?: string | null,
): ActualAttendanceFact | null => {
  if (attendanceStatus === 'pending' && arrivalStatus === 'unknown') return 'pending';
  if (attendanceStatus === 'attended' && arrivalStatus === 'on_time') return 'on_time';
  if (attendanceStatus === 'attended' && arrivalStatus === 'late') return 'late';
  if (attendanceStatus === 'attended' && arrivalStatus === 'unknown') return 'attended_unknown';
  if (attendanceStatus === 'no_show' && arrivalStatus === 'unknown') return 'no_show';
  return null;
};

export const isActualAttendee = (fact: ActualAttendanceFact | null) =>
  fact === 'on_time' || fact === 'late' || fact === 'attended_unknown';

export interface AttendancePhysicalState {
  attendance_status: 'pending' | 'attended' | 'no_show';
  arrival_status: 'unknown' | 'on_time' | 'late';
  checked_in_at?: string | null;
}
export interface AttendanceWriteInput {
  attendance_fact?: string | null;
  attendance_status?: string | null;
  arrival_status?: string | null;
}

export const physicalStateForAttendanceFact = (
  fact: WritableAttendanceFact,
  currentCheckedInAt?: string | null,
  now: string = new Date().toISOString(),
): AttendancePhysicalState => {
  if (fact === 'pending') return { attendance_status: 'pending', arrival_status: 'unknown', checked_in_at: null };
  if (fact === 'no_show') return { attendance_status: 'no_show', arrival_status: 'unknown', checked_in_at: null };
  return { attendance_status: 'attended', arrival_status: fact === 'late' ? 'late' : 'on_time', checked_in_at: currentCheckedInAt || now };
};

export const resolveAttendanceWrite = (
  current: AttendancePhysicalState,
  input: AttendanceWriteInput,
  now: string = new Date().toISOString(),
): AttendancePhysicalState | null => {
  const hasCanonical = input.attendance_fact !== undefined;
  const hasLegacy = input.attendance_status !== undefined || input.arrival_status !== undefined;
  if (!hasCanonical && !hasLegacy) return null;

  let canonicalFact: WritableAttendanceFact | null = null;
  if (hasCanonical) {
    if (!WRITABLE_ATTENDANCE_FACTS.includes(input.attendance_fact as WritableAttendanceFact)) {
      throw new Error('Недопустимое значение attendance_fact');
    }
    canonicalFact = input.attendance_fact as WritableAttendanceFact;
  }

  let legacyFact: ActualAttendanceFact | null = null;
  if (hasLegacy) {
    const attendance = input.attendance_status ?? current.attendance_status;
    const arrival = input.arrival_status ?? current.arrival_status;
    legacyFact = getActualAttendanceFact(attendance, arrival);
    if (!legacyFact) throw new Error('Противоречивые attendance_status и arrival_status');
    if (legacyFact === 'attended_unknown') throw new Error('Новая запись attended_unknown запрещена: укажите вовремя или позже');
  }
  if (canonicalFact && legacyFact && canonicalFact !== legacyFact) {
    throw new Error('attendance_fact конфликтует с legacy-полями явки');
  }
  return physicalStateForAttendanceFact(canonicalFact || legacyFact as WritableAttendanceFact, current.checked_in_at, now);
};

export const countEveningResponses = (participants: Array<{ response_status?: string | null; registration_status?: string | null }>) => {
  const counts = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0, responded: 0, audience: participants.length };
  for (const participant of participants) {
    const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
    counts[response] += 1;
    if (response !== 'unanswered') counts.responded += 1;
  }
  return counts;
};

export const getEveningResponseLabel = (responseStatus?: string | null, legacyRegistrationStatus?: string | null) =>
  EVENING_RESPONSE_LABELS[normalizeEveningResponse(responseStatus, legacyRegistrationStatus)];

export const isEveningParticipantEligibleForGame = (participant: {
  response_status?: string | null;
  registration_status?: string | null;
  attendance_status?: string | null;
  arrival_status?: string | null;
}) => {
  const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status);
  if (fact === 'no_show' || fact === null) return false;
  if (isActualAttendee(fact)) return true;
  const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
  return fact === 'pending' && (response === 'going' || response === 'late');
};
