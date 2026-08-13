import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  getVkCallbackConfig,
  getVkCallbackConfirmation,
  getVkDestinations,
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

const publicGroupId = () => {
  const destination = getVkDestinations().find((item) => item.key === 'public');
  const groupId = normalizeGroupId(destination?.groupId);
  if (!/^\d+$/.test(groupId)) throw new Error('Не удалось определить VK group_id для Callback API');
  return groupId;
};

const loadRuntime = (db: DatabaseWrapper, groupId: string) => db.get<RuntimeCallbackRow>(`
  SELECT group_id, server_id, callback_url, secret, confirmation_code, status, last_error, updated_at
    FROM vk_callback_runtime
   WHERE group_id = ?
   LIMIT 1
`, [normalizeGroupId(groupId)]);

export async function getVkCallbackRequestConfig(db: DatabaseWrapper, groupId: unknown) {
  const normalized = normalizeGroupId(groupId);
  if (!normalized) return { secret: '', confirmation: '' };
  const runtime = await loadRuntime(db, normalized);
  if (runtime?.secret && runtime?.confirmation_code) {
    return { secret: runtime.secret, confirmation: runtime.confirmation_code };
  }
  const legacy = getVkCallbackConfig();
  return {
    secret: legacy.secret,
    confirmation: getVkCallbackConfirmation(normalized),
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
  const groupId = publicGroupId();
  const normalizedUrl = String(callbackUrl || '').trim();
  if (!/^https:\/\//i.test(normalizedUrl)) throw new Error('Callback URL должен использовать HTTPS');

  const confirmation = await vkCommunityApi<{ code?: string }>('groups.getCallbackConfirmationCode', {
    group_id: Number(groupId),
  });
  const confirmationCode = String(confirmation?.code || '').trim();
  if (!confirmationCode) throw new Error('VK не вернул код подтверждения Callback API');

  const existingRuntime = await loadRuntime(db, groupId);
  const secret = existingRuntime?.secret || crypto.randomBytes(24).toString('hex');

  // Persist before add/edit: VK validates the endpoint during registration, so the
  // concurrently arriving confirmation request must already know both values.
  await saveRuntime(db, {
    groupId,
    callbackUrl: normalizedUrl,
    secret,
    confirmationCode,
    serverId: existingRuntime?.server_id || null,
    status: 'configuring',
  });

  try {
    const servers = await vkCommunityApi<{ count?: number; items?: CallbackServer[] }>('groups.getCallbackServers', {
      group_id: Number(groupId),
    });
    const existing = (servers?.items || []).find((item) => String(item?.url || '').replace(/\/$/, '') === normalizedUrl.replace(/\/$/, ''));
    let serverId = Number(existing?.id || existing?.server_id || existingRuntime?.server_id || 0);

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
    await saveRuntime(db, {
      groupId,
      callbackUrl: normalizedUrl,
      secret,
      confirmationCode,
      serverId: existingRuntime?.server_id || null,
      status: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getVkCallbackRuntimeStatus(db: DatabaseWrapper) {
  const groupId = publicGroupId();
  const runtime = await loadRuntime(db, groupId);
  if (!runtime) return { configured: false, status: 'not_configured', last_error: null };
  return {
    configured: runtime.status === 'ready' && Boolean(runtime.server_id),
    status: runtime.status,
    server_id: runtime.server_id,
    callback_url: runtime.callback_url,
    last_error: runtime.last_error,
    updated_at: runtime.updated_at,
  };
}
