import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { postTournamentResults, runClubResultPosts, tournamentResultsText } from '../server/services/clubResultPostService.ts';

vi.mock('../server/services/flexibleTournamentStandingsService.ts', () => ({
  getFlexibleTournamentStandings: async () => ({ standings: [
    { display_name: 'Аня', place: 1, total_points: 12.5 },
    { display_name: 'Борис', place: 2, total_points: 9 },
    { display_name: 'Вера', place: 3, total_points: 7.25 },
    { display_name: 'Глеб', place: 4, total_points: 3 },
  ] }),
}));

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup(published: boolean) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,venue,status,public_token,results_published_at,created_at,updated_at) VALUES ('t1','Турнир Богдана #2',?,'Суп с Котом','completed',?,?,?,?)`, ['2026-10-03T08:00:00.000Z', published ? 'tok' : null, published ? now : null, now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('rating','Рейтинг','-100600',9,1,?,?)`, [now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('public','Канал','-100700',NULL,1,?,?)`, [now, now]);
  return db;
}
const recorder = () => {
  const calls: Array<{ chat: string; text: string }> = [];
  const fetchImpl = (async (_url: string, init: any) => { const body = JSON.parse(String(init.body)); calls.push({ chat: body.chat_id, text: body.text }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;
  return { calls, fetchImpl };
};

describe('official tournament results in Telegram', () => {
  it('formats the top of the table with medals and the link', () => {
    const text = tournamentResultsText('Турнир', '3 октября 2026', [{ place: 1, name: 'Аня', points: 12.5 }, { place: 2, name: 'Борис', points: 9 }, { place: 4, name: 'Глеб', points: 3 }], 'https://app.test/tournaments/results/tok');
    expect(text).toContain('🏆 Итоги турнира «Турнир» — 3 октября 2026');
    expect(text).toContain('🥇 Аня — 12.5');
    expect(text).toContain('🥈 Борис — 9');
    expect(text).toContain('4. Глеб — 3');
    expect(text).toContain('Полные результаты: https://app.test/tournaments/results/tok');
  });

  it('posts once to the rating group and the entry channel, and never twice', async () => {
    const db = await setup(true);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { calls, fetchImpl } = recorder();
    expect(await postTournamentResults(db, 't1', fetchImpl)).toBe(true);
    expect(calls.map((call) => call.chat).sort()).toEqual(['-100600', '-100700']);
    expect(calls[0].text).toContain('🥇 Аня — 12.5');
    expect(calls[0].text).toContain('3. Вера — 7.25'.replace('3.', '🥉'));
    expect(await postTournamentResults(db, 't1', fetchImpl)).toBe(false);
    expect(calls).toHaveLength(2);
    // the scan does not send it again either
    await runClubResultPosts(db, fetchImpl);
    expect(calls.filter((call) => call.text.includes('Итоги турнира'))).toHaveLength(2);
  });

  it('does not post results the organizer has not published', async () => {
    const db = await setup(false);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { calls, fetchImpl } = recorder();
    expect(await postTournamentResults(db, 't1', fetchImpl)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('keeps going after a failed destination: the other one is still posted and the failed one is retried by the scan', async () => {
    const db = await setup(true);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const sent: string[] = [];
    let failChannel = true;
    const fetchImpl = (async (_url: string, init: any) => {
      const body = JSON.parse(String(init.body));
      if (body.chat_id === '-100700' && failChannel) return new Response(JSON.stringify({ ok: false, description: 'busy' }), { status: 500 });
      sent.push(body.chat_id); return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;
    expect(await postTournamentResults(db, 't1', fetchImpl)).toBe(true);
    expect(sent).toEqual(['-100600']);
    failChannel = false;
    await db.run("UPDATE club_result_posts SET updated_at = '2000-01-01T00:00:00Z' WHERE post_key = 'tournament-results:t1:public'");
    await runClubResultPosts(db, fetchImpl, Date.now() + 3_600_000);
    expect(sent.sort()).toEqual(['-100600', '-100700']);
  });
});
