import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  chooseTelephoneNext, declineTelephoneTurn, guessTelephoneChain, loadTelephoneChain, loadTelephoneList, moveTelephoneChain,
  runTelephoneTimers, startTelephoneChain, telephoneCandidates, telephonePost,
} from '../server/services/drawingTelephoneService.ts';
import { runDrawingTelephone } from '../server/services/drawingTelephoneNotifyService.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { ensureClubResultPostSchema } from '../server/services/clubResultPostService.ts';
import { telephoneDayMsBetween, telephoneDeadline, telephoneLinkKind } from '../shared/drawingTelephone.ts';

// «Испорченный телефон с рисунками» (owner, 2026-11-16): pass to anyone who has not moved yet, 8 hours or «не хочу» and
// the turn returns, 5–20 links, the guesser chosen at the start sees the last drawing and caption, no repeated start
// phrase, no word of an earlier caption, 50 tokens a move, the finished chain for everyone and in «Новости».
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(200, 1)]).toString('base64');
const t0 = new Date('2026-11-16T10:00:00Z');
const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
describe('drawing telephone', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    for (const id of names) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    await db.run("INSERT INTO players(id,nickname,tokens,created_at,updated_at) VALUES ('nolink','Без связи',0,'x','x')");
  });
  afterEach(() => { vi.unstubAllEnvs(); db.sqlite.close(); });
  const start = (over: Record<string, unknown> = {}) => startTelephoneChain(db, 'a', { phrase: 'Кот играет на гитаре', links: 5, guesser_id: 'h', next_id: 'b', ...over }, t0);
  const tokens = async (id: string) => Number((await db.get<{ tokens: number }>('SELECT tokens FROM players WHERE id=?', [id]))!.tokens);

  it('starts: phrase, 5–20 links, a guesser and the first player; one active chain per author; a phrase is never reused', async () => {
    await expect(start({ links: 4 })).rejects.toThrow('от 5 до 20');
    await expect(start({ links: 21 })).rejects.toThrow('от 5 до 20');
    await expect(start({ guesser_id: 'a' })).rejects.toThrow('отгадывать');
    await expect(start({ next_id: 'h' })).rejects.toThrow('первый ход');
    await expect(start({ next_id: 'nolink' })).rejects.toThrow('первый ход');
    const { chain, notices } = await start();
    expect(chain).toMatchObject({ status: 'active', length: 5, step: 'move', current: { id: 'b' } });
    expect(notices.map((n) => n.playerId)).toEqual(['b']);
    expect(await tokens('a')).toBe(50);
    await expect(start({ phrase: 'другая' })).rejects.toThrow('ещё идёт');
    await expect(startTelephoneChain(db, 'c', { phrase: 'кот, играет на ГИТАРЕ!', links: 5, guesser_id: 'h', next_id: 'd' }, t0)).rejects.toThrow('уже начинали');
  });

  it('a player sees only the previous link; captions may not reuse words of earlier captions; nobody moves twice', async () => {
    const { chain } = await start({ links: 6 });
    expect(chain.items.map((i) => i.kind)).toEqual(['phrase']); // the author sees his own phrase only
    expect((await loadTelephoneChain(db, 'g', chain.id)).items).toEqual([]); // an outsider sees nothing until the end
    const forB = await loadTelephoneChain(db, 'b', chain.id);
    expect(forB.my_task).toMatchObject({ step: 'move', kind: 'drawing', position: 1 });
    expect(forB.items.map((i) => [i.kind, i.text])).toEqual([['phrase', 'Кот играет на гитаре']]);
    await expect(moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'a' }, t0)).rejects.toThrow('кто ещё не ходил');
    await expect(moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'h' }, t0)).rejects.toThrow('кто ещё не ходил');
    await moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'c' }, t0);
    const forC = await loadTelephoneChain(db, 'c', chain.id);
    expect(forC.items.map((i) => i.kind)).toEqual(['drawing']);
    expect(JSON.stringify(forC)).not.toContain('гитаре');
    await moveTelephoneChain(db, 'c', chain.id, { text: 'Кошка с гитарой', next_id: 'd' }, t0);
    await moveTelephoneChain(db, 'd', chain.id, { image: PNG, next_id: 'e' }, t0);
    await expect(moveTelephoneChain(db, 'e', chain.id, { text: 'Кошки поют', next_id: 'f' }, t0)).rejects.toThrow('«кошки» уже было');
    await expect(moveTelephoneChain(db, 'e', chain.id, { text: 'Котёнок поёт', next_id: 'b' }, t0)).rejects.toThrow('кто ещё не ходил');
    await moveTelephoneChain(db, 'e', chain.id, { text: 'Котёнок поёт', next_id: 'f' }, t0);
    expect(await tokens('c')).toBe(50);
  });

  it('after the last link the guesser sees the last drawing and caption, guesses, and everything opens for everyone', async () => {
    const { chain } = await start({ links: 5 });
    const order = ['b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < 5; i++) {
      const position = i + 1;
      await moveTelephoneChain(db, order[i], chain.id, telephoneLinkKind(position) === 'drawing' ? { image: PNG, next_id: order[i + 1] } : { text: `подпись${position}`, next_id: order[i + 1] }, t0);
    }
    const forH = await loadTelephoneChain(db, 'h', chain.id);
    expect(forH.my_task).toMatchObject({ step: 'guess' });
    expect(forH.items.map((i) => i.kind)).toEqual(['caption', 'drawing']);
    const { chain: done, notices } = await guessTelephoneChain(db, 'h', chain.id, { text: 'Кот с гитарой' }, t0);
    expect(done.status).toBe('done');
    expect(new Set(notices.map((n) => n.playerId))).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'h']));
    const outsider = await loadTelephoneChain(db, 'g', chain.id);
    expect(outsider.items.map((i) => i.kind)).toEqual(['phrase', 'drawing', 'caption', 'drawing', 'caption', 'drawing', 'guess']);
    expect(await tokens('h')).toBe(50);
    expect((await loadTelephoneList(db, 'g')).finished[0]).toMatchObject({ phrase: 'Кот играет на гитаре', guess: 'Кот с гитарой' });
    const post = await telephonePost(db, chain.id);
    expect(post.photos).toHaveLength(3);
    expect(post.caption).toContain('Отгадка — H: «Кот с гитарой»');
  });

  it('«не хочу» and 8 hours return the turn to the one who passed it; he chooses someone else; a reminder halfway', async () => {
    const { chain } = await start();
    const declined = await declineTelephoneTurn(db, 'b', chain.id, t0);
    expect(declined.notices[0]).toMatchObject({ playerId: 'a' });
    let state = await loadTelephoneChain(db, 'a', chain.id);
    expect(state).toMatchObject({ step: 'choose', current: { id: 'a' }, my_task: { step: 'choose' } });
    expect((await telephoneCandidates(db, 'a', chain.id)).map((p) => p.id)).not.toContain('b');
    await expect(chooseTelephoneNext(db, 'a', chain.id, { next_id: 'b' }, t0)).rejects.toThrow('кто ещё не ходил');
    await chooseTelephoneNext(db, 'a', chain.id, { next_id: 'c' }, t0);
    expect(await runTelephoneTimers(db, later(3 * 60))).toEqual([]);
    expect((await runTelephoneTimers(db, later(4 * 60 + 1))).map((n) => [n.playerId, n.text.includes('Напоминание')])).toEqual([['c', true]]);
    expect(await runTelephoneTimers(db, later(5 * 60))).toEqual([]);
    const back = await runTelephoneTimers(db, later(8 * 60 + 1));
    expect(back.map((n) => n.playerId)).toEqual(['a']);
    expect(back[0].text).toContain('не успел за 8 часов');
    state = await loadTelephoneChain(db, 'a', chain.id);
    expect(state.step).toBe('choose');
  });

  it('the night 00:00–08:00 Moscow does not count in the 8 hours (owner, 2026-11-17)', async () => {
    const msk = (text: string) => new Date(`${text}+03:00`);
    expect(telephoneDeadline(msk('2026-11-16T13:00:00')).toISOString()).toBe(msk('2026-11-16T21:00:00').toISOString());
    expect(telephoneDeadline(msk('2026-11-16T22:00:00')).toISOString()).toBe(msk('2026-11-17T14:00:00').toISOString());
    expect(telephoneDeadline(msk('2026-11-17T03:00:00')).toISOString()).toBe(msk('2026-11-17T16:00:00').toISOString());
    expect(telephoneDeadline(msk('2026-11-16T16:00:00')).toISOString()).toBe(msk('2026-11-17T00:00:00').toISOString());
    expect(telephoneDayMsBetween(msk('2026-11-16T22:00:00'), msk('2026-11-17T14:00:00'))).toBe(8 * 3_600_000);

    // A turn passed at 22:00 Moscow: back at 14:00 the next day, the reminder at 10:00, never at night.
    const evening = msk('2026-11-16T22:00:00');
    const { chain } = await startTelephoneChain(db, 'a', { phrase: 'Ночной кот', links: 5, guesser_id: 'h', next_id: 'b' }, evening);
    expect((await loadTelephoneChain(db, 'b', chain.id)).deadline_at).toBe(msk('2026-11-17T14:00:00').toISOString());
    expect(await runTelephoneTimers(db, msk('2026-11-17T06:00:00'))).toEqual([]);
    expect(await runTelephoneTimers(db, msk('2026-11-17T09:59:00'))).toEqual([]);
    expect((await runTelephoneTimers(db, msk('2026-11-17T10:00:00'))).map((n) => n.playerId)).toEqual(['b']);
    expect(await runTelephoneTimers(db, msk('2026-11-17T13:59:00'))).toEqual([]);
    expect((await runTelephoneTimers(db, msk('2026-11-17T14:00:00'))).map((n) => n.playerId)).toEqual(['a']);
  });

  it('everybody sees every running chain with its stage, never its content (owner, 2026-11-16)', async () => {
    const { chain } = await start();
    await moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'c' }, t0);
    const list = await loadTelephoneList(db, 'g');
    expect(list.running).toEqual([expect.objectContaining({ id: chain.id, author: 'A', guesser: 'H', done_links: 1, length: 5, step: 'move', current: 'C' })]);
    expect(JSON.stringify(list.running)).not.toContain('гитаре');
  });

  it('a silent guesser: the author chooses another last link, not one of the chain (owner, 2026-11-16)', async () => {
    const { chain } = await start();
    const order = ['b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < 5; i++) await moveTelephoneChain(db, order[i], chain.id, telephoneLinkKind(i + 1) === 'drawing' ? { image: PNG, next_id: order[i + 1] } : { text: `подпись${i}`, next_id: order[i + 1] }, t0);
    const back = await runTelephoneTimers(db, later(8 * 60 + 1));
    expect(back.map((n) => n.playerId)).toEqual(['a']);
    const forA = await loadTelephoneChain(db, 'a', chain.id);
    expect(forA).toMatchObject({ status: 'active', step: 'choose_guesser', my_task: { step: 'choose_guesser' } });
    await expect(chooseTelephoneNext(db, 'a', chain.id, { next_id: 'c' }, later(8 * 60 + 2))).rejects.toThrow('не был в этой цепочке');
    await expect(chooseTelephoneNext(db, 'a', chain.id, { next_id: 'h' }, later(8 * 60 + 2))).rejects.toThrow('не был в этой цепочке');
    const { notices } = await chooseTelephoneNext(db, 'a', chain.id, { next_id: 'g' }, later(8 * 60 + 2));
    expect(notices.map((n) => n.playerId)).toEqual(['g']);
    const forG = await loadTelephoneChain(db, 'g', chain.id);
    expect(forG).toMatchObject({ step: 'guess', guesser: { id: 'g' }, my_task: { step: 'guess' } });
    expect(forG.items.map((i) => i.kind)).toEqual(['caption', 'drawing']);
  });

  it('a silent chooser: choosing goes one link back, up to the author; the author is only reminded', async () => {
    const { chain } = await start();
    await moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'c' }, t0);
    await moveTelephoneChain(db, 'c', chain.id, { text: 'Шар', next_id: 'd' }, t0);
    await declineTelephoneTurn(db, 'd', chain.id, t0); // the turn returns to c
    expect((await loadTelephoneChain(db, 'c', chain.id)).my_task).toMatchObject({ step: 'choose' });
    const up = await runTelephoneTimers(db, later(8 * 60 + 1)); // c silent → b chooses
    expect(up.map((n) => n.playerId)).toEqual(['b']);
    expect((await loadTelephoneChain(db, 'b', chain.id)).my_task).toMatchObject({ step: 'choose', position: 3 });
    // b got the choice at 21:01 Moscow: 3 hours before midnight, the night does not count, 5 more hours from 08:00.
    expect(await runTelephoneTimers(db, later(16 * 60 + 2))).toEqual([]);
    const top = await runTelephoneTimers(db, later(24 * 60 + 2)); // b silent → the author chooses
    expect(top.map((n) => n.playerId)).toEqual(['a']);
    const wait = await runTelephoneTimers(db, later(32 * 60 + 3)); // the author silent → he is reminded, the chain waits
    expect(wait.map((n) => n.playerId)).toEqual(['a']);
    expect((await loadTelephoneChain(db, 'a', chain.id))).toMatchObject({ status: 'active', step: 'choose', current: { id: 'a' } });
    await chooseTelephoneNext(db, 'a', chain.id, { next_id: 'e' }, later(32 * 60 + 4));
    expect((await loadTelephoneChain(db, 'e', chain.id)).my_task).toMatchObject({ step: 'move', kind: 'drawing', position: 3 });
  });

  it('one word in any form: «кот», «кота», «котом» are one word, «котлета» is another', async () => {
    const { chain } = await start();
    await moveTelephoneChain(db, 'b', chain.id, { image: PNG, next_id: 'c' }, t0);
    await moveTelephoneChain(db, 'c', chain.id, { text: 'Кот на крыше', next_id: 'd' }, t0);
    await moveTelephoneChain(db, 'd', chain.id, { image: PNG, next_id: 'e' }, t0);
    await expect(moveTelephoneChain(db, 'e', chain.id, { text: 'Два кота', next_id: 'f' }, t0)).rejects.toThrow('«кота» уже было');
    await expect(moveTelephoneChain(db, 'e', chain.id, { text: 'Птица над крышами', next_id: 'f' }, t0)).rejects.toThrow('«крышами» уже было');
    await moveTelephoneChain(db, 'e', chain.id, { text: 'Котлета на тарелке', next_id: 'f' }, t0);
  });

  it('posts a finished chain to «Новости» once, as an album of the drawings', async () => {
    await ensureTelegramPublishingSchema(db); await ensureClubResultPostSchema(db);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: init.body }); return new Response(JSON.stringify({ ok: true, result: [{ message_id: 1 }, { message_id: 2 }, { message_id: 3 }] }), { status: 200 }); }) as any;
    const { chain } = await start();
    const order = ['b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < 5; i++) await moveTelephoneChain(db, order[i], chain.id, telephoneLinkKind(i + 1) === 'drawing' ? { image: PNG, next_id: order[i + 1] } : { text: `подпись${i}`, next_id: order[i + 1] }, t0);
    await guessTelephoneChain(db, 'h', chain.id, { text: 'отгадка' }, t0);
    await runDrawingTelephone(db, fetchImpl, t0);
    await runDrawingTelephone(db, fetchImpl, t0);
    const albums = calls.filter((c) => String(c.url).includes('sendMediaGroup'));
    expect(albums).toHaveLength(1);
  });
});

import { appBackTarget, parsePlayerRoute, playerPathForSection } from '../lib/appNavigation.ts';
describe('drawing telephone pages', () => {
  it('lives at /player/telephone and a chain at /player/telephone/<id>', () => {
    expect(playerPathForSection('telephone')).toBe('/player/telephone');
    expect(playerPathForSection('telephone', 'c 1')).toBe('/player/telephone/c%201');
    expect(parsePlayerRoute('/player/telephone/c%201')).toMatchObject({ section: 'telephone', target: 'c 1' });
    expect(appBackTarget('/player/telephone/c1')).toBe('/player/telephone');
    expect(appBackTarget('/player/telephone')).toBe('/player/club/games');
  });
});
