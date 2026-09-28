const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the automatic Telegram/VK announcement of an evening is due: 19:00 Moscow on the Monday of
 * the evening's week (four days before a Friday), whatever time the evening starts.
 */
export const weeklyAnnouncementDueMs = (startsAt: string | number | Date): number => {
  const startMs = new Date(startsAt).getTime();
  const moscow = new Date(startMs + 3 * 60 * 60 * 1000);
  const moscowMidnightAsUtc = Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate());
  return moscowMidnightAsUtc - 4 * DAY_MS + 16 * 60 * 60 * 1000;
};
