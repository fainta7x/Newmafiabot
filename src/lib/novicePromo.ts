import NOVICE_PROMO from '../shared/novicePromo.json';

/**
 * The novice evening promo and the organizer contacts, shown in novice evening announcements.
 * The text lives in `src/shared/novicePromo.json`, shared with the Telegram bot.
 */
type NovicePromo = {
  title?: string; intro?: string; reasonsTitle?: string; reasons?: string[];
  headline?: string; firstTimeTitle?: string; firstTimeText?: string;
  contacts?: { telegram?: string; vk?: string }; groups?: { telegram?: string; vk?: string };
};

const promo = NOVICE_PROMO as NovicePromo;

/** The first lines of a novice post: that it is a novice evening, before anything else (owner, 2026-09-29). */
export const noviceHeadlineText = (): string => {
  const headline = String(promo.headline ?? '').trim();
  if (!headline) return '';
  const text = String(promo.firstTimeText ?? '').trim();
  return [`🎓 ${headline}`, text].filter(Boolean).join('\n');
};

/** Why the game is fun, as plain text — at the end of the novice post. */
export const noviceAboutText = (): string => {
  if (!promo.title) return '';
  return [`🎩 ${promo.title}`, ...(promo.reasons ?? []).filter((item) => item.trim())].join('\n');
};

/** The Telegram novice group from the shared file, used when the Telegram settings have no invite link. */
export const noviceTelegramGroupFallback = (): string | null => {
  const url = String(promo.groups?.telegram ?? '').trim();
  return url.startsWith('https://t.me/') ? url : null;
};

/** Links for a private message to the organizer; only the filled-in ones. */
export const organizerContactLinks = (): Array<{ label: 'Telegram' | 'VK'; url: string }> => {
  const links: Array<{ label: 'Telegram' | 'VK'; url: string }> = [];
  const telegram = String(promo.contacts?.telegram ?? '').trim().replace(/^@/, '');
  if (/^[A-Za-z0-9_]{4,32}$/.test(telegram)) links.push({ label: 'Telegram', url: `https://t.me/${telegram}` });
  const vk = String(promo.contacts?.vk ?? '').trim();
  if (/^https:\/\/(vk\.com|vk\.me)\//.test(vk)) links.push({ label: 'VK', url: vk });
  return links;
};

/** The club VK group link for novice invitations, when it is filled in. */
export const clubVkGroupUrl = (): string | null => {
  const url = String(promo.groups?.vk ?? '').trim();
  return /^https:\/\/(vk\.com|vk\.ru)\//.test(url) ? url : null;
};
