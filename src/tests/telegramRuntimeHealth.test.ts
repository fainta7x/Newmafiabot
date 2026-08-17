import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkTelegramRuntimeHealth } from '../server/services/telegramRuntimeHealthService.ts';

const fakeResponse = (status: number, body: unknown, asText = false) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (asText) throw new Error('not json');
    return body;
  },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
}) as Response;

describe('Telegram runtime health probe', () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalBotServiceUrl = process.env.BOT_SERVICE_URL;

  beforeEach(() => {
    process.env.BOT_SERVICE_URL = 'https://bot.example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalBotServiceUrl === undefined) delete process.env.BOT_SERVICE_URL;
    else process.env.BOT_SERVICE_URL = originalBotServiceUrl;
  });

  it('reports a missing Telegram token without sending anything', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetcher = vi.fn(async () => fakeResponse(200, 'OK', true));

    const result = await checkTelegramRuntimeHealth(fetcher);

    expect(result.ok).toBe(false);
    expect(result.telegram.configured).toBe(false);
    expect(result.telegram.error).toContain('TELEGRAM_BOT_TOKEN');
    expect(result.bot_service.reachable).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://bot.example.com/health');
  });

  it('passes when bot service, Telegram API and webhook are aligned', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:super-secret-token';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://bot.example.com/health') return fakeResponse(200, 'OK', true);
      if (url.endsWith('/getMe')) return fakeResponse(200, { ok: true, result: { id: 123, username: 'club_bot' } });
      if (url.endsWith('/getWebhookInfo')) {
        return fakeResponse(200, { ok: true, result: { url: 'https://bot.example.com/webhook', pending_update_count: 0 } });
      }
      return fakeResponse(404, { error: 'unexpected URL' });
    });

    const result = await checkTelegramRuntimeHealth(fetcher);

    expect(result.ok).toBe(true);
    expect(result.telegram.reachable).toBe(true);
    expect(result.telegram.username).toBe('club_bot');
    expect(result.telegram.webhook_configured).toBe(true);
    expect(result.telegram.webhook_matches_bot_service).toBe(true);
    expect(result.bot_service.reachable).toBe(true);
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });

  it('fails safely when Telegram webhook points to another service', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:secret';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://bot.example.com/health') return fakeResponse(200, 'OK', true);
      if (url.endsWith('/getMe')) return fakeResponse(200, { ok: true, result: { id: 123, username: 'club_bot' } });
      return fakeResponse(200, { ok: true, result: { url: 'https://old-bot.example.com/webhook', pending_update_count: 2 } });
    });

    const result = await checkTelegramRuntimeHealth(fetcher);

    expect(result.ok).toBe(false);
    expect(result.telegram.reachable).toBe(true);
    expect(result.telegram.webhook_matches_bot_service).toBe(false);
    expect(result.telegram.pending_update_count).toBe(2);
  });

  it('surfaces Telegram API errors without exposing the token', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:secret';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://bot.example.com/health') return fakeResponse(200, 'OK', true);
      return fakeResponse(401, { ok: false, description: 'Unauthorized' });
    });

    const result = await checkTelegramRuntimeHealth(fetcher);

    expect(result.ok).toBe(false);
    expect(result.telegram.reachable).toBe(false);
    expect(result.telegram.error).toBe('Unauthorized');
    expect(JSON.stringify(result)).not.toContain('123:secret');
  });
});
