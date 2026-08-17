import type { DatabaseWrapper } from '../../db/index.ts';
import { getVkCallbackRuntimeStatus } from './vkCallbackSetupService.ts';
import { getVkOAuthStatus } from './vkOAuthService.ts';
import {
  getVkIntegrationStatus,
  vkApi,
  vkPublisherApi,
} from './vkPublishingService.ts';

type VkApiCall = <T>(method: string, params: Record<string, string | number | boolean | null | undefined>) => Promise<T>;

type GroupLookup = {
  groups?: Array<{ id?: number; name?: string; screen_name?: string }>;
};

type ApiProbe = {
  configured: boolean;
  reachable: boolean;
  group_matches: boolean;
  group_id: string | null;
  group_name: string | null;
  error: string | null;
};

export type VkRuntimeHealth = {
  ok: boolean;
  checked_at: string;
  publisher: ApiProbe & { token_source: string | null };
  user_api: ApiProbe & { token_source: string | null; api_compatible: boolean };
  callback: {
    configured: boolean;
    status: string;
    callback_url: string | null;
    last_error: string | null;
  };
  capabilities: {
    create_publications: boolean;
    read_votes: boolean;
    edit_existing_posts: boolean;
    receive_poll_callbacks: boolean;
  };
  missing: string[];
};

const normalizedGroupId = (value: unknown) => String(value || '').trim().replace(/^-/, '');

const groupFromLookup = (lookup: GroupLookup | null | undefined) => Array.isArray(lookup?.groups) ? lookup!.groups![0] || null : null;

const probeGroup = async (
  call: VkApiCall,
  configured: boolean,
  expectedGroupId: string,
): Promise<ApiProbe> => {
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      group_matches: false,
      group_id: expectedGroupId || null,
      group_name: null,
      error: 'token_not_configured',
    };
  }
  try {
    const lookup = await call<GroupLookup>('groups.getById', { group_ids: expectedGroupId });
    const group = groupFromLookup(lookup);
    const actualId = normalizedGroupId(group?.id);
    return {
      configured: true,
      reachable: Boolean(group),
      group_matches: Boolean(group && actualId === expectedGroupId),
      group_id: actualId || expectedGroupId || null,
      group_name: group?.name ? String(group.name) : null,
      error: group ? null : 'VK API returned no community',
    };
  } catch (error: any) {
    return {
      configured: true,
      reachable: false,
      group_matches: false,
      group_id: expectedGroupId || null,
      group_name: null,
      error: error?.message || 'vk_api_failed',
    };
  }
};

export async function checkVkRuntimeHealth(
  db: DatabaseWrapper,
  dependencies: { publisherApi?: VkApiCall; userApi?: VkApiCall } = {},
): Promise<VkRuntimeHealth> {
  const integration = getVkIntegrationStatus();
  const oauth = await getVkOAuthStatus(db);
  const callback = await getVkCallbackRuntimeStatus(db);
  const expectedGroupId = normalizedGroupId(integration.group_id);
  const publisher = await probeGroup(
    dependencies.publisherApi || vkPublisherApi,
    Boolean(integration.publisher_token_configured && expectedGroupId),
    expectedGroupId,
  );
  const userApi = await probeGroup(
    dependencies.userApi || vkApi,
    Boolean(integration.token_configured && expectedGroupId),
    expectedGroupId,
  );

  const capabilities = {
    create_publications: publisher.reachable && publisher.group_matches,
    read_votes: userApi.reachable && userApi.group_matches,
    edit_existing_posts: Boolean(integration.public_post_edit_supported),
    receive_poll_callbacks: Boolean(callback.configured),
  };

  const missing: string[] = [];
  if (!integration.publisher_token_configured) missing.push('publisher_token');
  else if (!capabilities.create_publications) missing.push('publisher_api');
  if (!integration.token_configured) missing.push('user_token');
  else if (!capabilities.read_votes) missing.push('user_api');
  if (!capabilities.edit_existing_posts) missing.push('classic_user_token_for_edit');
  if (!capabilities.receive_poll_callbacks) missing.push('callback');

  return {
    ok: Object.values(capabilities).every(Boolean),
    checked_at: new Date().toISOString(),
    publisher: {
      ...publisher,
      token_source: integration.publisher_token_source,
    },
    user_api: {
      ...userApi,
      token_source: oauth.token_source,
      api_compatible: Boolean(oauth.api_compatible),
    },
    callback: {
      configured: Boolean(callback.configured),
      status: String(callback.status || 'not_configured'),
      callback_url: 'callback_url' in callback ? String(callback.callback_url || '') || null : null,
      last_error: callback.last_error ? String(callback.last_error) : null,
    },
    capabilities,
    missing,
  };
}
