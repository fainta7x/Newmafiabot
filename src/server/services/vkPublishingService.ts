type VkApiEnvelope<T> = {
  response?: T;
  error?: { error_code?: number; error_msg?: string; request_params?: unknown[] };
};

export type VkDestinationKey = 'public' | 'channel';

export type VkDestination = {
  key: VkDestinationKey;
  name: string;
  groupId: string | null;
  configuredUrl: string | null;
  active: boolean;
  supported: boolean;
  reason: string | null;
};

export type VkPublishResult = {
  postId: number;
  ownerId: number;
  externalUrl: string;
  groupId: string;
};

export type VkPollAnswer = { id: number; text: string; votes?: number; rate?: number };
export type VkPoll = { id: number; owner_id: number; question: string; answers: VkPollAnswer[] };

const DEFAULT_PUBLIC_GROUP_ID = '212761164';
const DEFAULT_PUBLIC_URL = 'https://vk.ru/2lanoiremafia';
const DEFAULT_CHANNEL_URL = 'https://vk.ru/im/channels/-233806277';

let runtimeVkUserToken = '';
let runtimeVkUserTokenApiCompatible = true;

/**
 * VK ID login tokens (id.vk.com) are rejected by classic API methods such as
 * wall.edit (VK API 1051), so only API-compatible organizer tokens may be used
 * for API calls. The OAuth service marks VK ID-only credentials accordingly.
 */
export const setVkRuntimeUserToken = (value: unknown, options: { apiCompatible?: boolean } = {}) => {
  runtimeVkUserToken = String(value || '').trim();
  runtimeVkUserTokenApiCompatible = options.apiCompatible !== false;
};

const normalizeGroupId = (value: unknown): string | null => {
  const normalized = String(value || '').trim().replace(/^[-]/, '');
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
};

const normalizeChannelPeerId = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  if (!/^-?\d+$/.test(normalized) || Number(normalized) === 0) return null;
  return String(Number(normalized));
};

const normalizeUrl = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const getVkToken = () => (runtimeVkUserTokenApiCompatible ? runtimeVkUserToken : '')
  || String(process.env.VK_ACCESS_TOKEN || '').trim();
const getVkGroupToken = () => String(process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
const getVkLegacyUserToken = () => getVkToken();
const getVkPublisherToken = () => getVkGroupToken() || String(process.env.VK_ACCESS_TOKEN || '').trim();
const getVkVersion = () => String(process.env.VK_API_VERSION || '5.199').trim() || '5.199';
const getPublicGroupId = () => normalizeGroupId(process.env.VK_GROUP_ID || DEFAULT_PUBLIC_GROUP_ID);
const getPublicUrl = () => normalizeUrl(process.env.VK_GROUP_URL) || DEFAULT_PUBLIC_URL;
const getChannelUrl = () => normalizeUrl(process.env.VK_CHANNEL_URL) || DEFAULT_CHANNEL_URL;
const getChannelPeerId = () => {
  const publicAlias = getPublicGroupId() ? `-${getPublicGroupId()}` : null;
  // The old VK_CHANNEL_PEER_ID setting was populated from the browser URL and
  // is not trustworthy as an API conversation id. Only the explicitly named
  // API setting may enable automatic channel writes.
  const explicitPeerId = normalizeChannelPeerId(process.env.VK_CHANNEL_API_PEER_ID);
  // /im/channels/-<community_id> is a public browser route, not an API peer_id.
  // Treating it as a conversation produces a false `is_group_channel` error.
  if (!explicitPeerId || explicitPeerId === publicAlias) return null;
  return explicitPeerId;
};

export const hasVkPublisherToken = () => Boolean(getVkPublisherToken());
export const canEditVkWallPosts = () => Boolean(getVkLegacyUserToken());

export type VkWallEditCredential = { source: 'user'; token: string };

/**
 * Credentials that may edit a community wall post. wall.edit is a user-token
 * method: VK answers error 27 for community keys (verified against production).
 */
export const getVkWallEditCredentials = (): VkWallEditCredential[] => {
  const userToken = getVkLegacyUserToken();
  return userToken ? [{ source: 'user', token: userToken }] : [];
};

export const getVkDestinations = (): VkDestination[] => {
  const publicGroupId = getPublicGroupId();
  const channelPeerId = getChannelPeerId();

  return [
    {
      key: 'public',
      name: 'Паблик VK',
      groupId: publicGroupId,
      configuredUrl: getPublicUrl(),
      active: Boolean(publicGroupId),
      supported: Boolean(publicGroupId),
      reason: publicGroupId ? null : 'Не удалось определить VK-паблик',
    },
    {
      key: 'channel',
      name: 'Канал VK',
      groupId: channelPeerId,
      configuredUrl: getChannelUrl(),
      active: Boolean(getChannelUrl()),
      supported: Boolean(channelPeerId),
      reason: channelPeerId
        ? null
        : 'Автопубликация в каналы ещё недоступна через VK API. Кнопка «В канал» скопирует анонс и откроет канал для отправки.',
    },
  ];
};

export const getVkCallbackConfig = () => ({
  secret: String(process.env.VK_CALLBACK_SECRET || '').trim(),
  publicConfirmation: String(process.env.VK_CALLBACK_CONFIRMATION || '').trim(),
  channelConfirmation: String(process.env.VK_CHANNEL_CALLBACK_CONFIRMATION || '').trim(),
});

export const getVkCallbackConfirmation = (groupId: unknown): string => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) return '';
  const publicGroupId = getPublicGroupId();
  const channelGroupId = normalizeGroupId(getChannelPeerId());
  const callback = getVkCallbackConfig();
  if (publicGroupId && normalizedGroupId === publicGroupId) return callback.publicConfirmation;
  if (channelGroupId && normalizedGroupId === channelGroupId) {
    return channelGroupId === publicGroupId ? callback.publicConfirmation : callback.channelConfirmation;
  }
  return '';
};

