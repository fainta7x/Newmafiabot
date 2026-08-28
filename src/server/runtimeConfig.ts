export const CANONICAL_PUBLIC_APP_URL = 'https://2la-noire-chagina7x.waw0.amvera.tech';
export const DEFAULT_INTERNAL_BOT_SERVICE_URL = 'http://127.0.0.1:8081';

const normalizeBaseUrl = (value: unknown) => String(value || '').trim().replace(/\/+$/, '');

export const getBotServiceBaseUrl = () => normalizeBaseUrl(
  process.env.BOT_SERVICE_URL || DEFAULT_INTERNAL_BOT_SERVICE_URL,
);

export const getPublicAppBaseUrl = () => normalizeBaseUrl(
  process.env.PUBLIC_APP_URL
  || process.env.WEBHOOK_URL
  || process.env.RENDER_EXTERNAL_URL
  || CANONICAL_PUBLIC_APP_URL,
);
