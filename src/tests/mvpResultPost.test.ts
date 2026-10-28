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
const asSent = (body: any) => {
  if (!(body instanceof FormData)) return JSON.parse(body);
  const markup = body.get('reply_markup');
  return { chat_id: String(body.get('chat_id')), text: String(body.get('caption') ?? ''), photo: body.get('photo') instanceof Blob, ...(markup ? { reply_markup: JSON.parse(String(markup)) } : {}) };
};
const fetchImpl = (async (_url: string, init: any) => { sent.push(asSent(init.body)); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as unknown as typeof fetch;

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
    expect(group.photo).toBe(true); // the card with the winner's photo
    expect(group.text).toContain('MVP вечера «Пятница» — Игрок b!');
    expect(group.text).toContain('Голосов: 2 из 3.');
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    expect(sent.filter((body) => body.chat_id === '-100500').length).toBe(1);
    // Everyone who was at the evening gets it personally, the winner with a line of their own, once.
    const keys = (await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'evening_mvp_result'")).map((row) => row.notification_key).sort();
    expect(keys).toEqual(['mvp-result:e1:a', 'mvp-result:e1:b', 'mvp-result:e1:c', 'mvp-result:e1:d']);
    // The Telegram messages carry the card, the picture of the winner.
    const withPhoto = await db.all<any>("SELECT message_key FROM telegram_message_outbox WHERE event_type = 'evening_mvp_result' AND photo_png IS NOT NULL");
    expect(withPhoto.length).toBe(4);
  });

  it('says nothing when nobody voted or the window is still open', async () => {
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    await vote('a', 'b');
    await db.run("UPDATE game_evenings SET settled_at = ? WHERE id = 'e1'", [hoursAgo(10)]);
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false);
    expect(sent.length).toBe(0);
  });

  it('opens one runoff, then asks the owner only if the additional round has no unique winner', async () => {
    await vote('a', 'b'); await vote('c', 'd');
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(true); // the question to the owner
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(false); // asked once
    expect(sent.find(body=>body.chat_id==='-100500').text).toContain('дополнительное голосование');
    expect((await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type='evening_mvp_decision'"))).toHaveLength(0);
    await db.run("UPDATE evening_mvp_runoffs SET deadline_at=? WHERE evening_id='e1'",[hoursAgo(1)]);
    expect(await postMvpResult(db,'e1',fetchImpl)).toBe(true);
    const asked = (await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE event_type = 'evening_mvp_decision'"));
    expect(asked.length).toBe(1);
    const decision = await decideEveningMvp(db, 'e1', PRIMARY_ORGANIZER_PLAYER_ID, 'd');
    expect(decision.ok).toBe(true);
    expect(await postMvpResult(db, 'e1', fetchImpl)).toBe(true);
    expect(sent.filter((body) => body.chat_id === '-100500').at(-1).text).toContain('MVP вечера «Пятница» — Игрок d!');
    expect(sent.filter((body) => body.chat_id === '-100500').at(-1).text).toContain('решение организатора');
  });
});

describe('MVP cards', () => {
  it('render the result and the vote card as pictures, with and without photos', async () => {
    const { mvpResultSvg, mvpVoteSvg, renderPng } = await import('../server/services/clubResultImages.ts');
    const result = renderPng(mvpResultSvg({ eveningTitle: 'Пятница', dateLabel: '9 октября', totalVotes: 3, reason: '', winner: { nickname: 'Аня', avatar: null, votes: 2 }, others: [{ nickname: 'Борис', avatar: null, votes: 1 }] }));
    const vote = renderPng(mvpVoteSvg({ eveningTitle: 'Пятница', dateLabel: '', deadlineLabel: 'Голосование до понедельника', candidates: [{ nickname: 'Аня', avatar: null }, { nickname: 'Борис', avatar: null }] }));
    for (const png of [result, vote]) expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});
