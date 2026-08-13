import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { findPlayersByNickname } from './playerRegistrationService.ts';
import { parseResponseStatus, setParticipantResponse } from './eveningParticipantState.ts';
import { runCrmAutomations } from './crmAutomationService.ts';

export type VkJoinParticipants = {
  going: string[];
  late: string[];
  thinking: string[];
};

export const loadVkJoinCounts = async (db: DatabaseWrapper, eveningId: string) => {
  const row = await db.get<any>(`
    SELECT
      SUM(CASE WHEN response_status = 'going' THEN 1 ELSE 0 END) AS going,
      SUM(CASE WHEN response_status = 'late' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN response_status = 'thinking' THEN 1 ELSE 0 END) AS thinking,
      SUM(CASE WHEN response_status = 'declined' THEN 1 ELSE 0 END) AS declined
      FROM evening_participants WHERE evening_id = ?
  `, [eveningId]);
  return {
    going: Number(row?.going || 0),
    late: Number(row?.late || 0),
    thinking: Number(row?.thinking || 0),
    declined: Number(row?.declined || 0),
  };
};

export const loadVkJoinParticipants = async (db: DatabaseWrapper, eveningId: string): Promise<VkJoinParticipants> => {
  const rows = await db.all<any>(`
    SELECT ep.response_status, p.nickname
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ?
       AND ep.response_status IN ('going', 'late', 'thinking')
     ORDER BY COALESCE(ep.registered_at, ep.created_at) ASC, p.nickname COLLATE NOCASE ASC
  `, [eveningId]);
  const result: VkJoinParticipants = { going: [], late: [], thinking: [] };
  for (const row of rows) {
    const status = String(row?.response_status || '') as keyof VkJoinParticipants;
    const nickname = String(row?.nickname || '').trim();
    if (nickname && status in result) result[status].push(nickname);
  }
  return result;
};

export async function registerVkPlayer(db: DatabaseWrapper, vkUserId: string, nicknameInput: unknown) {
  const nickname = String(nicknameInput || '').trim().replace(/\s+/g, ' ');
  if (!nickname) throw Object.assign(new Error('Введите игровой ник'), { statusCode: 400, code: 'nickname_required' });
  if (nickname.length > 60 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    throw Object.assign(new Error('Некорректный игровой ник'), { statusCode: 400, code: 'nickname_invalid' });
  }
  const existingLink = await db.get<{ player_id: string }>(`
    SELECT player_id FROM player_external_identities
     WHERE platform='vk' AND external_user_id=? LIMIT 1
  `, [vkUserId]);
  if (existingLink?.player_id) return { created: false, playerId: String(existingLink.player_id) };

  const matches = await findPlayersByNickname(db, nickname);
  if (matches.length) {
    throw Object.assign(new Error('Игрок с таким ником уже есть. Откройте приложение через Telegram или попросите организатора привязать VK.'), {
      statusCode: 409,
      code: 'nickname_taken',
    });
  }

  const now = new Date().toISOString();
  const playerId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.run(`
      INSERT INTO players (
        id, telegram_user_id, nickname, full_name, telegram_username,
        phone, contact_status, lifecycle_status, source, notes,
        game_level, judge_level, elo, elo_seed, elo_seed_reason, elo_seed_set_at,
        tokens, created_at, updated_at
      ) VALUES (?, NULL, ?, NULL, NULL, NULL, 'normal', 'normal', 'vk_self_registration', NULL,
                'novice', 'none', 1000, 1000, 'Новый игрок', ?, 0, ?, ?)
    `, [playerId, nickname, now, now, now]);
    await tx.run(`
      INSERT INTO player_external_identities (
        platform, external_user_id, player_id, linked_at, updated_at
      ) VALUES ('vk', ?, ?, ?, ?)
    `, [vkUserId, playerId, now, now]);
  });
  return { created: true, playerId };
}

export async function saveVkJoinResponse(db: DatabaseWrapper, eveningId: string, playerId: string, rawStatus: unknown) {
  const statusValue = String(rawStatus || '');
  if (!['going', 'late', 'thinking', 'declined'].includes(statusValue)) {
    throw Object.assign(new Error('Некорректный ответ'), { statusCode: 400 });
  }
  const evening = await db.get<any>(`
    SELECT id, status, settled_at, format, default_price FROM game_evenings WHERE id=? LIMIT 1
  `, [eveningId]);
  if (!evening) throw Object.assign(new Error('Игровой вечер не найден'), { statusCode: 404 });
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    throw Object.assign(new Error('Ответы на этот вечер уже недоступны'), { statusCode: 410 });
  }
  const player = await db.get<any>('SELECT id, game_level FROM players WHERE id=? LIMIT 1', [playerId]);
  if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  if (!playerLevelAllowsEveningFormat(player.game_level, evening.format)) {
    throw Object.assign(new Error('Этот формат вечера пока недоступен вашему профилю'), { statusCode: 403 });
  }

  const responseStatus = parseResponseStatus(statusValue);
  const now = new Date().toISOString();
  const participant = await db.get<any>(`
    SELECT * FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1
  `, [eveningId, playerId]);
  const amountDue = ['going', 'late'].includes(responseStatus) ? Number(evening.default_price || 0) : 0;

  if (!participant) {
    await db.run(`
      INSERT INTO evening_participants (
        id, evening_id, player_id, table_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes,
        registered_at, confirmed_at, checked_in_at, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, 'pending', 'unknown', 'unpaid', ?, 0, NULL, ?, ?, NULL, ?, ?)
    `, [
      crypto.randomUUID(), eveningId, playerId, responseStatus, responseStatus, amountDue, now,
      ['going', 'late'].includes(responseStatus) ? now : null, now, now,
    ]);
  } else {
    await setParticipantResponse(db, String(participant.id), responseStatus);
    if (Number(participant.amount_paid || 0) === 0 && String(participant.payment_status || 'unpaid') === 'unpaid') {
      await db.run('UPDATE evening_participants SET amount_due=?, updated_at=? WHERE id=?', [amountDue, now, participant.id]);
    }
  }

  await runCrmAutomations(db);
  const [counts, participants] = await Promise.all([
    loadVkJoinCounts(db, eveningId),
    loadVkJoinParticipants(db, eveningId),
  ]);
  return { response_status: responseStatus, counts, participants };
}
