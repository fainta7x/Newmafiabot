import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { checkVkRuntimeHealth } from '../server/services/vkRuntimeHealthService.ts';

const envKeys = [
  'VK_GROUP_ID',
  'VK_GROUP_ACCESS_TOKEN',
  'VK_ACCESS_TOKEN',
  'VK_API_VERSION',
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const makeDb = (input?: {
  oauth?: Record<string, unknown> | null;
  callback?: Record<string, unknown> | null;
}) => ({
  get: vi.fn(async (sql: string) => {
    if (sql.includes('vk_oauth_credentials')) return input?.oauth || null;
    if (sql.includes('vk_callback_runtime')) return input?.callback || null;
    return null;
  }),
}) as unknown as DatabaseWrapper;

const readyCallback = {
  group_id: '212761164',
  server_id: 42,
  callback_url: 'https://app.example.com/api/integrations/vk/callback',
  secret: 'stored-secret-must-not-leak',
  confirmation_code: 'stored-confirmation-must-not-leak',
  status: 'ready',
  last_error: null,
  updated_at: '2026-08-17T12:00:00.000Z',
};

describe('VK runtime health probe', () => {
  beforeEach(() => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_API_VERSION = '5.199';
    delete process.env.VK_GROUP_ACCESS_TOKEN;
    delete process.env.VK_ACCESS_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of envKeys) {
      const previous = originalEnv[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  });

  it('reports missing credentials without calling VK API', async () => {
    const api = vi.fn();
    const result = await checkVkRuntimeHealth(makeDb(), api);

    expect(result.ok).toBe(false);
    expect(result.vk.configured).toBe(false);
    expect(result.vk.reachable).toBe(false);
    expect(result.vk.error).toContain('access token');
    expect(api).not.toHaveBeenCalled();
  });

  it('passes when configured community is reachable and callback is ready', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'super-secret-community-token';
    const api = vi.fn(async (method: string, params: Record<string, unknown>) => {
      expect(method).toBe('groups.getById');
      expect(params).toMatchObject({ group_id: 212761164 });
      return [{ id: 212761164, name: '2LA Noire', screen_name: '2lanoiremafia' }];
    });

    const result = await checkVkRuntimeHealth(makeDb({ callback: readyCallback }), api);

    expect(result.ok).toBe(true);
    expect(result.vk.reachable).toBe(true);
    expect(result.vk.group_name).toBe('2LA Noire');
    expect(result.vk.screen_name).toBe('2lanoiremafia');
    expect(result.callback.configured).toBe(true);
    expect(JSON.stringify(result)).not.toContain('super-secret-community-token');
    expect(JSON.stringify(result)).not.toContain('stored-secret-must-not-leak');
    expect(JSON.stringify(result)).not.toContain('stored-confirmation-must-not-leak');
  });

  it('reports VK API failure without changing callback state', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'secret';
    const db = makeDb({ callback: readyCallback });
    const api = vi.fn(async () => { throw new Error('VK API 5: User authorization failed'); });

    const result = await checkVkRuntimeHealth(db, api);

    expect(result.ok).toBe(false);
    expect(result.vk.reachable).toBe(false);
    expect(result.vk.error).toContain('authorization failed');
    expect(result.callback.status).toBe('ready');
    expect((db as any).run).toBeUndefined();
  });

  it('marks health degraded when API works but callback is not configured', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'secret';
    const api = vi.fn(async () => ({ groups: [{ id: 212761164, name: '2LA Noire', screen_name: '2lanoiremafia' }] }));

    const result = await checkVkRuntimeHealth(makeDb(), api);

    expect(result.ok).toBe(false);
    expect(result.vk.reachable).toBe(true);
    expect(result.callback.configured).toBe(false);
    expect(result.callback.status).toBe('not_configured');
  });
});
