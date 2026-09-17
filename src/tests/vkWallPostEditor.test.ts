import assert from 'node:assert/strict';
import test from 'node:test';
import { editVkWallPostWithPublisher } from '../server/services/vkWallPostEditor.ts';

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

test('community wall posts are edited through wall.edit with publisher token', async () => {
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

    assert.equal(capturedUrl, 'https://api.vk.com/method/wall.edit');
    const body = new URLSearchParams(capturedBody);
    assert.equal(body.get('access_token'), 'test-community-token');
    assert.equal(body.get('v'), '5.199');
    assert.equal(body.get('owner_id'), '-212761164');
    assert.equal(body.get('post_id'), '456');
    assert.equal(body.get('message'), 'Актуальная запись 7/11');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
    restoreEnv('VK_API_VERSION', originalVersion);
  }
});

test('publisher wall edit surfaces VK API errors instead of reporting false success', async () => {
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
    await assert.rejects(
      () => editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'test' }),
      /VK API 15: Access denied/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
  }
});
