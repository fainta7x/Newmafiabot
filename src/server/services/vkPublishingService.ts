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

const normalizeGroupId = (value: unknown): string | null => {
  const normalized = String(value || '').trim().replace(/^[-]/, '');
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
};

const normalizeUrl = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const getVkToken = () => String(process.env.VK_ACCESS_TOKEN || '').trim();
const getVkVersion = () => String(process.env.VK_API_VERSION || '5.199').trim() || '5.199';

export const getVkDestinations = (): VkDestination[] => {
  const publicGroupId = normalizeGroupId(process.env.VK_GROUP_ID);
  const channelGroupId = normalizeGroupId(process.env.VK_CHANNEL_GROUP_ID);
  const channelUrl = normalizeUrl(process.env.VK_CHANNEL_URL);

  return [
    {
      key: 'public',
      name: 'Паблик VK',
      groupId: publicGroupId,
      configuredUrl: publicGroupId ? `https://vk.com/club${publicGroupId}` : null,
      active: Boolean(publicGroupId),
      supported: Boolean(publicGroupId),
      reason: publicGroupId ? null : 'Не указан VK_GROUP_ID',
    },
    {
      key: 'channel',
      name: 'Канал VK',
      groupId: channelGroupId,
      configuredUrl: channelUrl || (channelGroupId ? `https://vk.com/club${channelGroupId}` : null),
      active: Boolean(channelGroupId || channelUrl),
      supported: Boolean(channelGroupId),
      reason: channelGroupId
        ? null
        : channelUrl
          ? 'Для нового объекта «Канал ВКонтакте» в публичной схеме VK API 5.199 нет отдельного метода публикации. Если канал является стеной сообщества, укажите VK_CHANNEL_GROUP_ID.'
          : 'Канал ещё не привязан',
    },
  ];
};

export const getVkCallbackConfig = () => ({
  secret: String(process.env.VK_CALLBACK_SECRET || '').trim(),
  confirmation: String(process.env.VK_CALLBACK_CONFIRMATION || '').trim(),
});

export function getVkIntegrationStatus() {
  const token = getVkToken();
  const destinations = getVkDestinations();
  const publicDestination = destinations.find((item) => item.key === 'public');
  const callback = getVkCallbackConfig();
  return {
    configured: Boolean(token && publicDestination?.groupId),
    token_configured: Boolean(token),
    group_id: publicDestination?.groupId || null,
    api_version: getVkVersion(),
    callback_secret_configured: Boolean(callback.secret),
    callback_confirmation_configured: Boolean(callback.confirmation),
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

const ownerIdForGroup = (groupId: string) => -Math.abs(Number(groupId));

export async function createVkPoll(groupId: string, question: string, answers: string[]): Promise<VkPoll> {
  return vkApi<VkPoll>('polls.create', {
    owner_id: ownerIdForGroup(groupId),
    question,
    is_anonymous: false,
    is_multiple: false,
    disable_unvote: false,
    add_answers: JSON.stringify(answers),
  });
}

export async function createVkWallPost(input: {
  groupId: string;
  message: string;
  attachments?: string[];
}): Promise<VkPublishResult> {
  const ownerId = ownerIdForGroup(input.groupId);
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
  await vkApi<number>('wall.edit', {
    owner_id: ownerIdForGroup(input.groupId),
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
