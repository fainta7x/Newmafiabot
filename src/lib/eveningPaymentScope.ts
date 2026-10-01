import { normalizeEveningFormat } from './eveningFormat.ts';

/**
 * Whom the club waits for a payment on this evening. A novice evening asks money only from those
 * the organizer confirmed and marked as arrived (owner, 2026-10-01); other evenings also count the
 * players who said «Иду» / «Приду позже» (pre-payment).
 */
export function isPaymentExpected(format: unknown, participant: { attendance_status?: unknown; response_status?: unknown }) {
  if (participant.attendance_status === 'attended') return true;
  if (normalizeEveningFormat(format) === 'NOVICE') return false;
  return ['going', 'late'].includes(String(participant.response_status || ''));
}
