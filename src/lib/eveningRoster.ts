import type { EveningParticipant } from './api';
import { getEveningAttendanceFact } from './eveningResponse';

export const isEveningGameEligible = (participant: EveningParticipant): boolean => {
  const fact = getEveningAttendanceFact(participant);
  return fact === 'attended_on_time' || fact === 'attended_late';
};

const attendanceRank = (participant: EveningParticipant): number => {
  const fact = getEveningAttendanceFact(participant);
  if (fact === 'attended_on_time') return 0;
  if (fact === 'attended_late') return 1;
  return 2;
};

export const sortEveningRoster = (participants: EveningParticipant[]): EveningParticipant[] =>
  participants.slice().sort((a, b) => {
    const rankDiff = attendanceRank(a) - attendanceRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.nickname.localeCompare(b.nickname, 'ru');
  });

export const toggleParticipantInSeats = (seats: string[], participantId: string): string[] => {
  const existingIndex = seats.indexOf(participantId);
  if (existingIndex >= 0) return seats.map((value, index) => (index === existingIndex ? '' : value));
  const firstEmptyIndex = seats.findIndex((value) => !value);
  if (firstEmptyIndex < 0) return seats;
  return seats.map((value, index) => (index === firstEmptyIndex ? participantId : value));
};