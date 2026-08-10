import crypto from 'crypto';

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS = 5 * 60;

export interface TelegramMiniAppUser {
  id: number;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
}

export class TelegramInitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramInitDataError';
  }
}

const safeHexEqual = (left: string, right: string): boolean => {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

export function validateTelegramInitData(initData: string, botToken: string): TelegramMiniAppUser {
  if (!initData || typeof initData !== 'string' || initData.length > 16384) {
    throw new TelegramInitDataError('Invalid Telegram init data.');
  }
  if (!botToken) {
    throw new TelegramInitDataError('Telegram authentication is not configured.');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') || '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeHexEqual(receivedHash, expectedHash)) {
    throw new TelegramInitDataError('Invalid Telegram init data.');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new TelegramInitDataError('Invalid Telegram init data.');
  }
  if (authDate > now + TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS || now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    throw new TelegramInitDataError('Telegram init data has expired.');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new TelegramInitDataError('Telegram user data is missing.');

  let user: any;
  try {
    user = JSON.parse(rawUser);
  } catch {
    throw new TelegramInitDataError('Invalid Telegram user data.');
  }

  if (!Number.isSafeInteger(user?.id) || user.id <= 0) {
    throw new TelegramInitDataError('Invalid Telegram user data.');
  }

  return {
    id: user.id,
    username: typeof user.username === 'string' ? user.username : null,
    first_name: typeof user.first_name === 'string' ? user.first_name : null,
    photo_url: typeof user.photo_url === 'string' ? user.photo_url : null,
  };
}
