import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  getVkCallbackConfig,
  getVkCallbackConfirmation,
  getVkDestinations,
  vkApi,
} from './vkPublishingService.ts';
import { vkCommunityApi } from './vkCommunityApiService.ts';

type RuntimeCallbackRow = {
  group_id: string;
  server_id: number | null;
  callback_url: string;
  secret: string;
  confirmation_code: string;
  status: string;
  last_error: string | null;
  updated_at: string;
};

type CallbackServer = {
  id?: number;
  server_id?: number;
  url?: string;
  title?: string;
  status?: string;
};

const normalizeGroupId = (value: unknown) => String(value || '').trim().replace(/^-/, '');
const nowIso = () => new Date().toISOString();

const configuredPublicDestination = () => getVkDestinations().find((item) => item.key === 'public');

const configuredPublicGroupId = () => {
  const groupId = normalizeGroupId(configuredPublicDestination()?.groupId);
  if (!/^\d+$/.test(groupId)) throw new Error('Не удалось определить VK group_id для Callback API');
  return groupId;
};

const publicScreenName = () => {
  const configuredUrl = String(configuredPublicDestination()?.configuredUrl || '').trim();
  if (!configuredUrl) return '';
  try {
    const url = new URL(configuredUrl);
    return url.pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return configuredUrl.split('/').filter(Boolean).pop() || '';
  }
};

const resolvePublicGroupId = async () => {
  const fallback = configuredPublicGroupId();
  const screenName = publicScreenName();
  if (!screenName || /^\d+$/.test(screenName)) return fallback;

  try {
    const resolved = await vkApi<{ object_id?: number; group_id?: number; type?: string }>('utils.resolveScreenName', {
      screen_name: screenName,
    });
    const resolvedId = Number(resolved?.group_id || resolved?.object_id || 0);
    const isCommunity = ['group', 'page', 'event'].includes(String(resolved?.type || ''));
    if (isCommunity && Number.isFinite(resolvedId) && resolvedId > 0) return String(resolvedId);
  } catch (error) {
    console.warn('[VK CALLBACK] Could not resolve public screen name, using configured group id:', error);
  }
  return fallback;
};

const loadRuntime = (db: DatabaseWrapper, groupId: string) => db.get<RuntimeCallbackRow>(`
  SELECT group_id, server_id, callback_url, secret, confirmation_code, status, last_error, updated_at
    FROM vk_callback_runtime
   WHERE group_id = ?
   LIMIT 1
`, [normalizeGroupId(groupId)]);

const loadLatestRuntime = (db: DatabaseWrapper) => db.get<RuntimeCallbackRow>(`
  SELECT group_id, server_id, callback_url, secret, confirmation_code, status, last_error, updated_at
    FROM vk_callback_runtime
   ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC
   LIMIT 1
`);

export async function getVkCallbackRequestConfig(db: DatabaseWrapper, groupId: unknown) {
  const normalized = normalizeGroupId(groupId);
  if (!normalized) return { secret: '', confirmation: '', runtime: false };
  const runtime = await loadRuntime(db, normalized);
  if (runtime) {
    return {
      secret: runtime.secret || '',
      confirmation: runtime.confirmation_code || '',
      runtime: true,
    };
  }
  const legacy = getVkCallbackConfig();
  return {
    secret: legacy.secret,
    confirmation: getVkCallbackConfirmation(normalized),
    runtime: false,
  };
}

const saveRuntime = async (db: DatabaseWrapper, input: {
  groupId: string;
  callbackUrl: string;
  secret: string;
  confirmationCode: string;
  serverId?: number | null;
  status: string;
  lastError?: string | null;
}) => {
  await db.run(`
    INSERT INTO vk_callback_runtime (
      group_id, server_id, callback_url, secret, confirmation_code, status, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      server_id=excluded.server_id,
      callback_url=excluded.callback_url,
      secret=excluded.secret,
      confirmation_code=excluded.confirmation_code,
      status=excluded.status,
      last_error=excluded.last_error,
      updated_at=excluded.updated_at
  `, [
    input.groupId,
    input.serverId ?? null,
    input.callbackUrl,
    input.secret,
    input.confirmationCode,
    input.status,
    input.lastError || null,
    nowIso(),
  ]);
};

