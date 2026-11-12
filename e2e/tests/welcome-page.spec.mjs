import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const seats = { evening_id: 'e1', going: 7, updated_at: '2026-11-12T10:00:00Z', games: [{ number: 1, starts_at: '2026-11-14T16:00:00Z', target: 10, taken: 7, people: ['Алоэ', 'Богдан', 'Чагин', 'Добряк', 'Мария', 'Насон', 'Дина'] }, { number: 2, starts_at: '2026-11-14T17:30:00Z', target: 10, taken: 3, people: ['Алоэ', 'Богдан', 'Чагин'] }] };
const page = { hero_photos: ['/announce-photo/a.jpg', '/announce-photo/b.jpg'], content: { title: 'Школа спортивной мафии | Тула', lead: 'Любишь азарт соревнований, сложные стратегии и интеллектуальные вызовы? Тогда тебе к нам!', about: 'Спортивная мафия — это интеллектуальная соревновательная дисциплина, сочетающая командное противостояние и индивидуальное мастерство. Здесь решают логика, стратегия, аргументация и умение анализировать соперников.', sections: [{ title: '🎯 Кому к нам?', items: ['🎮 Любителям Dota 2, CS2 и других соревновательных игр.', '♟️ Поклонникам шахмат, стратегий и сложных настолок.'] }, { title: '🎲 Как проходит обучение?', items: ['Опыт не нужен! Объясним правила, познакомим с основами игры и поможем сыграть первые партии.'] }] },
  evening: { id: 'e1', title: 'Новички', starts_at: '2026-11-14T16:00:00Z', venue: { name: 'Суп с Котом', address: 'Тула, Пушкинский проезд, 4А', mapUrl: 'https://yandex.ru/maps' }, schedule: 'Рассказываем правила — 19:00, первая игра — 19:30', price: 'Первые 2 вечера бесплатно, дальше — 200 ₽ за игру', join_url: '/join/e1', telegram_url: 'https://t.me/bot?start=event_e1' },
  contacts: [{ label: 'Telegram', url: 'https://t.me/Chagina7x' }, { label: 'VK', url: 'https://vk.com/m1kesh1noda' }], vk_group: 'https://vk.com/2lanoiremafia', telegram_group: 'https://t.me/+abc' };

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`welcome page at ${width}x${height}`, async ({ page: browser }, info) => {
    await browser.setViewportSize({ width, height });
    await browser.route('**/api/public/welcome', (route) => route.fulfill({ json: page }));
    await browser.route('**/announce-photo/**', (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
    await browser.route('**/api/public/welcome/seats', (route) => route.fulfill({ json: seats }));
    await browser.route('**/api/public/welcome/visit', (route) => route.fulfill({ json: { ok: true } }));
    await browser.route('**/api/public/welcome/lead', (route) => route.fulfill({ status: 201, json: { ok: true, created: true } }));
    await browser.goto('/welcome?src=vk');
    await expect(browser.getByLabel('Ближайшее обучение').getByText('Суп с Котом')).toBeVisible();
    await expect(browser.getByTestId('welcome-seats')).toContainText('свободно 3 из 10');
    // The audit sees only the screen as it is scrolled: check the top, then each block that lies lower.
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.getByTestId('welcome-seats').scrollIntoViewIfNeeded();
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.getByRole('region', { name: 'Знакомство' }).scrollIntoViewIfNeeded();
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.screenshot({ path: info.outputPath(`welcome-${width}.png`), fullPage: true });
    await browser.getByLabel(/Как тебя зовут/).fill('Иван');
    await browser.getByLabel(/Твой ник в Telegram/).fill('@ivan_tg');
    await browser.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(browser.getByTestId('welcome-done')).toBeVisible();
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.screenshot({ path: info.outputPath(`welcome-done-${width}.png`), fullPage: true });
  });
}
