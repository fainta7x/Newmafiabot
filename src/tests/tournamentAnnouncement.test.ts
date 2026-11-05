import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadTournamentAnnouncement } from '../server/services/clubResultData.ts';
import { tournamentAnnounceSvg, renderPng } from '../server/services/clubResultImages.ts';
import { postTournamentAnnouncement, runClubResultPosts, syncTournamentAnnouncementPhoto } from '../server/services/clubResultPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup(startsAt: string) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,venue,status,chief_judge_name,created_at,updated_at) VALUES ('t1','Турнир Богдана #2',?,'Суп с Котом','draft','Чагин',?,?)`, [startsAt, now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('rating','Рейтинг','-100600',9,1,?,?)`, [now, now]);
  for (let index = 1; index <= 10; index += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${index}`, `Игрок ${index}`, now, now]);
    await db.run(`INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,registered_at,updated_at) VALUES (?,?,?,'confirmed',?,?,?)`, [`r${index}`, 't1', `p${index}`, index, now, now]);
  }
  return db;
}

describe('tournament announcement', () => {
  it('loads the confirmed roster, the judge and the start', async () => {
    const db = await setup('2026-10-03T08:00:00.000Z');
    const announcement = (await loadTournamentAnnouncement(db, 't1'))!;
    expect(announcement.players).toHaveLength(10);
    expect(announcement.players[0].nickname).toBe('Игрок 1');
    expect(announcement.judge).toBe('Чагин');
    expect(announcement.timeLabel).toBe('11:00');
    expect(renderPng(tournamentAnnounceSvg(announcement, 'twitch.tv/chagintv')).length).toBeGreaterThan(5000);
  });

  it('posts once to the rating group with the judge, the roster and the Twitch link', async () => {
    const db = await setup('2026-10-03T08:00:00.000Z');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
    expect(await postTournamentAnnouncement(db, 't1', fetchImpl)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sendPhoto');
    expect(calls[0].form.get('chat_id')).toBe('-100600');
    expect(calls[0].form.get('message_thread_id')).toBe('9');
    const caption = String(calls[0].form.get('caption'));
    expect(caption).toContain('Главный судья: Чагин');
    expect(caption).toContain('https://www.twitch.tv/chagintv');
    expect(caption).toContain('Игрок 10');
    expect(await postTournamentAnnouncement(db, 't1', fetchImpl)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('waits for publication and a full roster, then replaces the same photo on sync', async () => {
    const db = await setup('2026-10-03T08:00:00.000Z');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 100 } })));
    await db.run("UPDATE tournaments SET tournament_evening_flow = 1 WHERE id = 't1'");
    expect(await postTournamentAnnouncement(db, 't1', fetchImpl)).toBe(false);
    await db.run("UPDATE tournaments SET published_at = date WHERE id = 't1'");
    await db.run("UPDATE tournament_registrations SET status = 'reserve' WHERE id = 'r10'");
    expect(await postTournamentAnnouncement(db, 't1', fetchImpl)).toBe(false);
    expect(await syncTournamentAnnouncementPhoto(db, 't1', fetchImpl)).toBe('not_published');
    expect(fetchImpl).not.toHaveBeenCalled();

    await db.run("UPDATE tournament_registrations SET status = 'confirmed' WHERE id = 'r10'");
    expect(await postTournamentAnnouncement(db, 't1', fetchImpl)).toBe(true);
    await db.run("UPDATE players SET nickname = 'Новый ник' WHERE id = 'p10'");
    await db.run("UPDATE telegram_destinations SET chat_id = '-100601' WHERE id = 'rating'");
    expect(await syncTournamentAnnouncementPhoto(db, 't1', fetchImpl)).toBe('updated');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, request] = fetchImpl.mock.calls[1];
    const form = request?.body as FormData;
    expect(url).toContain('/editMessageMedia');
    expect(form.get('chat_id')).toBe('-100600');
    expect(form.get('message_id')).toBe('100');
    expect(String(form.get('media'))).toContain('Новый ник');
    expect(form.get('photo')).toBeInstanceOf(Blob);
  });

  it('goes out from the worker scan only within 36 hours of the start', async () => {
    const db = await setup('2026-10-03T08:00:00.000Z');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
    await runClubResultPosts(db, fetchImpl, Date.parse('2026-10-01T19:00:00Z')); // 37 h before
    expect(calls.filter((url) => String(url).includes('/sendPhoto'))).toHaveLength(0);
    await runClubResultPosts(db, fetchImpl, Date.parse('2026-10-01T21:00:00Z')); // 35 h before
    expect(calls.filter((url) => String(url).includes('/sendPhoto'))).toHaveLength(1);
    await runClubResultPosts(db, fetchImpl, Date.parse('2026-10-01T22:00:00Z'));
    expect(calls.filter((url) => String(url).includes('/sendPhoto'))).toHaveLength(1);
  });
});
