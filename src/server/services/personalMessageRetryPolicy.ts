/** Canonical personal-message retry timing; transport-specific ambiguity handling stays in each sender. */
export const PERSONAL_MESSAGE_MAX_RETRIES = 17;
export const PERSONAL_MESSAGE_BASE_BACKOFF_MS = 2_000;
export const PERSONAL_MESSAGE_MAX_BACKOFF_MS = 15 * 60_000;

export function personalMessageRetryDelayMs(attempt: number, retryAfterSeconds?: number | null): number {
  if (retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(PERSONAL_MESSAGE_MAX_BACKOFF_MS, Math.max(PERSONAL_MESSAGE_BASE_BACKOFF_MS, retryAfterSeconds * 1_000));
  }
  return Math.min(PERSONAL_MESSAGE_MAX_BACKOFF_MS, PERSONAL_MESSAGE_BASE_BACKOFF_MS * (2 ** Math.max(0, attempt - 1)));
}
