const DEFAULT_BOT_SERVICE_URL = 'https://mafiabot-0vcb.onrender.com';

const botServiceConfig = () => ({
  baseUrl: String(process.env.BOT_SERVICE_URL || DEFAULT_BOT_SERVICE_URL).trim().replace(/\/+$/, ''),
  secret: String(process.env.BOT_API_SECRET || '').trim(),
});

async function postToBot(path: string): Promise<{ success: boolean; status: number; data?: any; error?: string }> {
  const { baseUrl, secret } = botServiceConfig();
  if (!baseUrl || !secret) return { success: false, status: 503, error: 'Связь web → bot ещё не настроена' };

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-Bot-Token': secret,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        data,
        error: String(data?.error || data?.message || `Bot HTTP ${response.status}`),
      };
    }
    return { success: true, status: response.status, data };
  } catch (error: any) {
    return { success: false, status: 502, error: error?.message || 'Не удалось связаться с Telegram-ботом' };
  }
}

export const requestBotEveningTelegramSync = async (eveningId: string) =>
  postToBot(`/crm/evenings/${encodeURIComponent(eveningId)}/sync-telegram`);

export const requestBotPublicRouterSync = async () =>
  postToBot('/crm/telegram/sync-public');

export const requestBotDestinationTest = async (destinationId: string) =>
  postToBot(`/crm/telegram/test/${encodeURIComponent(destinationId)}`);
