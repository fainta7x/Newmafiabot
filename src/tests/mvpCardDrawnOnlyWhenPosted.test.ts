import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const drawn = vi.hoisted(() => ({ count: 0 }));
vi.mock('../server/services/mvpCardService.ts', async (load) => ({
  ...(await load<typeof import('../server/services/mvpCardService.ts')>()),
  buildMvpVoteCard: async () => { drawn.count += 1; return Buffer.from('png'); },
}));

const { ensureClubResultPostSchema, postVotePrompt } = await import('../server/services/clubResultPostService.ts');

let db: DatabaseWrapper;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(async () => {
  drawn.count = 0;
  db = createDatabaseConnection(':memory:');
  const created = hoursAgo(30);
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,settled_at,format,created_at,updated_at) VALUES ('e1','Пятница',?,'completed',?,'CASUAL',?,?)", [hoursAgo(34), hoursAgo(30), created, created]);
  for (const id of ['a', 'b']) {
    await db.run('INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,0,?,?)', [id, `Игрок ${id}`, created, created]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended',?,?)", [`ep-${id}`, 'e1', id, created, created]);
  }
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('the «MVP вечера» card is drawn only for a post that goes out (stall audit, 2026-10-23)', () => {
  it('draws the card for the first post and not on the minute scans after it', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    await ensureClubResultPostSchema(db);
    await db.run("CREATE TABLE IF NOT EXISTS telegram_destinations (id TEXT PRIMARY KEY, chat_id TEXT, topic_id TEXT, active INTEGER DEFAULT 1, invite_url TEXT)").catch(() => undefined);
    await db.run("INSERT OR REPLACE INTO telegram_destinations (id, chat_id, active) VALUES ('club', '-100', 1)");
    const fetchImpl = (async () => new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 })) as unknown as typeof fetch;
    await postVotePrompt(db, 'e1', fetchImpl);
    expect(drawn.count).toBe(1);
    for (let scan = 0; scan < 3; scan += 1) await postVotePrompt(db, 'e1', fetchImpl);
    expect(drawn.count).toBe(1);
  });
  it('does not replace a possibly accepted photo with text after a 5xx',async()=>{
    process.env.TELEGRAM_BOT_TOKEN='test-token';await ensureClubResultPostSchema(db);
    await db.run("CREATE TABLE IF NOT EXISTS telegram_destinations(id TEXT PRIMARY KEY,chat_id TEXT,topic_id TEXT,active INTEGER)");
    await db.run("INSERT OR REPLACE INTO telegram_destinations(id,chat_id,active) VALUES('club','-100',1)");
    const fetchImpl=vi.fn(async(_url:RequestInfo|URL)=>new Response('{}',{status:503}));
    await postVotePrompt(db,'e1',fetchImpl);await postVotePrompt(db,'e1',fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/sendPhoto');
    expect(await db.get("SELECT status FROM club_result_posts WHERE post_key='vote-prompt:e1'")).toMatchObject({status:'uncertain'});
  });

});
