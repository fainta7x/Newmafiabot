/**
 * Emergency pause for evening publishing (see docs/RUNBOOK.md «Emergency weekly publishing pause»).
 * While it is on, queued Telegram announcements and reminders stay in the queue and are not sent.
 */
export const isEveningPublishingPaused = () => process.env.WEEKLY_EVENING_AUTOMATION_ENABLED !== 'true';
