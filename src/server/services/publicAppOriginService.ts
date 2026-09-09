import type { Request } from 'express';

const normalizeOrigin = (value: unknown) => {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Configured public application URL is invalid'), { statusCode: 500, code: 'public_origin_invalid' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Configured public application URL must use HTTP(S)'), { statusCode: 500, code: 'public_origin_invalid' });
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw Object.assign(new Error('Configured public application URL must use HTTPS in production'), { statusCode: 500, code: 'public_origin_https_required' });
  }
  return url.origin;
};

export function resolveTrustedPublicAppOrigin(req?: Pick<Request, 'protocol' | 'get'>): string {
  const configured = normalizeOrigin(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL);
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('PLAYER_APP_URL is required for VK OAuth in production'), { statusCode: 503, code: 'public_origin_not_configured' });
  }
  if (!req) return 'http://127.0.0.1:3000';
  const host = String(req.get('host') || '').trim();
  if (!host) return 'http://127.0.0.1:3000';
  return `${req.protocol || 'http'}://${host}`.replace(/\/$/, '');
}

export function buildTrustedPublicAppUrl(pathname: string, req?: Pick<Request, 'protocol' | 'get'>): string {
  const origin = resolveTrustedPublicAppOrigin(req);
  const path = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${String(pathname || '')}`;
  return `${origin}${path}`;
}
