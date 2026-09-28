import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { novicePromoText, organizerContactLinks } from '../lib/novicePromo.ts';
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
    expect(text).toContain('https://example.test/join/ev');
    expect(text).toContain('✉️ Остались вопросы? Пишите:\nTelegram: https://t.me/Chagina7x\nVK: https://vk.com/m1kesh1noda');
  });

  it('keeps club evening posts without the promo', async () => {
    const row = await evening('CASUAL');
    const text = await buildDirectVkEveningAnnouncement(db!, row, 'https://example.test');
    expect(text).not.toContain('Почему затягивает');
    expect(text).not.toContain('Наши группы');
  });

  it('shows only valid organizer contacts', () => {
    expect(organizerContactLinks().every((link) => /^https:\/\/(t\.me|vk\.com|vk\.me)\//.test(link.url))).toBe(true);
  });
});
