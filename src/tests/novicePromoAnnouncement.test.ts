import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { novicePromoText, organizerContactLinks } from '../lib/novicePromo.ts';
import { eveningShortCode, resetShortLinkPauseForTests, resolveEveningShortCode } from '../server/services/announcementShortLinks.ts';
import { buildDirectVkEveningAnnouncement } from '../server/services/vkDirectJoinPublishingService.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

const evening = async (format: string) => {
  db = createDatabaseConnection(':memory:');
  await ensureTelegramPublishingSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
     VALUES ('ev', 'Вечер', '2026-10-02T19:00:00+03:00', '2026-10-02T22:00:00+03:00', 'Europe/Moscow', 'Суп с Котом', ?, 'published', 20, 200, ?, ?)`,
    [format, now, now],
  );
  return (await db.get<any>("SELECT id, title, starts_at, timezone, venue, status, default_price, settled_at FROM game_evenings WHERE id='ev'"))!;
};

describe('novice evening promo in announcements', () => {
  it('opens the VK post of a novice evening with the promo and adds the novice chat', async () => {
    const row = await evening('NOVICE');
    await db!.run("UPDATE telegram_destinations SET invite_url = 'https://t.me/+novice', active = 1 WHERE id = 'novice'");
    const text = await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
    expect(text.startsWith(novicePromoText())).toBe(true);
    expect(text).toContain('Почему затягивает:');
    expect(text).toContain('👥 Наши группы:\nTelegram: https://t.me/+novice\nVK: https://vk.com/2lanoiremafia');
    expect(text).toContain('📝 Записаться и посмотреть, кто идёт: https://example.test/e/ev');
    expect(text).toContain('👤 Личный кабинет: https://example.test/player');
    expect(text).toContain('✉️ Остались вопросы? Пишите:\nTelegram: https://t.me/Chagina7x\nVK: https://vk.com/m1kesh1noda');
  });

  it('keeps club evening posts without the promo', async () => {
    const row = await evening('CASUAL');
    const text = await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
    expect(text).not.toContain('Почему затягивает');
    expect(text).not.toContain('Наши группы');
  });

  it('opens the evening from its short link and refuses unknown or ambiguous codes', async () => {
    await evening('CASUAL');
    expect(await resolveEveningShortCode(db!, 'ev')).toBe('ev');
    expect(await resolveEveningShortCode(db!, 'EV')).toBe('ev');
    expect(await resolveEveningShortCode(db!, 'zz')).toBeNull();
    expect(await resolveEveningShortCode(db!, "e'")).toBeNull();
    const now = new Date().toISOString();
    await db!.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev2', 'Вечер', '2026-10-09T19:00:00+03:00', 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'published', 20, 100, ?, ?)`,
      [now, now],
    );
    expect(await resolveEveningShortCode(db!, 'ev')).toBeNull();
    expect(eveningShortCode('7cf5e0f2-1111-2222-3333-444455556666')).toBe('7cf5e0f2');
  });

  it('uses a remembered vk.cc link when VK can shorten it, and the app link when it cannot', async () => {
    const row = await evening('CASUAL');
    const previous = { flag: process.env.VK_SHORT_LINKS, token: process.env.VK_GROUP_ACCESS_TOKEN };
    process.env.VK_SHORT_LINKS = 'on';
    process.env.VK_GROUP_ACCESS_TOKEN = 'test-token';
    resetShortLinkPauseForTests();
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const target = new URLSearchParams(init.body).get('url');
      return new Response(JSON.stringify({ response: { short_url: target?.endsWith('/player') ? 'https://vk.cc/cab1' : 'https://vk.cc/ev1' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const text = await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
      expect(text).toContain('📝 Записаться и посмотреть, кто идёт: https://vk.cc/ev1');
      expect(text).toContain('👤 Личный кабинет: https://vk.cc/cab1');
      expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('url')).toBe('https://example.test/e/ev');
      await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await db!.run('DELETE FROM announcement_short_links');
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { error_code: 15, error_msg: 'Access denied' } }), { status: 200 }));
      const fallback = await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
      expect(fallback).toContain('📝 Записаться и посмотреть, кто идёт: https://example.test/e/ev');
      expect(fallback).toContain('👤 Личный кабинет: https://example.test/player');
    } finally {
      vi.unstubAllGlobals();
      resetShortLinkPauseForTests();
      if (previous.flag === undefined) delete process.env.VK_SHORT_LINKS; else process.env.VK_SHORT_LINKS = previous.flag;
      if (previous.token === undefined) delete process.env.VK_GROUP_ACCESS_TOKEN; else process.env.VK_GROUP_ACCESS_TOKEN = previous.token;
    }
  });

  it('shows only valid organizer contacts', () => {
    expect(organizerContactLinks().every((link) => /^https:\/\/(t\.me|vk\.com|vk\.me)\//.test(link.url))).toBe(true);
  });
});
