import type { EveningParticipant } from './api';

export const isEveningGameEligible = (participant: EveningParticipant): boolean => {
  if (participant.registration_status === 'cancelled' || participant.registration_status === 'waitlist') return false;
  if (participant.attendance_status === 'no_show') return false;
  return true;
};

const attendanceRank = (participant: EveningParticipant): number => {
  if (participant.attendance_status === 'attended') return 0;
  if (participant.registration_status === 'confirmed') return 1;
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
  if (existingIndex >= 0) {
    return seats.map((value, index) => (index === existingIndex ? '' : value));
  }

  const firstEmptyIndex = seats.findIndex((value) => !value);
  if (firstEmptyIndex < 0) return seats;
  return seats.map((value, index) => (index === firstEmptyIndex ? participantId : value));
};
