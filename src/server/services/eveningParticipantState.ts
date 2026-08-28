import type { DatabaseWrapper } from '../../db/index.ts';
import {
  EVENING_ATTENDANCE_FACTS,
  EVENING_RESPONSE_STATUSES,
  getEveningAttendanceFact,
  getEveningResponse,
  type EveningAttendanceFact,
  type EveningResponseStatus,
} from '../../lib/eveningResponse.ts';

export class EveningParticipantStateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'EveningParticipantStateError';
    this.status = status;
  }
}

export const parseResponseStatus = (value: unknown): EveningResponseStatus => {
  if (!EVENING_RESPONSE_STATUSES.includes(value as EveningResponseStatus)) {
    throw new EveningParticipantStateError('Некорректный ответ игрока');
  }
  return value as EveningResponseStatus;
};

export const parseAttendanceFact = (value: unknown): EveningAttendanceFact => {
  if (!EVENING_ATTENDANCE_FACTS.includes(value as EveningAttendanceFact)) {
    throw new EveningParticipantStateError('Некорректная фактическая явка');
  }
  return value as EveningAttendanceFact;
};

export const serializeEveningParticipant = <T extends Record<string, any>>(row: T): T & {
  response_status: EveningResponseStatus;
  attendance_fact: EveningAttendanceFact;
} => ({
  ...row,
  response_status: getEveningResponse(row),
  attendance_fact: getEveningAttendanceFact(row),
});

export async function setParticipantResponse(db: DatabaseWrapper, participantId: string, status: EveningResponseStatus) {
  const now = new Date().toISOString();
  const confirmedAt = status === 'going' || status === 'late' ? now : null;
  await db.run(
    `UPDATE evening_participants
        SET response_status = ?, registration_status = ?, confirmed_at = ?, updated_at = ?
      WHERE id = ?`,
    [status, status, confirmedAt, now, participantId],
  );
}

export async function setParticipantAttendance(db: DatabaseWrapper, participantId: string, fact: EveningAttendanceFact) {
  const now = new Date().toISOString();
  const values: Record<EveningAttendanceFact, [string, string, string | null]> = {
    pending: ['pending', 'unknown', null],
    attended_on_time: ['attended', 'on_time', now],
    attended_late: ['attended', 'late', now],
    no_show: ['no_show', 'unknown', null],
  };
  const [attendanceStatus, arrivalStatus, checkedInAt] = values[fact];
  await db.run(
    `UPDATE evening_participants
        SET attendance_status = ?, arrival_status = ?, checked_in_at = ?, updated_at = ?
      WHERE id = ?`,
    [attendanceStatus, arrivalStatus, checkedInAt, now, participantId],
  );
}

export const legacyAttendancePatchToFact = (
  current: any,
  attendanceStatus: unknown,
  arrivalStatus: unknown,
): EveningAttendanceFact | null => {
  if (attendanceStatus === undefined && arrivalStatus === undefined) return null;
  const attendance = attendanceStatus === undefined ? current.attendance_status : attendanceStatus;
  const arrival = arrivalStatus === undefined ? current.arrival_status : arrivalStatus;
  if (attendance === 'no_show') return 'no_show';
  if (attendance === 'pending') return 'pending';
  if (attendance === 'attended') return arrival === 'late' ? 'attended_late' : 'attended_on_time';
  throw new EveningParticipantStateError('Некорректная комбинация фактической явки');
};
