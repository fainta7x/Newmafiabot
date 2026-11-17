import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  cancelSantaEvent, createSantaEvent, drawSanta, joinSanta, leaveSanta, loadSantaForOrganizer, loadSantaForPlayer, runSecretSantaPosts,
} from '../server/services/secretSantaService.ts';
import { santaAnnouncementText, santaCircle } from '../shared/secretSanta.ts';

// «Тайный Санта» (owner, 2026-11-17): gifts up to 1000 ₽, the player confirms himself, the draw only among those who
// joined, at the organizer's button; the exchange at a club evening; a «Новости» post and the result in a personal message.
const t0 = new Date('2026-12-01T10:00:00Z');
const names = ['a', 'b', 'c', 'd', 'e'];
describe('secret santa', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (const id of names) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Новогодний вечер','2026-12-20T16:00:00Z','Europe/Moscow','CASUAL','published',20,0,'x','x')`);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('old','Прошлый','2026-11-20T16:00:00Z','Europe/Moscow','CASUAL','completed',20,0,'x','x')`);
  });
  afterEach(() => { vi.unstubAllEnvs(); db.sqlite.close(); });

  it('one circle through everyone: nobody draws himself, no two draw each other, everyone gives and gets once', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const random = (n: number) => { x = (x * 48271) % 2147483647; return x % n; };
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].slice(0, 3 + (seed % 5));
      const pairs = santaCircle(ids, random);
      expect(pairs.map((p) => p.giver).sort()).toEqual([...ids].sort());
      expect(pairs.map((p) => p.receiver).sort()).toEqual([...ids].sort());
      for (const pair of pairs) {
        expect(pair.giver).not.toBe(pair.receiver);
        expect(pairs.some((other) => other.giver === pair.receiver && other.receiver === pair.giver)).toBe(false);
      }
    }
  });

  it('the organizer opens it for a future evening; only one at a time; cancel before the draw', async () => {
    await expect(createSantaEvent(db, { evening_id: 'old' }, t0)).rejects.toThrow('будущий вечер');
    const created = await createSantaEvent(db, { evening_id: 'ev' }, t0);
    expect(created.event).toMatchObject({ status: 'open', gift_limit: 1000, evening: { id: 'ev', title: 'Новогодний вечер' }, posted: false });
    await expect(createSantaEvent(db, { evening_id: 'ev' }, t0)).rejects.toThrow('уже идёт');
    await cancelSantaEvent(db, created.event!.id, t0);
    expect((await loadSantaForPlayer(db, 'a', t0)).event).toBeNull();
    await createSantaEvent(db, { evening_id: 'ev' }, t0);
  });

  it('a player joins only with the promise ticked and may leave before the draw', async () => {
    await createSantaEvent(db, { evening_id: 'ev' }, t0);
    await expect(joinSanta(db, 'a', {}, t0)).rejects.toThrow('Подтвердите');
    const joined = await joinSanta(db, 'a', { confirm: true }, t0);
    expect(joined.event).toMatchObject({ joined: true, participants: [{ id: 'a', nickname: 'A' }], recipient: null });
    expect((await leaveSanta(db, 'a', t0)).event).toMatchObject({ joined: false, participants: [] });
  });

  it('the draw: at least 3, only those who joined, each giver gets a personal message, nobody else sees the pairs', async () => {
    const { event } = await createSantaEvent(db, { evening_id: 'ev' }, t0);
    for (const id of ['a', 'b']) await joinSanta(db, id, { confirm: true }, t0);
    await expect(drawSanta(db, event!.id, t0)).rejects.toThrow('хотя бы 3');
    for (const id of ['c', 'd']) await joinSanta(db, id, { confirm: true }, t0);
    const drawn = await drawSanta(db, event!.id, t0);
    expect(drawn.event?.status).toBe('drawn');
    expect(JSON.stringify(drawn)).not.toMatch(/receiver|recipient/);
    expect(drawn.event?.participants.map((p) => p.message)).toEqual(['queued', 'queued', 'queued', 'queued']);

    const seen = new Map<string, string>();
    for (const id of ['a', 'b', 'c', 'd']) {
      const state = await loadSantaForPlayer(db, id, t0);
      expect(state.event?.recipient?.id).toBeDefined();
      expect(state.event!.recipient!.id).not.toBe(id);
      expect(['a', 'b', 'c', 'd']).toContain(state.event!.recipient!.id);
      seen.set(id, state.event!.recipient!.id);
    }
    expect(new Set(seen.values()).size).toBe(4);
    expect((await loadSantaForPlayer(db, 'e', t0)).event).toMatchObject({ joined: false, recipient: null, status: 'drawn' });

    const messages = await db.all<{ player_id: string; text: string }>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'secret_santa' ORDER BY player_id");
    expect(messages.map((m) => m.player_id)).toEqual(['a', 'b', 'c', 'd']);
    expect(messages[0].text).toContain(`ты даришь подарок игроку ${seen.get('a')!.toUpperCase()}`);
    expect(messages[0].text).toContain('до 1000 ₽');
    expect(messages[0].text).toContain('Новогодний вечер');

    await expect(joinSanta(db, 'e', { confirm: true }, t0)).rejects.toThrow('Запись закрыта');
    await expect(leaveSanta(db, 'a', t0)).rejects.toThrow('После жеребьёвки');
    await expect(drawSanta(db, event!.id, t0)).rejects.toThrow('уже проведена');
    await expect(cancelSantaEvent(db, event!.id, t0)).rejects.toThrow('отменить нельзя');
  });

  it('the «Новости» post goes once, with the «Участвовать» button', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    await ensureTelegramPublishingSchema(db);
    await createSantaEvent(db, { evening_id: 'ev' }, t0);
    const sent: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await runSecretSantaPosts(db, fetchImpl, t0)).toBe(1);
    expect(await runSecretSantaPosts(db, fetchImpl, t0)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(santaAnnouncementText({ id: 'ev', title: 'Новогодний вечер', starts_at: '2026-12-20T16:00:00Z' }));
    expect(JSON.stringify(sent[0].reply_markup)).toContain('Участвовать');
    expect(JSON.stringify(sent[0].reply_markup)).toContain('/player/santa');
    expect((await loadSantaForOrganizer(db, t0)).event?.posted).toBe(true);
  });

  it('the text names the evening, the date by Moscow time and the limit', () => {
    const text = santaAnnouncementText({ id: 'ev', title: 'Новогодний вечер', starts_at: '2026-12-20T16:00:00Z' });
    expect(text).toContain('до 1000 ₽');
    expect(text).toContain('«Новогодний вечер», 20 декабря, вс, 19:00');
  });

  it('API: the player and the organizer routes', async () => {
    const app = await createApp(db);
    const org = `organizer_token=${generateOrganizerToken()}`;
    expect((await request(app).get('/api/crm/santa')).status).toBe(401);
    const list = await request(app).get('/api/crm/santa').set('Cookie', org);
    expect(list.status).toBe(200);
    expect(list.body.event).toBeNull();
    expect(list.body.evenings.map((e: any) => e.id)).toContain('ev');
    expect((await request(app).post('/api/crm/santa').set('Cookie', org).send({ evening_id: 'ev' })).status).toBe(200);
    expect((await request(app).get('/api/player/santa')).status).toBe(401);
  });
});
