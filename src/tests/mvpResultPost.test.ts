import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { ensureEveningVoteSchema } from '../server/services/eveningVotingService.ts';
import { decideEveningMvp } from '../server/services/eveningMvpService.ts';
import { ensureClubResultPostSchema, postMvpResult } from '../server/services/clubResultPostService.ts';

let db: DatabaseWrapper;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const sent: any[] = [];
const fetchImpl = (async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as unknown as typeof fetch;

beforeEach(async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  sent.length = 0;
  db = createDatabaseConnection(':memory:');
  await createApp(db);
  await ensureClubResultPostSchema(db);
  await ensureEveningVoteSchema(db);
  const created = hoursAgo(100);
  // Closed 4 days ago: the three days of voting are over.
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,settled_at,format,created_at,updated_at) VALUES ('e1','Пятница',?,'completed',?,'CASUAL',?,?)", [hoursAgo(104), hoursAgo(96), created, created]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('club','Клуб','-100500',77,1,?,?)`, [created, created]);
  const players: Array<[string, string]> = [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], [PRIMARY_ORGANIZER_PLAYER_ID, '9']];
  for (const [id, tg] of players) {
    await db.run('INSERT OR IGNORE INTO players (id,nickname,telegram_user_id,tokens,created_at,updated_at) VALUES (?,?,?,0,?,?)', [id, `Игрок ${id.slice(0, 1)}`, tg, created, created]);
    await db.run('UPDATE players SET telegram_user_id = ? WHERE id = ?', [tg, id]);
    if (id !== PRIMARY_ORGANIZER_PLAYER_ID) await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended',?,?)", [`ep-${id}`, 'e1', id, created, created]);
  }
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

// Votes are accepted only while the window is open, so they are written directly here.
const vote = (voter: string, nominee: string) => db.run("INSERT INTO evening_player_votes (evening_id, voter_player_id, category, nominee_player_id, created_at, updated_at) VALUES ('e1',?,'best_player',?,?,?)", [voter, nominee, hoursAgo(90), hoursAgo(90)]);

describe('result of the «MVP вечера» vote', () => {
  it('announces one winner in the group, once', async () => {
    await vote('a', 'b'); await vote('c', 'b'); await vote('d', 'a');
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(true);
    const group = sent.find((body) => body.chat_id === '-100500');
    expect(group.text).toContain('MVP вечера «Пятница» — Игрок b!');
    expect(group.text).toContain('Голосов: 2 из 3.');
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    expect(sent.filter((body) => body.chat_id === '-100500').length).toBe(1);
    // Everyone who was at the evening gets it personally, the winner with a line of their own, once.
    const keys = (await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'evening_mvp_result'")).map((row) => row.notification_key).sort();
    expect(keys).toEqual(['mvp-result:e1:a', 'mvp-result:e1:b', 'mvp-result:e1:c', 'mvp-result:e1:d']);
  });

  it('says nothing when nobody voted or the window is still open', async () => {
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    await vote('a', 'b');
    await db.run("UPDATE game_evenings SET settled_at = ? WHERE id = 'e1'", [hoursAgo(10)]);
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    expect(sent.length).toBe(0);
  });

  it('asks the owner about a tie once, then announces the owner\'s pick', async () => {
    await vote('a', 'b'); await vote('c', 'd');
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(true); // the question to the owner
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false); // asked once
    expect(sent.some((body) => body.chat_id === '-100500')).toBe(false); // nothing public yet
    const asked = (await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'evening_mvp_decision'"));
    expect(asked.length).toBe(1);
    const decision = await decideEveningMvp(db, 'e1', PRIMARY_ORGANIZER_PLAYER_ID, 'd');
    expect(decision.ok).toBe(true);
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(true);
    expect(sent.find((body) => body.chat_id === '-100500').text).toContain('MVP вечера «Пятница» — Игрок d!');
    expect(sent.find((body) => body.chat_id === '-100500').text).toContain('решение организатора');
  });
});
