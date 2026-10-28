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

/** Public posts require a complete acknowledgement, including every album item. */
export function publicTelegramResult(status: number, body: any, expectedMessages = 1) {
  const messages = Array.isArray(body?.result) ? body.result : [body?.result];
  const ids = messages.map((message: any) => message?.message_id);
  if (status >= 200 && status < 300 && body?.ok === true && messages.length === expectedMessages && ids.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)) {
    return { ok: true, certainty: 'accepted' as const, ids: ids.map(String) };
  }
  const definite = status < 500 && status !== 408 && body?.ok === false && Number.isInteger(body?.error_code) && body.error_code >= 400 && body.error_code < 500 && body.error_code !== 408;
  return { ok: false, certainty: definite ? 'rejected' as const : 'uncertain' as const,
    temporary: definite && body.error_code === 429, retryAfter: Number(body?.parameters?.retry_after) || undefined,
    error: String(body?.description || `Telegram HTTP ${status}: нет подтверждения публикации`) };
}
