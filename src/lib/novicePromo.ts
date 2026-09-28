import NOVICE_PROMO from '../shared/novicePromo.json';

/**
 * The novice evening promo and the organizer contacts, shown in novice evening announcements.
 * The text lives in `src/shared/novicePromo.json`, shared with the Telegram bot.
 */
type NovicePromo = {
  title?: string; intro?: string; reasonsTitle?: string; reasons?: string[];
  firstTimeTitle?: string; firstTimeText?: string; contacts?: { telegram?: string; vk?: string };
};

const promo = NOVICE_PROMO as NovicePromo;

/** The promo as plain text (VK posts have no formatting). */
export const novicePromoText = (): string => {
  if (!promo.title) return '';
  const reasons = (promo.reasons ?? []).filter((item) => item.trim());
  return [
    `🎩 ${promo.title}`,
    promo.intro ?? '',
    reasons.length ? [promo.reasonsTitle ?? '', ...reasons].join('\n').trim() : '',
    promo.firstTimeTitle ? `${promo.firstTimeTitle} ${promo.firstTimeText ?? ''}`.trim() : '',
  ].filter(Boolean).join('\n\n');
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
