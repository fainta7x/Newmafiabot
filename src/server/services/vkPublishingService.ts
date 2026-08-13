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

const DEFAULT_PUBLIC_GROUP_ID = '233806277';
const DEFAULT_PUBLIC_SCREEN_NAME = '2lanoiremafia';
const DEFAULT_PUBLIC_URL = 'https://vk.ru/2lanoiremafia';
const DEFAULT_CHANNEL_PEER_ID = '-233806277';
const DEFAULT_CHANNEL_URL = 'https://vk.ru/im/channels/-233806277';

const normalizeGroupId = (value: unknown): string | null => {
  const normalized = String(value || '').trim().replace(/^[-]/, '');
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
};

const normalizeChannelPeerId = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  if (!/^-?\d+$/.test(normalized) || Number(normalized) === 0) return null;
  return String(-Math.abs(Number(normalized)));
};

const normalizeUrl = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const channelPeerFromUrl = (value: unknown): string | null => {
  const url = normalizeUrl(value);
  if (!url) return null;
  const match = url.match(/\/im\/channels\/(-?\d+)/i);
  return match ? normalizeChannelPeerId(match[1]) : null;
};

const getVkToken = () => String(process.env.VK_ACCESS_TOKEN || '').trim();
const getVkVersion = () => String(process.env.VK_API_VERSION || '5.199').trim() || '5.199';
const getPublicGroupId = () => normalizeGroupId(process.env.VK_GROUP_ID || DEFAULT_PUBLIC_GROUP_ID);
const getPublicScreenName = () => String(process.env.VK_GROUP_SCREEN_NAME || DEFAULT_PUBLIC_SCREEN_NAME).trim();
const getPublicUrl = () => normalizeUrl(process.env.VK_GROUP_URL) || DEFAULT_PUBLIC_URL;
const getChannelUrl = () => normalizeUrl(process.env.VK_CHANNEL_URL) || DEFAULT_CHANNEL_URL;
const getChannelPeerId = () => normalizeChannelPeerId(process.env.VK_CHANNEL_PEER_ID)
  || normalizeChannelPeerId(process.env.VK_CHANNEL_GROUP_ID)
  || channelPeerFromUrl(getChannelUrl())
  || DEFAULT_CHANNEL_PEER_ID;

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
      // Signed negative value is intentional: it distinguishes a Messenger group-channel peer
      // from the public community wall while still mapping to the same VK community owner.
      groupId: channelPeerId,
      configuredUrl: getChannelUrl(),
      active: Boolean(channelPeerId),
      supported: Boolean(channelPeerId),
      reason: channelPeerId ? null : 'Не удалось определить peer_id VK-канала',
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
    configured: Boolean(token && publicDestination?.groupId),
    token_configured: Boolean(token),
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

export async function vkApi<T>(method: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const token = getVkToken();
  if (!token) throw new Error('VK_ACCESS_TOKEN is not configured');

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
    throw new Error(`VK API ${code || 'error'}: ${payload.error.error_msg || 'unknown error'}`);
  }
  if (payload.response === undefined) throw new Error('VK API returned an empty response');
  return payload.response;
}

const rawOwnerIdForGroup = (groupId: string) => -Math.abs(Number(groupId));
const isChannelPeer = (groupId: string) => String(groupId || '').trim().startsWith('-');

const verifiedOwnerIdForGroup = async (groupId: string): Promise<number> => {
  const ownerId = rawOwnerIdForGroup(groupId);
  if (!Number.isFinite(ownerId) || ownerId >= 0) throw new Error('Некорректный VK community ID');

  const configuredPublicId = getPublicGroupId();
  const screenName = getPublicScreenName();
  if (configuredPublicId && screenName && String(Math.abs(ownerId)) === configuredPublicId) {
    const resolved = await vkApi<{ object_id?: number; group_id?: number; type?: string }>('utils.resolveScreenName', {
      screen_name: screenName,
    });
    const resolvedId = Number(resolved?.group_id || resolved?.object_id || 0);
    const communityType = ['group', 'page', 'event'].includes(String(resolved?.type || ''));
    if (!communityType || !Number.isFinite(resolvedId) || resolvedId <= 0) {
      throw new Error(`VK short name @${screenName} не является сообществом`);
    }
    if (String(resolvedId) !== configuredPublicId) {
      throw new Error(`VK-паблик @${screenName} имеет ID ${resolvedId}, ожидался ${configuredPublicId}. Публикация остановлена.`);
    }
  }
  return ownerId;
};

export async function createVkPoll(groupId: string, question: string, answers: string[]): Promise<VkPoll> {
  const ownerId = await verifiedOwnerIdForGroup(groupId);
  return vkApi<VkPoll>('polls.create', {
    owner_id: ownerId,
    question,
    is_anonymous: false,
    is_multiple: false,
    disable_unvote: false,
    add_answers: JSON.stringify(answers),
  });
}

const requireVkGroupChannel = async (peerId: number): Promise<void> => {
  const result = await vkApi<any>('messages.getConversationsById', {
    peer_ids: String(peerId),
  });
  const conversation = Array.isArray(result?.items) ? result.items[0] : null;
  if (!conversation) throw new Error(`VK-канал ${peerId} не найден или недоступен текущему токену`);
  if (conversation?.chat_settings?.is_group_channel !== true) {
    throw new Error(`VK peer ${peerId} не подтверждён API как group channel`);
  }
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
  await requireVkGroupChannel(input.peerId);
  const response = await vkApi<any>('messages.send', {
    peer_id: input.peerId,
    random_id: Math.floor(Math.random() * 2_000_000_000) + 1,
    message: input.message,
    attachment: input.attachments?.filter(Boolean).join(',') || undefined,
  });
  const messageId = parseSentMessageId(response);
  return {
    postId: messageId,
    ownerId: input.peerId,
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
  await requireVkGroupChannel(input.peerId);
  await vkApi<boolean | number>('messages.edit', {
    peer_id: input.peerId,
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
  const result = await vkApi<{ post_id: number }>('wall.post', {
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

  await vkApi<number>('wall.edit', {
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