export async function ensureVkCallbackRegistration(db: DatabaseWrapper, callbackUrl: string) {
  const normalizedUrl = String(callbackUrl || '').trim();
  if (!/^https:\/\//i.test(normalizedUrl)) throw new Error('Callback URL должен использовать HTTPS');

  const configuredGroupId = configuredPublicGroupId();
  const groupId = await resolvePublicGroupId();
  const existingForGroup = await loadRuntime(db, groupId);
  const previousRuntime = existingForGroup
    || (groupId !== configuredGroupId ? await loadRuntime(db, configuredGroupId) : null)
    || await loadLatestRuntime(db);
  const secret = existingForGroup?.secret || previousRuntime?.secret || crypto.randomBytes(24).toString('hex');
  let confirmationCode = existingForGroup?.confirmation_code || '';
  let serverId = Number(existingForGroup?.server_id || 0);

  try {
    const confirmation = await vkCommunityApi<{ code?: string }>('groups.getCallbackConfirmationCode', {
      group_id: Number(groupId),
    });
    confirmationCode = String(confirmation?.code || '').trim();
    if (!confirmationCode) throw new Error('VK не вернул код подтверждения Callback API');

    // Persist before add/edit: VK validates the endpoint during registration, so the
    // concurrently arriving confirmation request must already know both values.
    await saveRuntime(db, {
      groupId,
      callbackUrl: normalizedUrl,
      secret,
      confirmationCode,
      serverId: serverId || null,
      status: 'configuring',
    });

    const servers = await vkCommunityApi<{ count?: number; items?: CallbackServer[] }>('groups.getCallbackServers', {
      group_id: Number(groupId),
    });
    const existing = (servers?.items || []).find((item) => String(item?.url || '').replace(/\/$/, '') === normalizedUrl.replace(/\/$/, ''));
    serverId = Number(existing?.id || existing?.server_id || serverId || 0);

    if (serverId > 0) {
      await vkCommunityApi<number | boolean>('groups.editCallbackServer', {
        group_id: Number(groupId),
        server_id: serverId,
        url: normalizedUrl,
        title: '2LA Noire',
        secret_key: secret,
      });
    } else {
      const added = await vkCommunityApi<{ server_id?: number }>('groups.addCallbackServer', {
        group_id: Number(groupId),
        url: normalizedUrl,
        title: '2LA Noire',
        secret_key: secret,
      });
      serverId = Number(added?.server_id || 0);
      if (!Number.isFinite(serverId) || serverId <= 0) throw new Error('VK не вернул server_id Callback API');
    }

    await saveRuntime(db, {
      groupId,
      callbackUrl: normalizedUrl,
      secret,
      confirmationCode,
      serverId,
      status: 'configuring',
    });

    await vkCommunityApi<number | boolean>('groups.setCallbackSettings', {
      group_id: Number(groupId),
      server_id: serverId,
      api_version: '5.199',
      poll_vote_new: true,
    });

    await saveRuntime(db, {
      groupId,
      callbackUrl: normalizedUrl,
      secret,
      confirmationCode,
      serverId,
      status: 'ready',
    });

    return { configured: true, group_id: groupId, server_id: serverId, callback_url: normalizedUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await saveRuntime(db, {
      groupId,
      callbackUrl: normalizedUrl,
      secret,
      confirmationCode,
      serverId: serverId || null,
      status: 'error',
      lastError: errorMessage,
    });
    throw error;
  }
}

export async function getVkCallbackRuntimeStatus(db: DatabaseWrapper) {
  const configuredId = configuredPublicGroupId();
  const configuredRuntime = await loadRuntime(db, configuredId);
  const latestRuntime = await loadLatestRuntime(db);
  const runtime = configuredRuntime?.status === 'ready'
    ? configuredRuntime
    : latestRuntime || configuredRuntime;
  if (!runtime) return { configured: false, status: 'not_configured', group_id: configuredId, last_error: null };
  return {
    configured: runtime.status === 'ready' && Boolean(runtime.server_id),
    status: runtime.status,
    group_id: runtime.group_id,
    server_id: runtime.server_id,
    callback_url: runtime.callback_url,
    last_error: runtime.last_error,
    updated_at: runtime.updated_at,
  };
}
