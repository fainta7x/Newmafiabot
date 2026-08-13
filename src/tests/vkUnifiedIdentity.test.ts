import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { confirmVkIdentityClaim, createVkIdentityClaim } from '../server/services/vkIdentityClaimService.ts';

const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;

afterEach(() => {
  if (originalBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
  vi.restoreAllMocks();
});

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

  it('lets an existing player approve VK linking privately in MafiaBot without creating a duplicate', async () => {
    const db = createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    await ensureJudgeAuthoritySchema(db);
    await ensureEloSeedSchema(db);
    await ensureVkIntegrationSchema(db);
    await ensureVkJoinSchema(db);

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO players (id, telegram_user_id, nickname, source, created_at, updated_at)
      VALUES ('player-claim', '777', 'Чагин', 'telegram', ?, ?)
    `, [now, now]);
    await db.run(`
      INSERT INTO game_evenings (
        id, title, starts_at, format, status, default_price, created_at, updated_at
      ) VALUES ('evening-claim', 'Игровой вечер', ?, 'CASUAL', 'published', 400, ?, ?)
    `, [now, now, now]);
    const rawSession = 'claim-session';
    await db.run(`
      INSERT INTO vk_join_sessions (session_hash, vk_user_id, created_at, expires_at)
      VALUES (?, '909', ?, ?)
    `, [crypto.createHash('sha256').update(rawSession).digest('hex'), now, new Date(Date.now() + 60_000).toISOString()]);

    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const claim = await createVkIdentityClaim(db, {
      vkUserId: '909',
      nickname: 'Чагин',
      eveningId: 'evening-claim',
      baseUrl: 'https://example.test',
    });
    expect(claim).toMatchObject({ pending: true, linked: false, playerId: 'player-claim', nickname: 'Чагин' });
    expect((await getVkJoinState(db, 'evening-claim', rawSession))).toMatchObject({
      authenticated: false,
      vk_authenticated: true,
      link_pending: true,
      link_player_nickname: 'Чагин',
    });

    const telegramBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(telegramBody.chat_id).toBe('777');
    const confirmationUrl = String(telegramBody.reply_markup.inline_keyboard[0][0].url);
    const confirmationToken = decodeURIComponent(confirmationUrl.split('/').pop() || '');
    await confirmVkIdentityClaim(db, confirmationToken);

    expect((await getVkJoinState(db, 'evening-claim', rawSession))).toMatchObject({
      authenticated: true,
      vk_authenticated: true,
      link_pending: false,
      player: { id: 'player-claim', nickname: 'Чагин' },
    });
    expect((await db.get<any>('SELECT COUNT(*) AS count FROM players'))?.count).toBe(1);
  });
});
