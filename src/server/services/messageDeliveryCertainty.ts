/**
 * Transport outcome is not the same as delivery certainty.
 * A timeout or Telegram 5xx can happen after accepting the message;
 * VK retries are different because messages.send receives a stable random_id.
 */
export type DeliveryCertainty = 'accepted' | 'rejected' | 'uncertain';
export function telegramDeliveryCertainty(input: { ok: boolean; status?: number | null; threw?: boolean }): DeliveryCertainty {
  if (input.ok) return 'accepted';
  if (input.threw || (input.status != null && input.status >= 500)) return 'uncertain';
  return 'rejected';
}
export function mayRetryTelegramCancellation(certainty: DeliveryCertainty, temporary: boolean): boolean {
  // Do not risk a duplicate cancellation after an ambiguous acknowledgement.
  return temporary && certainty !== 'uncertain';
}
