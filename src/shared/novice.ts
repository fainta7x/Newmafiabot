export const NOVICE_APPLICATION_STATUSES = [
  'NEW',
  'CONFIRMED',
  'ATTENDED',
  'COMPLETED',
  'CONVERTED',
  'CANCELLED',
] as const;

export type NoviceApplicationStatus = typeof NOVICE_APPLICATION_STATUSES[number];

export const CLUB_STAGES = [
  'NEW',
  'NOVICE_ACTIVE',
  'NOVICE_COMPLETED',
  'CLUB_PLAYER',
  'INACTIVE',
] as const;

export type ClubStage = typeof CLUB_STAGES[number];

export const EVENING_FORMATS = [
  'NOVICE',
  'CASUAL',
  'RATING',
  'TOURNAMENT',
] as const;

export type EveningFormat = typeof EVENING_FORMATS[number];

export const NOVICE_APPLICATION_SOURCES = [
  'TELEGRAM',
  'VK',
  'FRIEND',
  'WEBSITE',
  'ORGANIZER',
] as const;

export type NoviceApplicationSource = typeof NOVICE_APPLICATION_SOURCES[number];

// OTHER_CITY — «Я гость из другого города» (owner, 2026-09-30): confirmed like EXPERIENCED, and the player is marked «Из другого города».
export const NOVICE_ENTRY_ROUTES = ['NOVICE', 'EXPERIENCED', 'OTHER_CITY'] as const;
export type NoviceEntryRoute = typeof NOVICE_ENTRY_ROUTES[number];
