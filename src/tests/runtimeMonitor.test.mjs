import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { normalizeBaseUrl, parseChatIds, probeRuntime } from '../../scripts/runtimeMonitor.mjs';

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('external runtime monitor', () => {
  it('normalizes configuration without leaking empty recipients', () => {
    expect(normalizeBaseUrl('https://club.example.com///')).toBe('https://club.example.com');
    expect(parseChatIds(' 123, ,456 ')).toEqual(['123', '456']);
  });

  it('does not disable health probing when Telegram notification secrets are absent', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/runtimeMonitor.mjs'), 'utf8');

    expect(source).toContain('runtime probing and GitHub incidents remain active');
    expect(source).not.toContain("console.log('[monitor] Not armed: configure TELEGRAM_MONITOR_BOT_TOKEN and TELEGRAM_MONITOR_CHAT_IDS.');\n    return;");
    expect(source).toContain('if (telegramArmed && !String(incident.body || \'\').includes(DOWN_MARKER))');
  });

  it('keeps main-push, scheduled and manual runtime-monitor triggers', () => {
    const workflow = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/runtime-monitor.yml'), 'utf8');

    expect(workflow).toContain('push:\n    branches: [main]');
    expect(workflow).toContain("cron: '3-58/5 * * * *'");
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('passes only when both public health endpoints pass', async () => {
    const fetcher = vi.fn(async (url) => {
      if (String(url).endsWith('/api/health/runtime')) {
        return response(200, {
          status: 'ok',
          checks: { database: 'ok', bot: 'ok', telegram: 'ok' },
        });
      }
      return response(200, { status: 'ok' });
    });

    const result = await probeRuntime('https://club.example.com/', fetcher, async () => {});

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries and reports the degraded runtime component safely', async () => {
    const fetcher = vi.fn(async (url) => {
      if (String(url).endsWith('/api/health/runtime')) {
        return response(503, {
          status: 'degraded',
          checks: { database: 'ok', bot: 'fail', telegram: 'fail' },
        });
      }
      return response(200, { status: 'ok' });
    });

    const result = await probeRuntime('https://club.example.com', fetcher, async () => {});

    expect(result.ok).toBe(false);
    expect(result.runtime.httpStatus).toBe(503);
    expect(result.runtime.detail).toBe('database=ok, bot=fail, telegram=fail');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
