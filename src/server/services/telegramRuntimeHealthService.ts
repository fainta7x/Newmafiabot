const DEFAULT_BOT_SERVICE_URL = 'https://mafiabot-0vcb.onrender.com';

type RuntimeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ProbeResult<T> = {
  ok: boolean;
  status: number | null;
  data: T | null;
  error: string | null;
};

export type TelegramRuntimeHealth = {
  ok: boolean;
  checked_at: string;
  telegram: {
    configured: boolean;
    reachable: boolean;
    bot_id: number | null;
    username: string | null;
    webhook_configured: boolean;
    webhook_matches_bot_service: boolean;
    pending_update_count: number | null;
    last_error_message: string | null;
    error: string | null;
  };
  bot_service: {
    reachable: boolean;
    status: number | null;
    error: string | null;
  };
};

const normalizeBaseUrl = (value: unknown) => String(value || '').trim().replace(/\/+$/, '');

const safeJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
};

const probeJson = async <T>(fetcher: RuntimeFetch, url: string): Promise<ProbeResult<T>> => {
  try {
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    const data = await safeJson<T>(response);
    if (!response.ok) {
      const message = String((data as any)?.description || (data as any)?.error || `HTTP ${response.status}`);
      return { ok: false, status: response.status, data, error: message };
    }
    return { ok: true, status: response.status, data, error: null };
  } catch (error: any) {
    return { ok: false, status: null, data: null, error: error?.message || 'connection_failed' };
  }
};

const probeText = async (fetcher: RuntimeFetch, url: string): Promise<ProbeResult<string>> => {
  try {
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.status,
      data: text || null,
      error: response.ok ? null : (text || `HTTP ${response.status}`),
    };
  } catch (error: any) {
    return { ok: false, status: null, data: null, error: error?.message || 'connection_failed' };
  }
};

export async function checkTelegramRuntimeHealth(fetcher: RuntimeFetch = fetch): Promise<TelegramRuntimeHealth> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const botServiceUrl = normalizeBaseUrl(process.env.BOT_SERVICE_URL || DEFAULT_BOT_SERVICE_URL);
  const botService = botServiceUrl
    ? await probeText(fetcher, `${botServiceUrl}/health`)
    : { ok: false, status: null, data: null, error: 'BOT_SERVICE_URL is not configured' };

  if (!token) {
    return {
      ok: false,
      checked_at: new Date().toISOString(),
      telegram: {
        configured: false,
        reachable: false,
        bot_id: null,
        username: null,
        webhook_configured: false,
        webhook_matches_bot_service: false,
        pending_update_count: null,
        last_error_message: null,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      },
      bot_service: {
        reachable: botService.ok,
        status: botService.status,
        error: botService.error,
      },
    };
  }

  const apiBase = `https://api.telegram.org/bot${token}`;
  const [meProbe, webhookProbe] = await Promise.all([
    probeJson<any>(fetcher, `${apiBase}/getMe`),
    probeJson<any>(fetcher, `${apiBase}/getWebhookInfo`),
  ]);

  const me = meProbe.data?.ok ? meProbe.data.result : null;
  const webhook = webhookProbe.data?.ok ? webhookProbe.data.result : null;
  const actualWebhookUrl = String(webhook?.url || '').trim().replace(/\/+$/, '');
  const expectedWebhookUrl = botServiceUrl ? `${botServiceUrl}/webhook` : '';
  const webhookMatches = Boolean(actualWebhookUrl && expectedWebhookUrl && actualWebhookUrl === expectedWebhookUrl);
  const telegramReachable = meProbe.ok && Boolean(me) && webhookProbe.ok && Boolean(webhook);

  return {
    ok: telegramReachable && webhookMatches && botService.ok,
    checked_at: new Date().toISOString(),
    telegram: {
      configured: true,
      reachable: telegramReachable,
      bot_id: me?.id == null ? null : Number(me.id),
      username: me?.username ? String(me.username) : null,
      webhook_configured: Boolean(actualWebhookUrl),
      webhook_matches_bot_service: webhookMatches,
      pending_update_count: webhook?.pending_update_count == null ? null : Number(webhook.pending_update_count),
      last_error_message: webhook?.last_error_message ? String(webhook.last_error_message) : null,
      error: meProbe.error || webhookProbe.error,
    },
    bot_service: {
      reachable: botService.ok,
      status: botService.status,
      error: botService.error,
    },
  };
}
