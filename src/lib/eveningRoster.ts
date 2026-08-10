import type { EveningParticipant } from './api.ts';
import { getActualAttendanceFact, isEveningParticipantEligibleForGame, normalizeEveningResponse } from './eveningResponse.ts';

export const isEveningGameEligible = (participant: EveningParticipant): boolean => isEveningParticipantEligibleForGame(participant);

const attendanceRank = (participant: EveningParticipant) => {
  const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status);
  if (fact === 'on_time' || fact === 'late' || fact === 'attended_unknown') return 0;
  const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
  if (response === 'going' || response === 'late') return 1;
  return 2;
};

export const sortEveningRoster = (participants: EveningParticipant[]) => participants.slice().sort((a, b) => {
  const rank = attendanceRank(a) - attendanceRank(b);
  return rank || a.nickname.localeCompare(b.nickname, 'ru');
});

export const toggleParticipantInSeats = (seats: string[], participantId: string): string[] => {
  const existingIndex = seats.indexOf(participantId);
  if (existingIndex >= 0) return seats.map((value, index) => index === existingIndex ? '' : value);
  const freeIndex = seats.findIndex((value) => !value);
  if (freeIndex < 0) return seats;
  return seats.map((value, index) => index === freeIndex ? participantId : value);
};
