import { expect, it } from 'vitest';
import { editVkWallPostWithPublisher } from '../server/services/vkWallPostEditor.ts';

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
