import type { DatabaseWrapper } from '../../db/index.ts';
import { getVkCallbackRuntimeStatus } from './vkCallbackSetupService.ts';
import { getVkOAuthStatus } from './vkOAuthService.ts';
import { getVkIntegrationStatus } from './vkPublishingService.ts';
import { vkCommunityApi } from './vkCommunityApiService.ts';

type VkApiCaller = (
  method: string,
  params: Record<string, string | number | boolean | null | undefined>,
) => Promise<unknown>;

type VkGroup = {
  id?: number;
  name?: string;
  screen_name?: string;
};

export type VkRuntimeHealth = {
  ok: boolean;
  checked_at: string;
  vk: {
    configured: boolean;
    reachable: boolean;
    group_id: string | null;
    group_name: string | null;
    screen_name: string | null;
    token_source: string | null;
    api_version: string;
    error: string | null;
  };
  oauth: {
    connected: boolean;
    api_compatible: boolean;
    token_source: string | null;
    user_id: string | null;
    expires_at: string | null;
  };
  callback: {
    configured: boolean;
    status: string;
    group_id: string | null;
    server_id: number | null;
    callback_url: string | null;
    last_error: string | null;
    updated_at: string | null;
  };
};

const normalizeGroupId = (value: unknown) => String(value || '').trim().replace(/^-/, '');

const extractGroup = (payload: any): VkGroup | null => {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.groups)) return payload.groups[0] || null;
  if (Array.isArray(payload?.items)) return payload.items[0] || null;
  if (payload && typeof payload === 'object' && (payload.id || payload.name || payload.screen_name)) return payload;
  return null;
};

const defaultApiCaller: VkApiCaller = (method, params) => vkCommunityApi<unknown>(method, params);

export async function checkVkRuntimeHealth(
  db: DatabaseWrapper,
  apiCaller: VkApiCaller = defaultApiCaller,
): Promise<VkRuntimeHealth> {
  const integration = getVkIntegrationStatus();
  const [oauth, callback] = await Promise.all([
    getVkOAuthStatus(db),
    getVkCallbackRuntimeStatus(db),
  ]);

  const groupId = normalizeGroupId(integration.group_id) || null;
  const tokenAvailable = Boolean(
    integration.group_token_configured
    || integration.token_configured
    || oauth.managed_connected,
  );
  const configured = Boolean(groupId && tokenAvailable);

  let reachable = false;
  let groupName: string | null = null;
  let screenName: string | null = null;
  let error: string | null = null;

  if (!groupId) {
    error = 'VK_GROUP_ID is not configured';
  } else if (!tokenAvailable) {
    error = 'VK access token is not configured';
  } else {
    try {
      const response = await apiCaller('groups.getById', {
        group_id: Number(groupId),
        fields: 'name,screen_name',
      });
      const group = extractGroup(response);
      const returnedGroupId = normalizeGroupId(group?.id);
      if (!group || !returnedGroupId) throw new Error('VK API did not return the configured community');
      if (returnedGroupId !== groupId) {
        throw new Error(`VK API returned community ${returnedGroupId} instead of ${groupId}`);
      }
      reachable = true;
      groupName = group.name ? String(group.name) : null;
      screenName = group.screen_name ? String(group.screen_name) : null;
    } catch (probeError: any) {
      error = probeError?.message || 'VK API is unavailable';
    }
  }

  return {
    ok: configured && reachable && Boolean(callback.configured),
    checked_at: new Date().toISOString(),
    vk: {
      configured,
      reachable,
      group_id: groupId,
      group_name: groupName,
      screen_name: screenName,
      token_source: integration.publisher_token_source || oauth.token_source || null,
      api_version: String(integration.api_version || '5.199'),
      error,
    },
    oauth: {
      connected: Boolean(oauth.managed_connected),
      api_compatible: Boolean(oauth.api_compatible),
      token_source: oauth.token_source || null,
      user_id: oauth.user_id || null,
      expires_at: oauth.expires_at || null,
    },
    callback: {
      configured: Boolean(callback.configured),
      status: String(callback.status || 'not_configured'),
      group_id: callback.group_id ? String(callback.group_id) : null,
      server_id: callback.server_id == null ? null : Number(callback.server_id),
      callback_url: callback.callback_url ? String(callback.callback_url) : null,
      last_error: callback.last_error ? String(callback.last_error) : null,
      updated_at: callback.updated_at ? String(callback.updated_at) : null,
    },
  };
}
