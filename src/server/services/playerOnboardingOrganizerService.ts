import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerOnboardingSchema } from '../../db/ensurePlayerOnboardingSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';

export type OrganizerOnboardingPlatform = 'telegram' | 'vk';

const organizerOnboardingError = (code: string, message: string, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });

const channelLabel = (platform: OrganizerOnboardingPlatform) => platform === 'telegram' ? 'Telegram' : 'VK';

export async function recordNewPlayerOnboardingNotification(
  db: DatabaseWrapper,
  input: { playerId: string; nickname: string; platform: OrganizerOnboardingPlatform },
) {
  const now = new Date().toISOString();
  const automationKey = `verified-onboarding:new-player:${input.playerId}`;
  const existing = await db.get<{ id: string }>('SELECT id FROM organizer_tasks WHERE automation_key=? LIMIT 1', [automationKey]);
  if (existing?.id) return { created: false, taskId: String(existing.id) };

  const taskId = crypto.randomUUID();
  try {
    await db.run(`
      INSERT INTO organizer_tasks (
        id, title, description, type, status, priority, due_at, completed_at,
        automation_key, player_id, evening_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'other', 'todo', 'medium', NULL, NULL, ?, ?, NULL, ?, ?)
    `, [
      taskId,
      `Определить игровой уровень: ${input.nickname}`,
      `Новый профиль создан после подтверждения аккаунта через ${channelLabel(input.platform)}. Игровой уровень пока не определён; проверьте опыт игрока и назначьте допуск.`,
      automationKey,
      input.playerId,
      now,
      now,
    ]);
    return { created: true, taskId };
  } catch (error: any) {
    // Idempotent retry race: the unique automation_key wins, and the already-written
    // factual notification remains the canonical organizer-visible event.
    const raced = await db.get<{ id: string }>('SELECT id FROM organizer_tasks WHERE automation_key=? LIMIT 1', [automationKey]);
    if (raced?.id) return { created: false, taskId: String(raced.id) };
    throw error;
  }
}

export type PendingPlayerOnboardingLink = {
  id: string;
  platform: OrganizerOnboardingPlatform;
  target_player_id: string;
  nickname: string;
  created_at: string;
};

export async function listPendingPlayerOnboardingLinks(db: DatabaseWrapper): Promise<PendingPlayerOnboardingLink[]> {
  await ensurePlayerOnboardingSchema(db);
  const rows = await db.all<any>(`
    SELECT r.id, r.platform, r.target_player_id, p.nickname, r.created_at
      FROM player_onboarding_link_requests r
      JOIN players p ON p.id=r.target_player_id
     WHERE r.status='pending'
     ORDER BY r.created_at ASC, r.id ASC
     LIMIT 50
  `);
  return rows.map((row: any) => ({
    id: String(row.id),
    platform: String(row.platform) as OrganizerOnboardingPlatform,
    target_player_id: String(row.target_player_id),
    nickname: String(row.nickname),
    created_at: String(row.created_at),
  }));
}

export async function resolvePendingPlayerOnboardingLink(
  db: DatabaseWrapper,
  requestIdInput: unknown,
  decisionInput: unknown,
) {
  await ensurePlayerOnboardingSchema(db);
  const requestId = String(requestIdInput || '').trim();
  const decision = String(decisionInput || '').trim();
  if (!requestId) throw organizerOnboardingError('link_request_required', 'Запрос привязки не указан');
  if (decision !== 'approve' && decision !== 'reject') {
    throw organizerOnboardingError('link_decision_invalid', 'Решение должно быть approve или reject');
  }

  return db.transaction(async (tx) => {
    const row = await tx.get<any>(`
      SELECT id, platform, external_user_id, target_player_id, nickname, status
        FROM player_onboarding_link_requests
       WHERE id=?
       LIMIT 1
    `, [requestId]);
    if (!row) throw organizerOnboardingError('link_request_not_found', 'Запрос привязки не найден', 404);
    if (row.status !== 'pending') {
      return { status: String(row.status), requestId: String(row.id), playerId: String(row.target_player_id), changed: false };
    }

    const now = new Date().toISOString();
    if (decision === 'reject') {
      await tx.run(`
        UPDATE player_onboarding_link_requests
           SET status='rejected', resolved_at=?, updated_at=?
         WHERE id=? AND status='pending'
      `, [now, now, requestId]);
      return { status: 'rejected' as const, requestId, playerId: String(row.target_player_id), changed: true };
    }

    const platform = String(row.platform) as OrganizerOnboardingPlatform;
    const externalUserId = String(row.external_user_id);
    const targetPlayerId = String(row.target_player_id);
    const target = await tx.get<{ id: string; telegram_user_id: string | null }>(
      'SELECT id, telegram_user_id FROM players WHERE id=? LIMIT 1',
      [targetPlayerId],
    );
    if (!target) throw organizerOnboardingError('link_target_missing', 'Игровой профиль больше не существует', 409);

    if (platform === 'telegram') {
      const owner = await tx.get<{ id: string }>('SELECT id FROM players WHERE telegram_user_id=? LIMIT 1', [externalUserId]);
      if (owner?.id && String(owner.id) !== targetPlayerId) {
        throw organizerOnboardingError('telegram_identity_conflict', 'Этот Telegram уже связан с другим игровым профилем', 409);
      }
      if (target.telegram_user_id && String(target.telegram_user_id) !== externalUserId) {
        throw organizerOnboardingError('target_telegram_conflict', 'Выбранный игровой профиль уже связан с другим Telegram', 409);
      }
      if (!target.telegram_user_id) {
        await tx.run('UPDATE players SET telegram_user_id=?, updated_at=? WHERE id=? AND telegram_user_id IS NULL', [externalUserId, now, targetPlayerId]);
      }
    } else {
      await ensureVkIntegrationSchema(tx);
      const owner = await tx.get<{ player_id: string }>(`
        SELECT player_id FROM player_external_identities
         WHERE platform='vk' AND external_user_id=? LIMIT 1
      `, [externalUserId]);
      if (owner?.player_id && String(owner.player_id) !== targetPlayerId) {
        throw organizerOnboardingError('vk_identity_conflict', 'Этот VK уже связан с другим игровым профилем', 409);
      }
      const targetVk = await tx.get<{ external_user_id: string }>(`
        SELECT external_user_id FROM player_external_identities
         WHERE platform='vk' AND player_id=? LIMIT 1
      `, [targetPlayerId]);
      if (targetVk?.external_user_id && String(targetVk.external_user_id) !== externalUserId) {
        throw organizerOnboardingError('target_vk_conflict', 'Выбранный игровой профиль уже связан с другим VK', 409);
      }
      if (!owner?.player_id) {
        await tx.run(`
          INSERT INTO player_external_identities (
            platform, external_user_id, player_id, screen_name, display_name, linked_at, updated_at
          ) VALUES ('vk', ?, ?, NULL, NULL, ?, ?)
        `, [externalUserId, targetPlayerId, now, now]);
      }
    }

    await tx.run(`
      UPDATE player_onboarding_link_requests
         SET status='approved', resolved_at=?, updated_at=?
       WHERE id=? AND status='pending'
    `, [now, now, requestId]);
    return { status: 'approved' as const, requestId, playerId: targetPlayerId, changed: true };
  });
}
