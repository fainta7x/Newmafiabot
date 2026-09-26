/**
 * Emergency pause for evening publishing (see docs/RUNBOOK.md «Emergency weekly publishing pause»).
 * Publishing runs by default; setting WEEKLY_EVENING_AUTOMATION_ENABLED=false pauses it. While
 * paused, queued Telegram announcements and reminders stay in the queue and are not sent.
 */
export const isEveningPublishingPaused = () =>
  String(process.env.WEEKLY_EVENING_AUTOMATION_ENABLED ?? '').trim().toLowerCase() === 'false';
