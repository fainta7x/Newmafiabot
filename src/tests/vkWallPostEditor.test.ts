import { afterEach, describe, expect, it } from 'vitest';
import { editVkWallPostWithPublisher } from '../server/services/vkWallPostEditor.ts';
import { setVkRuntimeUserToken } from '../server/services/vkPublishingService.ts';

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

it('community wall posts are edited through wall.edit with publisher token', async () => {
  const originalFetch = globalThis.fetch;
  const originalGroupToken = process.env.VK_GROUP_ACCESS_TOKEN;
  const originalUserToken = process.env.VK_ACCESS_TOKEN;
  const originalVersion = process.env.VK_API_VERSION;
  let capturedUrl = '';
  let capturedBody = '';

  process.env.VK_GROUP_ACCESS_TOKEN = 'test-community-token';
  delete process.env.VK_ACCESS_TOKEN;
  process.env.VK_API_VERSION = '5.199';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body || '');
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: 1 }),
    } as Response;
  }) as typeof fetch;

  try {
    await editVkWallPostWithPublisher({
      groupId: '212761164',
      postId: 456,
      message: 'Актуальная запись 7/11',
    });

    expect(capturedUrl).toBe('https://api.vk.com/method/wall.edit');
    const body = new URLSearchParams(capturedBody);
    expect(body.get('access_token')).toBe('test-community-token');
    expect(body.get('v')).toBe('5.199');
    expect(body.get('owner_id')).toBe('-212761164');
    expect(body.get('post_id')).toBe('456');
    expect(body.get('message')).toBe('Актуальная запись 7/11');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
    restoreEnv('VK_API_VERSION', originalVersion);
  }
});

it('publisher wall edit surfaces VK API errors instead of reporting false success', async () => {
  const originalFetch = globalThis.fetch;
  const originalGroupToken = process.env.VK_GROUP_ACCESS_TOKEN;
  const originalUserToken = process.env.VK_ACCESS_TOKEN;

  process.env.VK_GROUP_ACCESS_TOKEN = 'test-community-token';
  delete process.env.VK_ACCESS_TOKEN;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: { error_code: 15, error_msg: 'Access denied' } }),
  } as Response)) as typeof fetch;

  try {
    await expect(
      editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'test' }),
    ).rejects.toThrow('VK API 15: Access denied');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
  }
});

describe('wall edit credential fallback', () => {
  const originalFetch = globalThis.fetch;
  const originalGroupToken = process.env.VK_GROUP_ACCESS_TOKEN;
  const originalUserToken = process.env.VK_ACCESS_TOKEN;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
    setVkRuntimeUserToken('');
  });

  const mockVk = (answers: Record<string, unknown>) => {
    const tokens: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const token = new URLSearchParams(String(init?.body || '')).get('access_token') || '';
      tokens.push(token);
      return { ok: true, status: 200, json: async () => answers[token] } as Response;
    }) as typeof fetch;
    return tokens;
  };

  it('never edits with a VK ID login token that the API rejects', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    setVkRuntimeUserToken('vkid-login-token', { apiCompatible: false });
    const tokens = mockVk({ 'community-token': { response: 1 } });

    await editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'обновление' });
    expect(tokens).toEqual(['community-token']);
  });

  it('falls back to the community key when the organizer token is rejected', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    process.env.VK_ACCESS_TOKEN = 'user-token';
    const tokens = mockVk({
      'user-token': { error: { error_code: 15, error_msg: 'Access denied' } },
      'community-token': { response: 1 },
    });

    await editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'обновление' });
    expect(tokens).toEqual(['user-token', 'community-token']);
  });

  it('reports every credential failure and how to fix a community-only setup', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    mockVk({ 'community-token': { error: { error_code: 27, error_msg: 'Group authorization failed' } } });

    const failure = editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'обновление' });
    await expect(failure).rejects.toThrow('ключ сообщества: VK API 27: Group authorization failed');
    await expect(failure).rejects.toThrow('подключите «API VK» в CRM');
  });
});
