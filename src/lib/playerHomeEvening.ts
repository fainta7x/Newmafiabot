import { getEveningResponse, type EveningResponseStatus } from './eveningResponse.ts';

export type HomeEveningParticipation = {
  response_status: string;
  registration_status: string;
  attendance_status: string;
  arrival_status?: string;
  slot_numbers: number[];
};

export type HomeEvening = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  format: string;
  status?: string;
  response_status?: string;
  registration_status?: string;
  participation?: HomeEveningParticipation | null;
};

export const homeEveningResponse = (evening: HomeEvening): EveningResponseStatus => getEveningResponse(evening.participation || evening);
export const hasHomeEveningBooking = (evening: HomeEvening): boolean => {
  const response = homeEveningResponse(evening);
  return response === 'going' || response === 'late'
    || (response !== 'declined' && evening.participation?.registration_status === 'waitlist');
};

export function selectHomeEvening(evenings: HomeEvening[], now = Date.now()): HomeEvening | null {
  const upcoming = evenings.filter((item) => new Date(item.starts_at).getTime() >= now - 60 * 60 * 1000
    && !['active', 'completed', 'cancelled'].includes(item.status || ''))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return upcoming.find(hasHomeEveningBooking)
    || upcoming.find((item) => homeEveningResponse(item) === 'thinking')
    || upcoming.find((item) => homeEveningResponse(item) !== 'declined')
    || upcoming[0] || null;
}
