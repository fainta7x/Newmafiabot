const playerAppBaseUrl = () => String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');

// The Telegram outbox sends with parse_mode HTML, while personal notification text is plain
// (shared with VK). Escape it so a title like «<Cup> & Co» cannot make Telegram reject the message.
export const escapeTelegramHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const telegramTextWithAction = (rawText: string, actionPath?: string | null, hasReplyMarkup = false) => {
  const text = escapeTelegramHtml(rawText);
  if (hasReplyMarkup) return text;
  const baseUrl = playerAppBaseUrl();
  const path = String(actionPath || '').trim();
  if (!baseUrl || !path.startsWith('/player')) return text;
  return `${text}\n\n${baseUrl}${path}`;
};

/**
 * A button to the club app in a personal Telegram message opens the app as a Mini App (`web_app`), signed in through
 * Telegram. A plain `url` button opens Telegram's browser instead, where the app does not know the player — on iPhone
 * that browser keeps no cookies, so the player had to sign in again every time (owner, 2026-11-17: «авторизации
 * сбрасываются»). Buttons to other sites stay as they are.
 */
export function miniAppButtons<T>(markup: T): T {
  const base = playerAppBaseUrl();
  if (!base || !markup || typeof markup !== 'object') return markup;
  let origin = '';
  try { origin = new URL(base).origin; } catch { return markup; }
  const rows = (markup as { inline_keyboard?: unknown }).inline_keyboard;
  if (!Array.isArray(rows)) return markup;
  const inline_keyboard = rows.map((row) => (Array.isArray(row) ? row.map((button) => {
    const url = button && typeof button === 'object' ? (button as { url?: unknown }).url : null;
    if (typeof url !== 'string') return button;
    try { if (new URL(url).origin !== origin) return button; } catch { return button; }
    const { url: _url, ...rest } = button as Record<string, unknown>;
    return { ...rest, web_app: { url } };
  }) : row));
  return { ...(markup as object), inline_keyboard } as T;
}

/** A personal message without its own buttons gets one «📱 Открыть в приложении» button to its page (as a Mini App). */
export function telegramActionMarkup(actionPath?: string | null): Record<string, unknown> | null {
  const base = playerAppBaseUrl().replace(/\/player$/, '');
  const path = String(actionPath || '').trim();
  if (!base || !path.startsWith('/player')) return null;
  return { inline_keyboard: [[{ text: '📱 Открыть в приложении', web_app: { url: `${base}${path}` } }]] };
}
