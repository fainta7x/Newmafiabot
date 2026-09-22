import { getBotServiceBaseUrl } from '../runtimeConfig.ts';

const botServiceConfig = () => ({
  baseUrl: getBotServiceBaseUrl(),
  secret: String(process.env.BOT_API_SECRET || '').trim(),
});

const botFailureMessage = (data: any, fallback: string) => {
  const direct = String(data?.error || data?.message || '').trim();
  if (direct) return direct;
  const item = Array.isArray(data?.results)
    ? data.results.find((entry: any) => entry && entry.success === false && String(entry.error || '').trim())
    : null;
  if (item?.error) return String(item.error);
  const routerError = String(data?.public_router?.error || '').trim();
  if (routerError) return `Public router: ${routerError}`;
  return fallback;
};

async function postToBot(path: string): Promise<{ success: boolean; status: number; data?: any; error?: string }> {
  const { baseUrl, secret } = botServiceConfig();
  if (!baseUrl || !secret) return { success: false, status: 503, error: 'Связь web → bot ещё не настроена' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-Bot-Token': secret,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        data,
        error: botFailureMessage(data, `Bot HTTP ${response.status}`),
      };
    }
    return { success: true, status: response.status, data };
  } catch (error: any) {
    return {
      success: false,
      status: 502,
      error: error?.name === 'AbortError' ? 'Telegram bot request timed out' : error?.message || 'Не удалось связаться с Telegram-ботом',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const requestBotEveningTelegramSync = async (eveningId: string) =>
  postToBot(`/crm/evenings/${encodeURIComponent(eveningId)}/sync-telegram`);

export const requestBotTournamentTelegramSync = async (tournamentId: string) =>
  postToBot(`/crm/tournaments/${encodeURIComponent(tournamentId)}/sync-telegram`);

export const requestBotEveningAnnouncement = async (eveningId: string) =>
  postToBot(`/crm/evenings/${encodeURIComponent(eveningId)}/announce`);

export const requestBotEveningReminders = async (eveningId: string) =>
  postToBot(`/crm/evenings/${encodeURIComponent(eveningId)}/remind-unanswered`);

export const requestBotEveningRecruitment = async (eveningId: string) =>
  postToBot(`/crm/evenings/${encodeURIComponent(eveningId)}/announce-group`);

export const requestBotPublicRouterSync = async () =>
  postToBot('/crm/telegram/sync-public');

export const requestBotDestinationTest = async (destinationId: string) =>
  postToBot(`/crm/telegram/test/${encodeURIComponent(destinationId)}`);
