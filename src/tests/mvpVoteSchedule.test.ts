import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { castEveningVote, ensureEveningVoteSchema, loadPendingVoteForPlayer } from '../server/services/eveningVotingService.ts';
import { ensureMvpRunoffIfNeeded, loadMvpRunoff } from '../server/services/eveningVoteRounds.ts';
import { ensureClubResultPostSchema, postVotePrompt } from '../server/services/clubResultPostService.ts';

// «MVP вечера» schedule (owner, 2026-11-09): a Friday evening is polled from Saturday 12:00, voting ends Tuesday 21:00,
// the additional vote ends Thursday 21:00 (Moscow time).
const msk = (iso: string) => new Date(`${iso}+03:00`);
let db: DatabaseWrapper;

async function evening(id: string, startsAt: string, settledAt: string) {
  const created = new Date().toISOString();
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,settled_at,format,created_at,updated_at) VALUES (?,?,?,'completed',?,'CASUAL',?,?)", [id, 'Вечер', msk(startsAt).toISOString(), msk(settledAt).toISOString(), created, created]);
  for (const [pid, tg] of [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']]) {
    await db.run('INSERT OR IGNORE INTO players (id,nickname,telegram_user_id,tokens,created_at,updated_at) VALUES (?,?,?,0,?,?)', [pid, `Игрок ${pid}`, tg, created, created]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended',?,?)", [`ep-${id}-${pid}`, id, pid, created, created]);
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: msk('2026-11-07T00:30:00') });
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  db = createDatabaseConnection(':memory:');
  await createApp(db);
  await ensureEveningVoteSchema(db);
  await ensureClubResultPostSchema(db);
  await evening('fri', '2026-11-06T21:00:00', '2026-11-06T23:55:00');
});
afterEach(() => { try { db.sqlite.close(); } catch {} vi.useRealTimers(); });

describe('«MVP вечера»: Friday evening, the poll is open from Saturday 12:00 to Tuesday 21:00', () => {
  it('is closed before Saturday noon, open after it, and closed again after Tuesday 21:00', async () => {
    expect(await castEveningVote(db, 'fri', 'a', 'b')).toMatchObject({ ok: false, code: 'closed' }); // Friday night
    expect(await loadPendingVoteForPlayer(db, 'a')).toBeNull();
    vi.setSystemTime(msk('2026-11-07T11:59:00'));
    expect(await castEveningVote(db, 'fri', 'a', 'b')).toMatchObject({ ok: false, code: 'closed' });
    vi.setSystemTime(msk('2026-11-07T12:00:00'));
    expect(await castEveningVote(db, 'fri', 'a', 'b')).toMatchObject({ ok: true });
    expect(await loadPendingVoteForPlayer(db, 'a')).toMatchObject({ evening_id: 'fri', voted: true });
    vi.setSystemTime(msk('2026-11-10T20:59:00'));
    expect(await castEveningVote(db, 'fri', 'c', 'b')).toMatchObject({ ok: true });
    vi.setSystemTime(msk('2026-11-10T21:00:00'));
    expect(await castEveningVote(db, 'fri', 'd', 'b')).toMatchObject({ ok: false, code: 'closed' });
  });

  it('the group poll is not sent before it opens, and a late-closed evening is polled right after its closing', async () => {
    const sent: string[] = [];
    const fetchImpl = (async (url: string) => { sent.push(String(url)); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }); }) as unknown as typeof fetch;
    await db.run("INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('club_chat','Клуб','-100500',77,1,datetime('now'),datetime('now'))");
    expect(await postVotePrompt(db, 'fri', fetchImpl)).toBe(false); // Friday night
    expect(sent).toHaveLength(0);
    // closed on Sunday afternoon: the poll goes right after that
    await evening('sun', '2026-11-06T21:00:00', '2026-11-08T15:00:00');
    vi.setSystemTime(msk('2026-11-08T14:00:00'));
    expect(await postVotePrompt(db, 'sun', fetchImpl)).toBe(false);
    expect(await castEveningVote(db, 'sun', 'a', 'b')).toMatchObject({ ok: false, code: 'closed' });
    vi.setSystemTime(msk('2026-11-08T15:01:00'));
    expect(await castEveningVote(db, 'sun', 'a', 'b')).toMatchObject({ ok: true });
  });

  it('a tie after Tuesday 21:00 opens the additional vote until Thursday 21:00; later it opens none', async () => {
    vi.setSystemTime(msk('2026-11-08T12:00:00'));
    await castEveningVote(db, 'fri', 'a', 'b');
    await castEveningVote(db, 'fri', 'b', 'a');
    expect(await ensureMvpRunoffIfNeeded(db, 'fri')).toBeNull(); // the first round is still open
    vi.setSystemTime(msk('2026-11-10T21:30:00'));
    const round = await ensureMvpRunoffIfNeeded(db, 'fri');
    expect(round).not.toBeNull();
    expect(Date.parse(round!.deadline_at)).toBe(msk('2026-11-12T21:00:00').getTime());
    expect((await loadMvpRunoff(db, 'fri'))?.nominees.sort()).toEqual(['a', 'b']);
    // the additional vote is open for everyone until Thursday evening
    expect(await castEveningVote(db, 'fri', 'c', 'a', { round: 1 })).toMatchObject({ ok: true });
    vi.setSystemTime(msk('2026-11-12T21:00:00'));
    expect(await castEveningVote(db, 'fri', 'd', 'a', { round: 1 })).toMatchObject({ ok: false, code: 'closed' });
  });

  it('an evening on another day is polled the next day at 12:00 and ends on the 3rd day at 21:00', async () => {
    await evening('tue', '2026-11-03T19:00:00', '2026-11-03T22:00:00'); // a Tuesday
    vi.setSystemTime(msk('2026-11-04T11:59:00'));
    expect(await castEveningVote(db, 'tue', 'a', 'b')).toMatchObject({ ok: false, code: 'closed' });
    vi.setSystemTime(msk('2026-11-04T12:00:00'));
    expect(await castEveningVote(db, 'tue', 'a', 'b')).toMatchObject({ ok: true });
    vi.setSystemTime(msk('2026-11-06T21:00:00'));
    expect(await castEveningVote(db, 'tue', 'c', 'b')).toMatchObject({ ok: false, code: 'closed' });
  });
});
