const VK_API_BASE = 'https://api.vk.com/method';
const DEFAULT_VK_API_VERSION = '5.199';

export type VkPublishingStatus = {
  configured: boolean;
  group_id: number | null;
  api_version: string;
  missing: string[];
};

type VkApiResponse<T> = {
  response?: T;
  error?: {
    error_code?: number;
    error_msg?: string;
  };
};

const normalizedGroupId = () => {
  const value = Number.parseInt(String(process.env.VK_GROUP_ID || '').trim(), 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

export const getVkPublishingStatus = (): VkPublishingStatus => {
  const groupId = normalizedGroupId();
  const token = String(process.env.VK_ACCESS_TOKEN || '').trim();
  const missing: string[] = [];
  if (!groupId) missing.push('VK_GROUP_ID');
  if (!token) missing.push('VK_ACCESS_TOKEN');
  return {
    configured: missing.length === 0,
    group_id: groupId,
    api_version: String(process.env.VK_API_VERSION || DEFAULT_VK_API_VERSION).trim() || DEFAULT_VK_API_VERSION,
    missing,
  };
};

export async function publishVkWallPost(input: { message: string; attachments?: string[] }): Promise<{ post_id: number; owner_id: number }> {
  const status = getVkPublishingStatus();
  const token = String(process.env.VK_ACCESS_TOKEN || '').trim();
  if (!status.configured || !status.group_id || !token) {
    throw Object.assign(new Error('VK не настроен'), { statusCode: 503, missing: status.missing });
  }

  const message = String(input.message || '').trim();
  const attachments = (input.attachments || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!message && !attachments.length) {
    throw Object.assign(new Error('Для публикации нужен текст или вложение'), { statusCode: 400 });
  }

  const ownerId = -status.group_id;
  const body = new URLSearchParams({
    owner_id: String(ownerId),
    from_group: '1',
    message,
    access_token: token,
    v: status.api_version,
  });
  if (attachments.length) body.set('attachments', attachments.join(','));

  const response = await fetch(`${VK_API_BASE}/wall.post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const payload = await response.json().catch(() => ({})) as VkApiResponse<{ post_id?: number }>;
  if (!response.ok || payload.error || !Number.isFinite(Number(payload.response?.post_id))) {
    const messageText = payload.error?.error_msg || `VK HTTP ${response.status}`;
    throw Object.assign(new Error(messageText), { statusCode: 502, vk_error_code: payload.error?.error_code || null });
  }

  return { post_id: Number(payload.response?.post_id), owner_id: ownerId };
}
