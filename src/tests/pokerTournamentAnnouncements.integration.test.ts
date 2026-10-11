import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { createPokerTournament, registerForPokerTournament } from '../server/services/pokerTournamentService.ts';
import {
  announcePokerTournament, parsePokerTournamentAnnounce, pokerTournamentAnnouncementText, runPokerTournamentAnnouncements,
} from '../server/services/pokerTournamentAnnouncementService.ts';

describe('poker tournament announcements', () => {
  let db: DatabaseWrapper;
  const stamp = '2026-10-10T10:00:00.000Z';
  const startAt = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    await ensureTelegramPublishingSchema(db);
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,club_stage,created_at,updated_at) VALUES
      ('p1','Один','normal','normal','none',1000,0,'CLUB_PLAYER',?,?),('p2','Два','normal','normal','none',1000,0,'CLUB_PLAYER',?,?),('p3','Гость','normal','normal','none',1000,0,'GUEST',?,?)`, [stamp, stamp, stamp, stamp, stamp, stamp]);
    await db.run("UPDATE telegram_destinations SET chat_id = '-100', active = 1 WHERE id = 'club'");
  });

  const make = (announce: unknown) => createPokerTournament(db, null, { title: 'Турбо', startAt, minPlayers: 2, prizeTokens: [3000, 1500], announce });
  const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));

  it('reads only the four known channels and ignores an empty choice', () => {
    expect(parsePokerTournamentAnnounce({ club_group: true, other: true })).toEqual({ telegram_channel: false, club_group: true, vk: false, bot_dm: false });
    expect(parsePokerTournamentAnnounce({ club_group: false })).toBeNull();
    expect(parsePokerTournamentAnnounce(undefined)).toBeNull();
  });

  it('posts once to the club group and once more does nothing', async () => {
    const row = await make({ club_group: true });
    const fetchImpl = okFetch();
    await announcePokerTournament(db, row.id, { fetchImpl: fetchImpl as any });
    await announcePokerTournament(db, row.id, { fetchImpl: fetchImpl as any });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(sent.text).toContain('Турбо');
    expect(sent.text).toContain('1 место — 3000');
    expect((await db.get<any>('SELECT announced_at FROM poker_tournaments WHERE id = ?', [row.id])).announced_at).toBeTruthy();
  });

  it('retries a failed channel later without posting the successful one twice', async () => {
    const row = await make({ club_group: true });
    const failing = vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'boom' }), { status: 500 }));
    await announcePokerTournament(db, row.id, { fetchImpl: failing as any });
    expect((await db.get<any>('SELECT announced_at FROM poker_tournaments WHERE id = ?', [row.id])).announced_at).toBeNull();
    const ok = okFetch();
    await announcePokerTournament(db, row.id, { fetchImpl: ok as any });
    expect(ok).toHaveBeenCalledTimes(1);
    expect((await db.get<any>('SELECT status FROM poker_tournament_publications WHERE tournament_id = ?', [row.id])).status).toBe('sent');
  });

  it('does not announce a tournament without a choice or one that is no longer open', async () => {
    const none = await make(undefined);
    const fetchImpl = okFetch();
    expect(await announcePokerTournament(db, none.id, { fetchImpl: fetchImpl as any })).toBeNull();
    const closed = await make({ club_group: true });
    await db.run("UPDATE poker_tournaments SET status = 'cancelled' WHERE id = ?", [closed.id]);
    expect(await announcePokerTournament(db, closed.id, { fetchImpl: fetchImpl as any })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('messages club players personally, but not guests', async () => {
    const row = await make({ bot_dm: true });
    const queue = vi.fn(async () => undefined);
    await announcePokerTournament(db, row.id, { queueNotification: queue as any });
    await announcePokerTournament(db, row.id, { queueNotification: queue as any });
    expect(queue.mock.calls.map((call: any) => call[1].playerId).sort()).toEqual(['p1', 'p2']);
    expect((queue.mock.calls[0] as any)[1].actionPath).toBe(`/player/events?event=${row.id}`);
  });

  it('reminds the registered players once, only in the last half hour', async () => {
    const row = await make(undefined);
    await registerForPokerTournament(db, row.id, 'p1');
    const queue = vi.fn(async () => undefined);
    const start = Date.parse(row.start_at);
    await runPokerTournamentAnnouncements(db, start - 3 * 60 * 60_000 + 60_000, { queueNotification: queue as any });
    expect(queue).not.toHaveBeenCalled();
    await runPokerTournamentAnnouncements(db, start - 20 * 60_000, { queueNotification: queue as any });
    await runPokerTournamentAnnouncements(db, start - 10 * 60_000, { queueNotification: queue as any });
    expect(queue).toHaveBeenCalledTimes(1);
    expect((queue.mock.calls[0] as any)[1].playerId).toBe('p1');
    expect((queue.mock.calls[0] as any)[1].text).toContain('начнётся');
  });

  it('builds a readable text', async () => {
    const row = await make(undefined);
    const text = pokerTournamentAnnouncementText(row as any);
    expect(text).toContain('🃏 Турбо');
    expect(text).toContain('бесплатное');
    expect(text).not.toMatch(/\bвы\b|\bты\b/i);
  });
});
