import { getEveningResponse, isAttendingResponse } from './eveningResponse.ts';

/**
 * Read-only projection of an evening participant (both current and legacy rows).
 * Does not change RSVP, factual attendance, game-slot selection or finances.
 */
export type EveningParticipantViewInput = {
  response_status?: unknown;
  registration_status?: unknown;
  attendance_status?: unknown;
  arrival_status?: unknown;
};

/**
 * Organizer's working roster, including manually added unanswered players.
 * This is intentionally wider than the eligibility rule for seating a game.
 */
export const isInOrganizerWorkingRoster = (participant: EveningParticipantViewInput): boolean => {
  if (participant.attendance_status === 'no_show') return false;
  if (participant.attendance_status === 'attended') return true;
  const response = getEveningResponse(participant);
  return response === 'going' || response === 'late' || response === 'unanswered';
};

/**
 * Closing an evening requires factual attendance decisions only for people
 * who promised to come and whose attendance is still pending.
 */
export const needsEveningCloseoutAttendance = (participant: EveningParticipantViewInput): boolean =>
  participant.attendance_status === 'pending' && isAttendingResponse(participant);
