import { randomBytes } from 'node:crypto';

/**
 * Short-lived public links to the seating picture (owner, 2026-10-03). Inside the Telegram app a blob
 * download or the Web Share menu often does not work; Telegram's own `downloadFile`, an external browser
 * and the VK/Telegram share forms all need a plain https URL. The unguessable token is the secret.
 * Kept in memory only: a restart drops the links, which is fine for a 24 h helper.
 */
export const SEATING_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LINKS = 30;

type Entry = { image: Buffer; fileName: string; expiresAt: number };
const links = new Map<string, Entry>();

const sweep = (now: number) => {
  for (const [token, entry] of links) if (entry.expiresAt <= now) links.delete(token);
  while (links.size > MAX_LINKS) {
    const oldest = links.keys().next().value;
    if (oldest === undefined) break;
    links.delete(oldest);
  }
};

export function createSeatingImageLink(image: Buffer, fileName: string, now = Date.now()): string {
  sweep(now);
  const token = randomBytes(18).toString('hex');
  links.set(token, { image, fileName, expiresAt: now + SEATING_LINK_TTL_MS });
  sweep(now);
  return token;
}

export function readSeatingImageLink(token: string, now = Date.now()): { image: Buffer; fileName: string } | null {
  const entry = links.get(String(token || ''));
  if (!entry || entry.expiresAt <= now) {
    if (entry) links.delete(String(token));
    return null;
  }
  return { image: entry.image, fileName: entry.fileName };
}
