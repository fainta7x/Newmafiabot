import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { digestToTelegramHtml, loadClubDigestState, normalizeDigestDestinations, publishClubDigest } from '../server/services/clubDigestService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('club','Группа клуба','-100500',7,1,?,?)`, [now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('public','Входной канал','-100700',NULL,1,?,?)`, [now, now]);
  return db;
}
const recorder = (failChat?: string) => {
  const calls: Array<{ chat: string; text: string; parse_mode?: string; thread?: number }> = [];
  const fetchImpl = (async (_url: string, init: any) => {
    const body = JSON.parse(String(init.body));
    calls.push({ chat: body.chat_id, text: body.text, parse_mode: body.parse_mode, thread: body.message_thread_id });
    return failChat === body.chat_id ? new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 400 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;
  return { calls, fetchImpl };
};
const TEXT = '🎭 **Что нового**\n• Профиль теперь один на всё.\n• Покер стал быстрее.';

describe('digest of changes for the players (owner, 2026-10-05)', () => {
  it('turns **bold** into Telegram HTML and escapes everything else', () => {
    expect(digestToTelegramHtml('**Привет** <b>x</b> & 2 < 3')).toBe('<b>Привет</b> &lt;b&gt;x&lt;/b&gt; &amp; 2 &lt; 3');
    expect(digestToTelegramHtml('a ** b ** c')).toBe('a ** b ** c');
  });

  it('accepts only the known destinations, once each', () => {
    expect(normalizeDigestDestinations(['club', 'club', 'rating', 'evil', 5])).toEqual(['club', 'rating']);
    expect(normalizeDigestDestinations('club')).toEqual([]);
  });

  it('posts to the chosen destinations with HTML and the topic, records every post and never repeats the same text in a day', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { calls, fetchImpl } = recorder();
    const first = await publishClubDigest(db, { text: TEXT, destinations: ['club', 'public'], createdBy: 'owner' }, fetchImpl);
    expect(first).toEqual([{ destination: 'club', status: 'sent' }, { destination: 'public', status: 'sent' }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ chat: '-100500', thread: 7, parse_mode: 'HTML' });
    expect(calls[0].text).toContain('<b>Что нового</b>');

    const again = await publishClubDigest(db, { text: TEXT, destinations: ['club', 'public'] }, fetchImpl);
    expect(again.map((item) => item.status)).toEqual(['duplicate', 'duplicate']);
    expect(calls).toHaveLength(2);
    // another text to the same group goes out
    expect((await publishClubDigest(db, { text: `${TEXT}\n• Ещё пункт.`, destinations: ['club'] }, fetchImpl))[0].status).toBe('sent');
    const state = await loadClubDigestState(db);
    expect(state.recent).toHaveLength(3);
    expect(state.destinations.find((item) => item.id === 'club')).toMatchObject({ name: 'Группа клуба', ready: true });
    expect(state.destinations.map((item) => item.id)).toEqual(['club', 'public', 'rating', 'novice']);
  });

  it('reports a failed destination and lets the retry go out (a failed post is not a duplicate)', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const broken = recorder('-100700');
    const first = await publishClubDigest(db, { text: TEXT, destinations: ['club', 'public'] }, broken.fetchImpl);
    expect(first[0].status).toBe('sent');
    expect(first[1]).toMatchObject({ destination: 'public', status: 'failed' });
    const fixed = recorder();
    const retry = await publishClubDigest(db, { text: TEXT, destinations: ['club', 'public'] }, fixed.fetchImpl);
    expect(retry.map((item) => item.status)).toEqual(['duplicate', 'sent']);
  });

  it('refuses an empty, too long or destination-less digest before sending anything', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { calls, fetchImpl } = recorder();
    await expect(publishClubDigest(db, { text: 'коротко', destinations: ['club'] }, fetchImpl)).rejects.toThrow('слишком короткая');
    await expect(publishClubDigest(db, { text: 'я'.repeat(3801), destinations: ['club'] }, fetchImpl)).rejects.toThrow('длиннее');
    await expect(publishClubDigest(db, { text: TEXT, destinations: [] }, fetchImpl)).rejects.toThrow('куда публиковать');
    expect(calls).toHaveLength(0);
  });
});
