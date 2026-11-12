import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const page = { promo: { headline: 'Вечер для новичков: никогда не играли — приходите, всему научим!', firstTimeTitle: 'Первый раз?', firstTimeText: 'Правила объясним с нуля, за столом такие же новички. Можно прийти одному.', title: 'Мафия, в которой побеждает не самый громкий, а самый внимательный', intro: 'Классическая мафия — это игра умов: за столом прячется мафия, и вам нужно её найти.', reasonsTitle: 'Почему затягивает:', reasons: ['🧠 Голова работает на полную — как решать детектив.', '🍻 Живое общение, смех и компания, в которую хочется вернуться.'] },
  evening: { id: 'e1', title: 'Новички', starts_at: '2026-11-14T16:00:00Z', venue: { name: 'Суп с Котом', address: 'Тула, Пушкинский проезд, 4А', mapUrl: 'https://yandex.ru/maps' }, schedule: 'Рассказываем правила — 19:00, первая игра — 19:30', price: '200 ₽ за игру', join_url: '/join/e1', telegram_url: 'https://t.me/bot?start=event_e1' },
  contacts: [{ label: 'Telegram', url: 'https://t.me/Chagina7x' }, { label: 'VK', url: 'https://vk.com/m1kesh1noda' }], vk_group: 'https://vk.com/2lanoiremafia', telegram_group: 'https://t.me/+abc' };

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`welcome page at ${width}x${height}`, async ({ page: browser }, info) => {
    await browser.setViewportSize({ width, height });
    await browser.route('**/api/public/welcome', (route) => route.fulfill({ json: page }));
    await browser.route('**/api/public/welcome/visit', (route) => route.fulfill({ json: { ok: true } }));
    await browser.route('**/api/public/welcome/lead', (route) => route.fulfill({ status: 201, json: { ok: true, created: true } }));
    await browser.goto('/welcome?src=vk');
    await expect(browser.getByText('Суп с Котом')).toBeVisible();
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.screenshot({ path: info.outputPath(`welcome-${width}.png`), fullPage: true });
    await browser.getByLabel(/Как вас зовут/).fill('Иван');
    await browser.getByLabel(/Ваш ник в Telegram/).fill('@ivan_tg');
    await browser.getByRole('button', { name: 'Отправить' }).click();
    await expect(browser.getByTestId('welcome-done')).toBeVisible();
    expect(await browser.evaluate(auditScreen)).toEqual([]);
    await browser.screenshot({ path: info.outputPath(`welcome-done-${width}.png`), fullPage: true });
  });
}
