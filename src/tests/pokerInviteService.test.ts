import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { recordPresence } from '../server/services/presenceService.ts';
import { ensurePlayerProfileMergeSchema } from '../db/ensurePlayerProfileMergeSchema.ts';
import { loadPokerInviteCandidates, POKER_INVITE_COOLDOWN_MS, queuePokerInvite } from '../server/services/pokerInviteService.ts';

describe('poker invites and presence', () => {
  let db: DatabaseWrapper;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    const now = new Date('2026-10-07T12:00:00Z').toISOString();
    await db.run(
      `INSERT INTO players (id,nickname,telegram_user_id,tokens,created_at,updated_at)
       VALUES ('alice','Алиса','1001',5000,?,?),
              ('bob','Боб','1002',5000,?,?),
              ('charlie','Чарли','1003',5000,?,?)`,
      [now, now, now, now, now, now],
    );
    await db.exec(`
      CREATE TABLE IF NOT EXISTS player_external_identities (
        platform TEXT NOT NULL,
        external_user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        screen_name TEXT,
        display_name TEXT,
        linked_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (platform, external_user_id),
        UNIQUE (platform, player_id)
      );
    `);
    await db.run(
      `INSERT INTO player_external_identities (platform,external_user_id,player_id,linked_at,updated_at)
       VALUES ('vk','42','bob',?,?)`,
      [now, now],
    );
  });


  it('ranks app-online first and also exposes best-effort VK online status', async () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    recordPresence(db, 'charlie', '/player/poker', now);

    const candidates = await loadPokerInviteCandidates(db, 'alice', {
      now,
      vkLoader: async (ids) => {
        expect(ids).toEqual(['42']);
        return [{ id: 42, online: 1, last_seen: { time: Math.floor((now - 60_000) / 1000) } }];
      },
    });

    expect(candidates.map((item) => item.player_id)).toEqual(['charlie', 'bob']);
    expect(candidates[0]).toMatchObject({ app_online: true, vk_online: false, telegram_linked: true, personal_notifications_enabled: true });
    expect(candidates[1]).toMatchObject({ app_online: false, vk_online: true, vk_status_available: true, telegram_linked: true, personal_notifications_enabled: true });
  });

  it('does not offer an invite when the player disabled personal notifications', async () => {
    await loadPokerInviteCandidates(db, 'alice', { vkLoader: async () => [] });
    await db.run(
      `INSERT INTO player_notification_preferences (player_id,preferred_channel,personal_enabled,updated_at)
       VALUES ('bob','auto',0,?)`,
      [new Date().toISOString()],
    );
    const candidates = await loadPokerInviteCandidates(db, 'alice', { vkLoader: async () => [] });
    expect(candidates.find((item) => item.player_id === 'bob')).toMatchObject({
      telegram_linked: true,
      personal_notifications_enabled: false,
      can_invite: false,
    });
  });

  it('rejects blocked and merged recipients even when the POST path is called directly', async () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    await ensurePlayerProfileMergeSchema(db);
    await db.run("UPDATE players SET contact_status='blocked' WHERE id='bob'");
    await db.run("UPDATE players SET merged_into_player_id='alice', merged_at=? WHERE id='charlie'", [new Date(now).toISOString()]);

    await expect(queuePokerInvite(db, {
      senderPlayerId: 'alice',
      senderNickname: 'Алиса',
      targetPlayerId: 'bob',
      lobbyId: 'live-table',
      lobbyTitle: 'Вечерний стол',
      now,
    })).rejects.toMatchObject({ code: 'player_not_found' });

    await expect(queuePokerInvite(db, {
      senderPlayerId: 'alice',
      senderNickname: 'Алиса',
      targetPlayerId: 'charlie',
      lobbyId: 'live-table',
      lobbyTitle: 'Вечерний стол',
      now,
    })).rejects.toMatchObject({ code: 'player_not_found' });

    const candidates = await loadPokerInviteCandidates(db, 'alice', { now, vkLoader: async () => [] });
    expect(candidates.map((item) => item.player_id)).not.toContain('bob');
    expect(candidates.map((item) => item.player_id)).not.toContain('charlie');
  });

  it('queues a Telegram poker invite and enforces the two-minute sender-recipient cooldown', async () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    const first = await queuePokerInvite(db, {
      senderPlayerId: 'alice',
      senderNickname: 'Алиса',
      targetPlayerId: 'bob',
      lobbyId: 'live-table',
      lobbyTitle: 'Вечерний стол',
      now,
    });
    expect(first.cooldown_seconds).toBe(120);

    const outbox = await db.get<any>("SELECT chat_id,text,event_type,reply_markup_json FROM telegram_message_outbox WHERE player_id='bob' LIMIT 1");
    expect(outbox).toMatchObject({ chat_id: '1002', event_type: 'poker_invite' });
    expect(outbox.text).toContain('Алиса зовёт тебя сыграть в покер');
    expect(outbox.text).toContain('вход 1 000');
    const markup = JSON.parse(String(outbox.reply_markup_json || '{}'));
    expect(markup.inline_keyboard?.[0]?.[0]?.web_app?.url).toContain('/player/poker/live-table');

    await expect(queuePokerInvite(db, {
      senderPlayerId: 'alice',
      senderNickname: 'Алиса',
      targetPlayerId: 'bob',
      lobbyId: 'live-table',
      lobbyTitle: 'Вечерний стол',
      now: now + 30_000,
    })).rejects.toMatchObject({ code: 'cooldown', retryAfterSeconds: 90 });

    const afterCooldown = await queuePokerInvite(db, {
      senderPlayerId: 'alice',
      senderNickname: 'Алиса',
      targetPlayerId: 'bob',
      lobbyId: 'live-table',
      lobbyTitle: 'Вечерний стол',
      now: now + POKER_INVITE_COOLDOWN_MS + 1,
    });
    expect(afterCooldown.target_player_id).toBe('bob');
  });
});
