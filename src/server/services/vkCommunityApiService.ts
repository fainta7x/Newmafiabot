import { vkApi } from './vkPublishingService.ts';

type VkApiEnvelope<T> = {
  response?: T;
  error?: { error_code?: number; error_msg?: string };
};

const getVkVersion = () => String(process.env.VK_API_VERSION || '5.199').trim() || '5.199';
const getCommunityToken = () => String(process.env.VK_GROUP_ACCESS_TOKEN || '').trim();

export const hasVkCommunityToken = () => Boolean(getCommunityToken());

export async function vkCommunityApi<T>(
  method: string,
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const token = getCommunityToken();
  if (!token) return vkApi<T>(method, params);

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
