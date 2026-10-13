import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { castEveningVote, loadPendingVoteForPlayer } from '../server/services/eveningVotingService.ts';
import { queueEveningVoteMessages } from '../server/services/eveningVoteMessageService.ts';
import { ensureClubResultPostSchema, postVotePrompt, remindUnvotedPlayers } from '../server/services/clubResultPostService.ts';

let db: DatabaseWrapper;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  const created = hoursAgo(30);
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,settled_at,format,created_at,updated_at) VALUES ('e1','Пятница',?,'completed',?,'CASUAL',?,?)", [hoursAgo(34), hoursAgo(30), created, created]);
  for (const [id, tg] of [['a', '1'], ['b', '2'], ['c', '3']]) {
    await db.run('INSERT INTO players (id,nickname,telegram_user_id,tokens,created_at,updated_at) VALUES (?,?,?,0,?,?)', [id, `Игрок ${id}`, tg, created, created]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended',?,?)", [`ep-${id}`, 'e1', id, created, created]);
  }
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('«MVP вечера» is no longer hidden', () => {
  it('shows the open vote on the player\'s home, then who they voted for', async () => {
    expect(await loadPendingVoteForPlayer(db, 'a')).toMatchObject({ evening_id: 'e1', voted: false, voters: 0, attendees: 3 });
    await castEveningVote(db, 'e1', 'a', 'b');
    expect(await loadPendingVoteForPlayer(db, 'a')).toMatchObject({ voted: true, my_vote_nickname: 'Игрок b', voters: 1 });
    const app = await createApp(db);
    expect((await request(app).get('/api/player/voting/pending')).status).toBe(401);
    const response = await request(app).get('/api/player/voting/pending').set('Cookie', `player_token=${generatePlayerSessionToken('c')}`);
    expect(response.body.pending).toMatchObject({ evening_id: 'e1', voted: false });
  });

  it('shows nothing once the three days are over or for someone who was not there', async () => {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['z', 'Не был', hoursAgo(30), hoursAgo(30)]);
    expect(await loadPendingVoteForPlayer(db, 'z')).toBeNull();
    await db.run("UPDATE game_evenings SET settled_at = ? WHERE id = 'e1'", [hoursAgo(80)]);
    expect(await loadPendingVoteForPlayer(db, 'a')).toBeNull();
  });

  it('reminds only those who have not voted, once', async () => {
    await castEveningVote(db, 'e1', 'a', 'b');
    const first = await queueEveningVoteMessages(db, 'e1', 'Пятница', { nudge: true });
    expect(first).toBe(2);
    expect(await queueEveningVoteMessages(db, 'e1', 'Пятница', { nudge: true })).toBe(0);
    const keys = (await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'evening_vote_nudge' ORDER BY notification_key")).map((row) => row.notification_key);
    expect(keys).toEqual(['evening-vote-nudge:e1:b', 'evening-vote-nudge:e1:c']);
  });

  it('posts the prompt to the group once and sends the reminder once', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    await ensureClubResultPostSchema(db);
    await db.run("CREATE TABLE IF NOT EXISTS telegram_destinations (id TEXT PRIMARY KEY, chat_id TEXT, topic_id TEXT, active INTEGER DEFAULT 1, invite_url TEXT)").catch(() => undefined);
    await db.run("INSERT OR REPLACE INTO telegram_destinations (id, chat_id, active) VALUES ('club', '-100', 1)");
    const sent: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await postVotePrompt(db, 'e1', fetchImpl)).toBe(true);
    expect(sent[0].text).toContain('MVP вечера «Пятница» — голосуем!');
    expect(sent[0].text).toContain('Голосование до');
    expect(await postVotePrompt(db, 'e1', fetchImpl)).toBe(false);
    expect(sent.length).toBe(1);
    expect(await remindUnvotedPlayers(db, 'e1')).toBe(3);
    expect(await remindUnvotedPlayers(db, 'e1')).toBe(0);
  });
});
