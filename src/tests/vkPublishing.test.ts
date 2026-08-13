import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { syncDirectVkEveningPublications } from '../server/services/vkDirectJoinPublishingService.ts';
import {
  canEditVkWallPosts,
  createVkWallPost,
  editVkWallPost,
  getVkDestinations,
  getVkIntegrationStatus,
  setVkRuntimeUserToken,
} from '../server/services/vkPublishingService.ts';

const ENV_KEYS = [
  'VK_ACCESS_TOKEN',
  'VK_GROUP_ACCESS_TOKEN',
  'VK_GROUP_ID',
  'VK_CHANNEL_API_PEER_ID',
  'VK_CHANNEL_PEER_ID',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setVkRuntimeUserToken('');
  vi.restoreAllMocks();
});

describe('VK publishing adapter', () => {
  it('does not mistake a public channel URL suffix for an API peer_id', () => {
    delete process.env.VK_CHANNEL_API_PEER_ID;
    process.env.VK_CHANNEL_PEER_ID = '-233806277';
    const channel = getVkDestinations().find((item) => item.key === 'channel');
    expect(channel).toMatchObject({ active: true, supported: false, groupId: null });
  });

  it('accepts a separately configured channel API peer_id', () => {
    process.env.VK_CHANNEL_API_PEER_ID = '2000000042';
    const channel = getVkDestinations().find((item) => item.key === 'channel');
    expect(channel).toMatchObject({ active: true, supported: true, groupId: '2000000042' });
  });

  it('uses the community token for public publishing instead of the VK ID login token', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    setVkRuntimeUserToken('vk2.authentication-only');
    expect(getVkIntegrationStatus()).toMatchObject({
      configured: true,
      publisher_token_source: 'community',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { post_id: 77 },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createVkWallPost({ groupId: '212761164', message: 'Анонс' });
    expect(result.postId).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const call of fetchMock.mock.calls) {
      const body = call[1]?.body as URLSearchParams;
      expect(body.get('access_token')).toBe('community-token');
    }
  });

  it('does not attempt wall.edit with a community-only token', async () => {
    delete process.env.VK_ACCESS_TOKEN;
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(canEditVkWallPosts()).toBe(false);
    await expect(editVkWallPost({ groupId: '212761164', postId: 77, message: 'Обновление' }))
      .rejects.toMatchObject({ code: 'vk_community_edit_unsupported' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a user token when wall.edit is available', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(canEditVkWallPosts()).toBe(true);
    await editVkWallPost({ groupId: '212761164', postId: 77, message: 'Обновление' });
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('user-token');
  });

  it('keeps an existing public post published when only a community token is available', async () => {
    delete process.env.VK_ACCESS_TOKEN;
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const db = createDatabaseConnection(':memory:');
    await ensureVkIntegrationSchema(db);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-published', 'Игровой вечер', ?, 'CASUAL', 'published', 400, ?, ?)
    `, [now, now, now]);
    await db.run(`
      INSERT INTO vk_evening_publications (
        evening_id, destination_key, group_id, post_owner_id, post_id,
        answer_map_json, status, external_url, published_at, updated_at, last_error
      ) VALUES ('evening-published', 'public', '212761164', -212761164, 77,
        '{}', 'error', 'https://vk.com/wall-212761164_77', ?, ?,
        'VK API 27: Group authorization failed: method is unavailable with group auth.')
    `, [now, now]);

    const result = await syncDirectVkEveningPublications(db, 'evening-published', 'https://example.test');
    expect(result.results).toEqual([expect.objectContaining({
      destination: 'public', success: true, skipped: true,
    })]);
    expect(await db.get<any>(`
      SELECT status, post_id, last_error FROM vk_evening_publications
       WHERE evening_id='evening-published' AND destination_key='public'
    `)).toEqual({ status: 'published', post_id: 77, last_error: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
