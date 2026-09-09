import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { getPlayerSessionId } from '../server/auth.ts';
import { setPlayerSessionCookie } from '../server/services/playerSessionCookie.ts';
import {
  completeVkPlayerOAuth,
  createVkPlayerOAuthStart,
  validateVkPlayerReturnPath,
} from '../server/services/vkPlayerAuthService.ts';

type StateRow = {
  state: string;
  verifier: string;
  redirect_uri: string;
  nickname: string;
  return_to: string;
  browser_binding_hash: string | null;
  initiating_player_id: string | null;
  consumed_at: string | null;
  created_at: string;
  expires_at: string;
};

function makeDb(linkedPlayerId: string | null = null) {
  const states = new Map<string, StateRow>();
  const db = {
    exec: vi.fn(async () => {}),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT INTO vk_player_oauth_states')) {
        const [state, verifier, redirectUri, nickname, returnTo, bindingHash, initiatingPlayerId, createdAt, expiresAt] = params;
        states.set(String(state), {
          state: String(state),
          verifier: String(verifier),
          redirect_uri: String(redirectUri),
          nickname: String(nickname),
          return_to: String(returnTo),
          browser_binding_hash: String(bindingHash),
          initiating_player_id: initiatingPlayerId == null ? null : String(initiatingPlayerId),
          consumed_at: null,
          created_at: String(createdAt),
          expires_at: String(expiresAt),
        });
        return { lastID: null, changes: 1 };
      }
      if (sql.includes('UPDATE vk_player_oauth_states') && sql.includes('SET consumed_at')) {
        const [consumedAt, state, now] = params;
        const row = states.get(String(state));
        if (!row || row.consumed_at || row.expires_at <= String(now)) return { lastID: null, changes: 0 };
        row.consumed_at = String(consumedAt);
        return { lastID: null, changes: 1 };
      }
      if (sql.includes('DELETE FROM vk_player_oauth_states WHERE state=?')) {
        const deleted = states.delete(String(params[0]));
        return { lastID: null, changes: deleted ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM vk_player_oauth_states WHERE expires_at')) {
        const now = String(params[0]);
        let changes = 0;
        for (const [key, row] of states) if (row.expires_at <= now) { states.delete(key); changes += 1; }
        return { lastID: null, changes };
      }
      return { lastID: null, changes: 1 };
    }),
    get: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('COUNT(*) AS count FROM vk_player_oauth_states')) {
        const [bindingHash, since] = params;
        return { count: [...states.values()].filter((row) => row.browser_binding_hash === String(bindingHash) && row.created_at > String(since)).length };
      }
      if (sql.includes('FROM vk_player_oauth_states')) {
        const row = states.get(String(params[0])) || null;
        return row && !row.consumed_at ? row : null;
      }
      if (sql.includes('FROM player_external_identities')) return linkedPlayerId ? { player_id: linkedPlayerId } : null;
      return null;
    }),
    all: vi.fn(async (sql: string) => {
      if (sql.includes('PRAGMA table_info(vk_player_oauth_states)')) {
        return ['state','verifier','redirect_uri','nickname','return_to','browser_binding_hash','initiating_player_id','consumed_at','created_at','expires_at'].map((name) => ({ name }));
      }
      return [];
    }),
    transaction: vi.fn(),
    sqlite: {} as any,
    drizzle: {} as any,
    dbPath: ':memory:',
  } as unknown as DatabaseWrapper;
  return { db, states };
}

const binding = 'browser_binding_abcdefghijklmnopqrstuvwxyz123456';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('VK canonical player authentication', () => {
  it('accepts only local player-cabinet return paths', () => {
    expect(validateVkPlayerReturnPath('/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('/player/profile?tab=games#top')).toBe('/player/profile?tab=games#top');
    expect(validateVkPlayerReturnPath('//evil.example/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('https://evil.example/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('/admin')).toBe('/player');
  });

  it('resolves an existing VK identity to the canonical player and consumes browser-bound OAuth state once', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db, states } = makeDb('player-existing');
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback',
      nickname: 'Dendi',
      returnTo: '/player/profile?tab=games',
      browserBinding: binding,
    });
    const authorize = new URL(start.authorize_url);
    const state = authorize.searchParams.get('state') || '';
    expect(states.has(state)).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'secret-not-logged', user_id: 777, state,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state, browserBinding: binding });
    expect(result).toMatchObject({
      vkUserId: '777', playerId: 'player-existing', initiatingPlayerId: null, nickname: 'Dendi', returnTo: '/player/profile?tab=games',
    });
    expect(states.get(state)?.consumed_at).toBeTruthy();
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state, browserBinding: binding }))
      .rejects.toMatchObject({ code: 'vk_state_expired' });
  });

  it('rejects a valid OAuth state presented from another browser binding without consuming it', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db, states } = makeDb(null);
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: 'BoundPlayer', returnTo: '/player', browserBinding: binding,
    });
    const state = new URL(start.authorize_url).searchParams.get('state') || '';
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state, browserBinding: `${binding}x` }))
      .rejects.toMatchObject({ code: 'vk_state_browser_mismatch' });
    expect(states.get(state)?.consumed_at).toBeNull();
  });

  it('records the canonical player that explicitly initiated VK linking instead of trusting callback cookies', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db } = makeDb(null);
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: 'Linked', returnTo: '/player/profile', browserBinding: binding, initiatingPlayerId: 'player-owner',
    });
    const state = new URL(start.authorize_url).searchParams.get('state') || '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'token', user_id: 999, state }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state, browserBinding: binding })).resolves.toMatchObject({
      vkUserId: '999', playerId: null, initiatingPlayerId: 'player-owner', returnTo: '/player/profile',
    });
  });

  it('returns no canonical player for a new VK identity so the existing registration service can create it exactly once', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db } = makeDb(null);
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: 'NewVkPlayer', returnTo: '/player', browserBinding: binding,
    });
    const state = new URL(start.authorize_url).searchParams.get('state') || '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'token', user_id: 888, state }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state, browserBinding: binding })).resolves.toMatchObject({
      vkUserId: '888', playerId: null, nickname: 'NewVkPlayer', returnTo: '/player',
    });
  });

  it('rate-limits repeated cabinet OAuth starts from the same browser binding', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db } = makeDb(null);
    for (let index = 0; index < 5; index += 1) {
      await createVkPlayerOAuthStart(db, {
        redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: `Player ${index}`, returnTo: '/player', browserBinding: binding,
      });
    }
    await expect(createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: 'Too Many', returnTo: '/player', browserBinding: binding,
    })).rejects.toMatchObject({ code: 'vk_auth_start_rate_limited', statusCode: 429 });
  });

  it('issues the same canonical player_token understood by protected player authentication', () => {
    let cookieName = '';
    let cookieValue = '';
    let cookieOptions: any = null;
    const res = {
      cookie(name: string, value: string, options: any) {
        cookieName = name; cookieValue = value; cookieOptions = options;
      },
    } as any;
    setPlayerSessionCookie(res, 'canonical-player');
    expect(cookieName).toBe('player_token');
    expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(getPlayerSessionId({ cookies: { player_token: cookieValue } } as any)).toBe('canonical-player');
  });
});