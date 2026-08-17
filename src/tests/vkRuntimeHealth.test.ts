import { afterEach, describe, expect, it } from 'vitest';
import { initDb, type DatabaseWrapper } from '../db/index.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { checkVkRuntimeHealth } from '../server/services/vkRuntimeHealthService.ts';

const envKeys = [
  'VK_GROUP_ID',
  'VK_GROUP_ACCESS_TOKEN',
  'VK_ACCESS_TOKEN',
  'VK_API_VERSION',
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const readyCallback = async (db: DatabaseWrapper, groupId = '212761164') => {
  await ensureVkIntegrationSchema(db);
  await db.run(`
    INSERT INTO vk_callback_runtime (
      group_id, server_id, callback_url, secret, confirmation_code, status, last_error, updated_at
    ) VALUES (?, 7, 'https://example.com/api/integrations/vk/callback', 'secret', 'confirm', 'ready', NULL, ?)
    ON CONFLICT(group_id) DO UPDATE SET server_id=7, status='ready', last_error=NULL, updated_at=excluded.updated_at
  `, [groupId, new Date().toISOString()]);
};

const groupLookup = (id = 212761164) => ({ groups: [{ id, name: '2LA Noire', screen_name: '2lanoiremafia' }] });

describe('VK runtime health probe', () => {
  afterEach(() => restoreEnv());

  it('reports missing tokens without making API calls', async () => {
    process.env.VK_GROUP_ID = '212761164';
    delete process.env.VK_GROUP_ACCESS_TOKEN;
    delete process.env.VK_ACCESS_TOKEN;
    const db = await initDb(':memory:');
    await ensureVkIntegrationSchema(db);
    let publisherCalls = 0;
    let userCalls = 0;

    const result = await checkVkRuntimeHealth(db, {
      publisherApi: async () => { publisherCalls += 1; return groupLookup() as any; },
      userApi: async () => { userCalls += 1; return groupLookup() as any; },
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('publisher_token');
    expect(result.missing).toContain('user_token');
    expect(publisherCalls).toBe(0);
    expect(userCalls).toBe(0);
  });

  it('passes the full check when publisher, classic user token and callback are ready', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'group-secret';
    process.env.VK_ACCESS_TOKEN = 'user-secret';
    const db = await initDb(':memory:');
    await readyCallback(db);

    const result = await checkVkRuntimeHealth(db, {
      publisherApi: async (method, params) => {
        expect(method).toBe('groups.getById');
        expect(params.group_ids).toBe('212761164');
        return groupLookup() as any;
      },
      userApi: async () => groupLookup() as any,
    });

    expect(result.ok).toBe(true);
    expect(result.publisher.group_matches).toBe(true);
    expect(result.user_api.group_matches).toBe(true);
    expect(result.capabilities).toEqual({
      create_publications: true,
      read_votes: true,
      edit_existing_posts: true,
      receive_poll_callbacks: true,
    });
    expect(JSON.stringify(result)).not.toContain('group-secret');
    expect(JSON.stringify(result)).not.toContain('user-secret');
  });

  it('detects a token that resolves another community', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'group-secret';
    process.env.VK_ACCESS_TOKEN = 'user-secret';
    const db = await initDb(':memory:');
    await readyCallback(db);

    const result = await checkVkRuntimeHealth(db, {
      publisherApi: async () => groupLookup(999) as any,
      userApi: async () => groupLookup() as any,
    });

    expect(result.ok).toBe(false);
    expect(result.publisher.reachable).toBe(true);
    expect(result.publisher.group_matches).toBe(false);
    expect(result.missing).toContain('publisher_api');
  });

  it('separately reports classic edit-token and callback readiness', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'group-secret';
    delete process.env.VK_ACCESS_TOKEN;
    const db = await initDb(':memory:');
    await ensureVkIntegrationSchema(db);
    await db.run(`
      INSERT INTO vk_oauth_credentials (
        credential_key, access_token, refresh_token, device_id, user_id, scope, expires_at, updated_at
      ) VALUES ('user', 'managed-user-token', NULL, 'vkid-device', '1', 'wall groups', NULL, ?)
    `, [new Date().toISOString()]);

    const result = await checkVkRuntimeHealth(db, {
      publisherApi: async () => groupLookup() as any,
      userApi: async () => groupLookup() as any,
    });

    expect(result.ok).toBe(false);
    expect(result.capabilities.create_publications).toBe(true);
    expect(result.capabilities.edit_existing_posts).toBe(false);
    expect(result.capabilities.receive_poll_callbacks).toBe(false);
    expect(result.missing).toContain('classic_user_token_for_edit');
    expect(result.missing).toContain('callback');
  });
});