export function getVkIntegrationStatus() {
  const token = getVkToken();
  const groupToken = getVkGroupToken();
  const publisherToken = getVkPublisherToken();
  const destinations = getVkDestinations();
  const publicDestination = destinations.find((item) => item.key === 'public');
  const supportedChannel = destinations.find((item) => item.key === 'channel' && item.active && item.supported);
  const callback = getVkCallbackConfig();
  const publicConfirmationReady = Boolean(callback.publicConfirmation);
  const channelUsesSameCommunity = Boolean(
    supportedChannel?.groupId
    && publicDestination?.groupId
    && normalizeGroupId(supportedChannel.groupId) === normalizeGroupId(publicDestination.groupId),
  );
  const channelConfirmationReady = !supportedChannel || channelUsesSameCommunity || Boolean(callback.channelConfirmation);
  return {
    configured: Boolean(publisherToken && publicDestination?.groupId),
    token_configured: Boolean(token),
    group_token_configured: Boolean(groupToken),
    publisher_token_configured: Boolean(publisherToken),
    publisher_token_source: groupToken ? 'community' : publisherToken ? 'legacy_user' : null,
    // wall.edit needs an API-compatible user token; the community key can
    // publish new posts but VK answers wall.edit with error 27 for it.
    public_post_edit_supported: Boolean(getVkLegacyUserToken() && publicDestination?.groupId),
    group_id: publicDestination?.groupId || null,
    public_url: publicDestination?.configuredUrl || null,
    channel_peer_id: supportedChannel?.groupId || null,
    channel_url: supportedChannel?.configuredUrl || null,
    api_version: getVkVersion(),
    callback_secret_configured: Boolean(callback.secret),
    callback_confirmation_configured: publicConfirmationReady && channelConfirmationReady,
    public_callback_confirmation_configured: publicConfirmationReady,
    channel_callback_confirmation_configured: channelConfirmationReady,
    destinations,
  };
}

export const callVkApi = async <T>(token: string, method: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
  // A definite failure means VK did not publish anything and a retry is safe; a network error
  // or a lost response leaves the outcome unknown.
  if (!token) throw Object.assign(new Error('VK access token is not configured'), { vkDefinite: true });

  const body = new URLSearchParams();
  body.set('access_token', token);
  body.set('v', getVkVersion());
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    body.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }

  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const payload = await response.json().catch(() => ({})) as VkApiEnvelope<T>;
  if (!response.ok) throw new Error(`VK HTTP ${response.status}`);
  if (payload.error) {
    const code = Number(payload.error.error_code || 0);
    // VK «unknown error» (1) and «internal server error» (10) may still have applied the call.
    const definite = code > 0 && code !== 1 && code !== 10;
    throw Object.assign(new Error(`VK API ${code || 'error'}: ${payload.error.error_msg || 'unknown error'}`), { vkDefinite: definite, vkErrorCode: code });
  }
  if (payload.response === undefined) throw new Error('VK API returned an empty response');
  return payload.response;
};

export async function vkApi<T>(method: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  return callVkApi<T>(getVkToken(), method, params);
}

export async function vkPublisherApi<T>(method: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  return callVkApi<T>(getVkPublisherToken(), method, params);
}

const vkChannelApi = async <T>(method: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
  const communityToken = getVkGroupToken();
  const userToken = getVkToken();
  if (!communityToken) return callVkApi<T>(userToken, method, params);
  try {
    return await callVkApi<T>(communityToken, method, params);
  } catch (communityError) {
    // VK may reject messages.send/messages.edit for the community key even when
    // the community has channel access. Retry with the connected organizer token.
    if (!userToken || userToken === communityToken) throw communityError;
    return callVkApi<T>(userToken, method, params);
  }
};

const rawOwnerIdForGroup = (groupId: string) => -Math.abs(Number(groupId));
const isChannelPeer = (groupId: string) => String(groupId || '').trim().startsWith('-');

const verifiedOwnerIdForGroup = async (groupId: string): Promise<number> => {
  const ownerId = rawOwnerIdForGroup(groupId);
  if (!Number.isFinite(ownerId) || ownerId >= 0) throw Object.assign(new Error('Некорректный VK community ID'), { vkDefinite: true });
  return ownerId;
};

