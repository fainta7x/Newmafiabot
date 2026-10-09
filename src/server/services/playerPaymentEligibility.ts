import { isAttendingResponse } from '../../lib/eveningResponse.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';

export const isSettledEvening = (row: any): boolean =>
  String(row.evening_status || '') === 'completed' || Boolean(row.settled_at);

// Shared with the wallet: novices pay only after arrival; closed evenings require attendance.
export const isPaymentExpected = (row: any): boolean => {
  const attended = String(row.attendance_status || '') === 'attended';
  if (isSettledEvening(row) || normalizeEveningFormat(row.evening_format) === 'NOVICE') return attended;
  return attended || isAttendingResponse(row);
};
