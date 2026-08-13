import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { ensureVkJoinSchema } from '../db/ensureVkJoinSchema.ts';
import { getVkJoinState } from '../server/services/vkJoinIdentityService.ts';
import { registerVkPlayer, saveVkJoinResponse } from '../server/services/vkJoinRegistrationService.ts';
import { setParticipantResponse } from '../server/services/eveningParticipantState.ts';
import { linkVkIdentity } from '../server/services/vkEveningIntegrationService.ts';

describe('VK, Telegram and WebApp unified identity', () => {
  it('uses one player and one evening response row across all entry points', async () => {
    const db = createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    await ensureJudgeAuthoritySchema(db);
    await ensureEloSeedSchema(db);
    await ensureVkIntegrationSchema(db);
    await ensureVkJoinSchema(db);

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO players (id, telegram_user_id, nickname, source, created_at, updated_at)
      VALUES ('player-1', '101', 'Кот', 'telegram', ?, ?)
    `, [now, now]);
    await linkVkIdentity(db, { vkUserId: '202', playerId: 'player-1' });
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-1', 'Игровой вечер', ?, 'CASUAL', 'published', 400, ?, ?)
    `, [now, now, now]);

    const rawSession = 'vk-session';
    const sessionHash = crypto.createHash('sha256').update(rawSession).digest('hex');
    await db.run(`
      INSERT INTO vk_join_sessions (session_hash, vk_user_id, created_at, expires_at)
      VALUES (?, '202', ?, ?)
    `, [sessionHash, now, new Date(Date.now() + 60_000).toISOString()]);

    const initial = await getVkJoinState(db, 'evening-1', rawSession);
    expect(initial).toMatchObject({
      authenticated: true,
      vk_authenticated: true,
      player: { id: 'player-1', nickname: 'Кот' },
      response_status: 'unanswered',
    });

    await saveVkJoinResponse(db, 'evening-1', 'player-1', 'going');
    const participant = await db.get<any>(`
      SELECT id, player_id, response_status
        FROM evening_participants
       WHERE evening_id='evening-1' AND player_id='player-1'
    `);
    expect(participant).toMatchObject({ player_id: 'player-1', response_status: 'going' });

    // Telegram bot and the player cabinet use this same canonical participant row.
    await setParticipantResponse(db, String(participant?.id), 'thinking');
    const afterTelegram = await getVkJoinState(db, 'evening-1', rawSession);
    expect(afterTelegram.response_status).toBe('thinking');

    await saveVkJoinResponse(db, 'evening-1', 'player-1', 'declined');
    const rows = await db.all<any>(`
      SELECT player_id, response_status
        FROM evening_participants
       WHERE evening_id='evening-1'
    `);
    expect(rows).toEqual([{ player_id: 'player-1', response_status: 'declined' }]);

    expect(await registerVkPlayer(db, '202', 'Кот')).toEqual({ created: false, playerId: 'player-1' });
    await expect(registerVkPlayer(db, '303', 'Кот')).rejects.toMatchObject({
      statusCode: 409,
      code: 'nickname_taken',
    });
    expect((await db.get<any>('SELECT COUNT(*) AS count FROM players'))?.count).toBe(1);
  });
});