export async function createVkPoll(groupId: string, question: string, answers: string[]): Promise<VkPoll> {
  const ownerId = await verifiedOwnerIdForGroup(groupId);
  return vkPublisherApi<VkPoll>('polls.create', {
    owner_id: ownerId,
    question,
    is_anonymous: false,
    is_multiple: false,
    disable_unvote: false,
    add_answers: JSON.stringify(answers),
  });
}

// Kept for test/runtime compatibility. Community channel routes do not need
// conversation discovery: VK exposes their destination as the negative channel ID.
export const resetVkChannelPeerDiscoveryCache = () => {};

const resolveVkChannelPeerId = async (configuredPeerId: number): Promise<number> => {
  if (!Number.isFinite(configuredPeerId) || configuredPeerId === 0) {
    throw new Error('Некорректный VK peer_id канала сообщества');
  }
  return configuredPeerId;
};
const parseSentMessageId = (value: any): number => {
  const candidate = typeof value === 'number'
    ? value
    : value?.message_id ?? value?.conversation_message_id ?? value?.[0]?.message_id ?? value?.[0];
  const id = Number(candidate);
  if (!Number.isFinite(id) || id <= 0) throw new Error('VK messages.send did not return message_id');
  return id;
};

const createVkChannelMessage = async (input: {
  peerId: number;
  message: string;
  attachments?: string[];
}): Promise<VkPublishResult> => {
  const peerId = await resolveVkChannelPeerId(input.peerId);
  const response = await vkChannelApi<any>('messages.send', {
    peer_id: peerId,
    group_id: Number(getPublicGroupId() || 0) || undefined,
    random_id: Math.floor(Math.random() * 2_000_000_000) + 1,
    message: input.message,
    attachment: input.attachments?.filter(Boolean).join(',') || undefined,
  });
  const messageId = parseSentMessageId(response);
  return {
    postId: messageId,
    ownerId: peerId,
    externalUrl: getChannelUrl(),
    groupId: String(input.peerId),
  };
};

const editVkChannelMessage = async (input: {
  peerId: number;
  messageId: number;
  message: string;
  attachments?: string[];
}): Promise<void> => {
  const peerId = await resolveVkChannelPeerId(input.peerId);
  await vkChannelApi<boolean | number>('messages.edit', {
    peer_id: peerId,
    group_id: Number(getPublicGroupId() || 0) || undefined,
    message_id: input.messageId,
    message: input.message,
    attachment: input.attachments?.filter(Boolean).join(',') || undefined,
  });
};

export async function createVkWallPost(input: {
  groupId: string;
  message: string;
  attachments?: string[];
}): Promise<VkPublishResult> {
  if (isChannelPeer(input.groupId)) {
    return createVkChannelMessage({
      peerId: Number(input.groupId),
      message: input.message,
      attachments: input.attachments,
    });
  }

  const ownerId = await verifiedOwnerIdForGroup(input.groupId);
  const result = await vkPublisherApi<{ post_id: number }>('wall.post', {
    owner_id: ownerId,
    from_group: true,
    message: input.message,
    attachments: input.attachments?.filter(Boolean).join(',') || undefined,
  });
  const postId = Number(result.post_id);
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('VK wall.post did not return post_id');
  return { postId, ownerId, externalUrl: `https://vk.com/wall${ownerId}_${postId}`, groupId: input.groupId };
}

export async function editVkWallPost(input: {
  groupId: string;
  postId: number;
  message: string;
  attachments?: string[];
}): Promise<void> {
  if (isChannelPeer(input.groupId)) {
    await editVkChannelMessage({
      peerId: Number(input.groupId),
      messageId: input.postId,
      message: input.message,
      attachments: input.attachments,
    });
    return;
  }

  const userToken = getVkLegacyUserToken();
  if (!userToken) {
    throw Object.assign(
      new Error('VK не разрешает ключу сообщества изменять уже опубликованный пост'),
      { code: 'vk_community_edit_unsupported' },
    );
  }
  await callVkApi<number>(userToken, 'wall.edit', {
    owner_id: await verifiedOwnerIdForGroup(input.groupId),
    post_id: input.postId,
    message: input.message,
    attachments: input.attachments?.filter(Boolean).join(',') || undefined,
  });
}

export type VkVoter = {
  id: number;
  first_name?: string;
  last_name?: string;
  screen_name?: string;
};

export type VkVotersByAnswer = {
  answer_id: number;
  users: { count: number; items: Array<number | VkVoter> };
};

export async function getVkPollVoters(ownerId: number, pollId: number, answerIds: number[]): Promise<VkVotersByAnswer[]> {
  if (!answerIds.length) return [];
  return vkApi<VkVotersByAnswer[]>('polls.getVoters', {
    owner_id: ownerId,
    poll_id: pollId,
    answer_ids: answerIds.join(','),
    count: 1000,
    fields: 'screen_name',
  });
}
