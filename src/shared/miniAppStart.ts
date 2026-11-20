/**
 * Links from group posts open the club app as the bot's Main Mini App (`t.me/<bot>?startapp=<param>`), signed in
 * through Telegram (owner, 2026-11-17: «авторизации сбрасываются» — a plain link opened Telegram's browser, where an
 * iPhone keeps no sign-in). Telegram allows only A–Z, a–z, 0–9, «_» and «-» in the parameter, so the page path under
 * /player is written with «__» between its parts: /player/telephone/<id> → telephone__<id>.
 */
const PARAM = /^[A-Za-z0-9_-]{1,512}$/;

export function playerPathToStartParam(path: string): string | null {
  if (path === '/player' || path === '/player/') return '';
  if (!path.startsWith('/player/')) return null;
  const parts = path.slice('/player/'.length).split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[A-Za-z0-9-]+$/.test(part))) return null;
  const param = parts.join('__');
  return PARAM.test(param) ? param : null;
}

export function startParamToPlayerPath(param: unknown): string | null {
  if (typeof param !== 'string' || !PARAM.test(param)) return null;
  const parts = param.split('__');
  if (parts.some((part) => !/^[A-Za-z0-9-]+$/.test(part))) return null;
  return `/player/${parts.join('/')}`;
}
