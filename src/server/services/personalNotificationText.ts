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
