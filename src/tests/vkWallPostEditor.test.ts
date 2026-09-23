import { afterEach, describe, expect, it } from 'vitest';
import { editVkWallPostWithPublisher } from '../server/services/vkWallPostEditor.ts';
import { setVkRuntimeUserToken } from '../server/services/vkPublishingService.ts';

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

describe('VK wall post edits', () => {
  const originalFetch = globalThis.fetch;
  const originalGroupToken = process.env.VK_GROUP_ACCESS_TOKEN;
  const originalUserToken = process.env.VK_ACCESS_TOKEN;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('VK_GROUP_ACCESS_TOKEN', originalGroupToken);
    restoreEnv('VK_ACCESS_TOKEN', originalUserToken);
    setVkRuntimeUserToken('');
  });

  const mockVk = (answer: unknown) => {
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: new URLSearchParams(String(init?.body || '')) });
      return { ok: true, status: 200, json: async () => answer } as Response;
    }) as typeof fetch;
    return calls;
  };

  it('edits a community post with the organizer API token', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    process.env.VK_ACCESS_TOKEN = 'user-token';
    const calls = mockVk({ response: 1 });

    await editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'Актуальная запись' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.vk.com/method/wall.edit');
    expect(calls[0].body.get('access_token')).toBe('user-token');
    expect(calls[0].body.get('owner_id')).toBe('-212761164');
    expect(calls[0].body.get('post_id')).toBe('456');
  });

  it('does not call VK when only the community key exists (VK answers error 27)', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    const calls = mockVk({ response: 1 });

    await expect(editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'x' }))
      .rejects.toMatchObject({ code: 'vk_wall_edit_unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('never edits with a VK ID login token that the API rejects', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    setVkRuntimeUserToken('vkid-login-token', { apiCompatible: false });
    const calls = mockVk({ response: 1 });

    await expect(editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'x' }))
      .rejects.toMatchObject({ code: 'vk_wall_edit_unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('surfaces the VK answer when the organizer token is rejected', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    mockVk({ error: { error_code: 15, error_msg: 'Access denied' } });

    await expect(editVkWallPostWithPublisher({ groupId: '212761164', postId: 456, message: 'x' }))
      .rejects.toThrow('API-токен организатора: VK API 15: Access denied');
  });
});
