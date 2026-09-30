import promo from '../shared/novicePromo.json';

/**
 * What a player sees while the app restarts (owner, 2026-09-30, before bringing new players in): a short
 * friendly note with the organizer's contacts instead of a bare «503». The same words are in public/sw.js.
 */
export const MAINTENANCE_TITLE = 'Приложение перезапускается';
export const MAINTENANCE_TEXT = 'Администратор обновляет приложение — обычно это занимает до 5 минут. Попробуйте зайти чуть позже, страница обновится сама.';
export const maintenanceContacts = () => {
  const telegram = String(promo.contacts?.telegram || '').replace(/^@/, '').trim();
  const vk = String(promo.contacts?.vk || '').trim();
  return [
    ...(telegram ? [{ label: `Telegram @${telegram}`, url: `https://t.me/${telegram}` }] : []),
    ...(vk ? [{ label: 'VK', url: vk }] : []),
  ];
};

/** A network failure or a gateway answer (502/503/504) means the server is restarting, not a broken account. */
export class ServerRestartingError extends Error {
  constructor() { super('server-restarting'); }
}
export const isRestartingStatus = (status: number) => status === 502 || status === 503 || status === 504;
