import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { finalizeExistingVkEveningPublications, syncDirectVkEveningPublications } from '../server/services/vkDirectJoinPublishingService.ts';
import { refreshExistingVkEveningPosts } from '../server/services/vkLiveEveningSyncWorker.ts';
import {
  canEditVkWallPosts,
  createVkWallPost,
  editVkWallPost,
  getVkDestinations,
  getVkIntegrationStatus,
  setVkRuntimeUserToken,
  resetVkChannelPeerDiscoveryCache,
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
  resetVkChannelPeerDiscoveryCache();
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
    setVkRuntimeUserToken('vk2.authentication-only', { apiCompatible: false });
    expect(getVkIntegrationStatus()).toMatchObject({
      configured: true,
      publisher_token_source: 'community',
      public_post_edit_supported: false,
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

  it('does not attempt the legacy wall.edit adapter with a community-only token', async () => {
    delete process.env.VK_ACCESS_TOKEN;
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(canEditVkWallPosts()).toBe(false);
    await expect(editVkWallPost({ groupId: '212761164', postId: 77, message: 'Обновление' }))
      .rejects.toMatchObject({ code: 'vk_community_edit_unsupported' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a user token when the legacy wall.edit adapter is available', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(canEditVkWallPosts()).toBe(true);
    await editVkWallPost({ groupId: '212761164', postId: 77, message: 'Обновление' });
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('user-token');
  });

  it('finalizes an existing VK post in place when the evening is cancelled', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const db = createDatabaseConnection(':memory:');
    await ensureVkIntegrationSchema(db);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-cancelled', 'Игровой вечер', ?, 'CASUAL', 'cancelled', 400, ?, ?)
    `, [now, now, now]);
    await db.run(`
      INSERT INTO vk_evening_publications (
        evening_id, destination_key, group_id, post_owner_id, post_id,
        answer_map_json, status, external_url, published_at, updated_at
      ) VALUES ('evening-cancelled', 'public', '212761164', -212761164, 91,
        '{}', 'published', 'https://vk.com/wall-212761164_91', ?, ?)
    `, [now, now]);

    const result = await finalizeExistingVkEveningPublications(db, 'evening-cancelled');
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ destination: 'public', success: true }),
    ]));
    expect(await db.get<any>(`
      SELECT status, post_id, last_error FROM vk_evening_publications
       WHERE evening_id='evening-cancelled' AND destination_key='public'
    `)).toEqual({ status: 'archived', post_id: 91, last_error: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.vk.com/method/wall.edit');
    const body = init?.body as URLSearchParams;
    expect(body.get('post_id')).toBe('91');
    expect(body.get('message')).toContain('Событие отменено');
    expect(body.get('message')).not.toContain('/join/');
  });

  it('does not create a VK post while finalizing an evening with no publication', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const db = createDatabaseConnection(':memory:');
    await ensureVkIntegrationSchema(db);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-closed-no-post', 'Игровой вечер', ?, 'CASUAL', 'completed', 400, ?, ?)
    `, [now, now, now]);

    const result = await finalizeExistingVkEveningPublications(db, 'evening-closed-no-post');
    expect(result.results.every((item) => item.skipped)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates an existing public post with the configured user token', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: 1 }), { status: 200 }),
    );
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
        'previous VK edit error')
    `, [now, now]);

    const result = await syncDirectVkEveningPublications(db, 'evening-published', 'https://example.test');
    expect(result.results).toEqual([expect.objectContaining({
      destination: 'public', success: true,
    })]);
    expect(await db.get<any>(`
      SELECT status, post_id, last_error FROM vk_evening_publications
       WHERE evening_id='evening-published' AND destination_key='public'
    `)).toEqual({ status: 'published', post_id: 77, last_error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.vk.com/method/wall.edit');
    const body = init?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('user-token');
    expect(body.get('owner_id')).toBe('-212761164');
    expect(body.get('post_id')).toBe('77');
  });

  it('edits a published post only when its announcement text changes', async () => {
    process.env.VK_ACCESS_TOKEN = 'user-token';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify({
      response: String(url).endsWith('wall.post') ? { post_id: 91 } : 1,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const db = createDatabaseConnection(':memory:');
    await ensureVkIntegrationSchema(db);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-stable', 'Игровой вечер', ?, 'CASUAL', 'published', 100, ?, ?)
    `, [now, now, now]);

    await syncDirectVkEveningPublications(db, 'evening-stable', 'https://example.test');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['https://api.vk.com/method/wall.post']);

    await syncDirectVkEveningPublications(db, 'evening-stable', 'https://example.test');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await db.run(`UPDATE game_evenings SET title='Игровой вечер · новый зал' WHERE id='evening-stable'`);
    await syncDirectVkEveningPublications(db, 'evening-stable', 'https://example.test');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.vk.com/method/wall.edit');
  });

  it('creates the missing VK publication and refreshes it inside the upcoming window', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: { post_id: 88 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const db = createDatabaseConnection(':memory:');
    await ensureVkIntegrationSchema(db);
    const now = new Date();
    const createdAt = now.toISOString();
    const startsAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-auto-publish', 'Пятничная игра', ?, 'CASUAL', 'published', 100, ?, ?)
    `, [startsAt, createdAt, createdAt]);

    const result = await refreshExistingVkEveningPosts(db, { now, baseUrl: 'https://example.test' });
    expect(result).toEqual([{ evening_id: 'evening-auto-publish', success: true }]);
    expect(await db.get<any>(`
      SELECT destination_key, post_id, status
        FROM vk_evening_publications
       WHERE evening_id='evening-auto-publish' AND destination_key='public'
    `)).toEqual({ destination_key: 'public', post_id: 88, status: 'published' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.vk.com/method/wall.post', expect.anything());
  });
  it('sends a channel message with the community publisher token', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    process.env.VK_CHANNEL_API_PEER_ID = '-233806277';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 321 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createVkWallPost({
      groupId: '-233806277',
      message: 'Тестовый анонс канала',
    });

    expect(result).toMatchObject({
      postId: 321,
      ownerId: -233806277,
      groupId: '-233806277',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.vk.com/method/messages.send');
    const body = init?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('community-token');
    expect(body.get('peer_id')).toBe('-233806277');
    expect(body.get('group_id')).toBe('212761164');
    expect(body.get('message')).toBe('Тестовый анонс канала');
  });

  it('edits an existing channel message with the community publisher token', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    process.env.VK_CHANNEL_API_PEER_ID = '-233806277';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: 1 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await editVkWallPost({
      groupId: '-233806277',
      postId: 321,
      message: 'Обновлённый анонс канала',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.vk.com/method/messages.edit');
    const body = init?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('community-token');
    expect(body.get('peer_id')).toBe('-233806277');
    expect(body.get('group_id')).toBe('212761164');
    expect(body.get('message_id')).toBe('321');
    expect(body.get('message')).toBe('Обновлённый анонс канала');
  });

});
