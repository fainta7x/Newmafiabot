import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
 test(`personal evening and debt retry at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 713 });
  await page.clock.setFixedTime(new Date('2026-10-26T18:00:00+03:00'));
  await page.goto('/e2e/player-cabinet.html?scenario=personal');
  const next = page.getByTestId('player-home-next');
  await expect(next).toContainText('Мой следующий вечер');
  await expect(next).toContainText('Пятничный вечер клуба');
  await expect(next).toContainText('Приду позже');
  await expect(next).toContainText('В резерве');
  await expect(next).toContainText('Выбраны игры: 1, 3');
  await expect(next).not.toContainText('Ближайший открытый вечер');
  await page.screenshot({ path: info.outputPath(`home-personal-${width}.png`), fullPage: true });
  await next.getByRole('button', { name: /Моя запись/ }).click();
  expect(new URL(page.url()).searchParams.get('route')).toBe('/player/events/preview-evening');
  await page.goto('/e2e/player-cabinet.html?scenario=personal&route=%2Fplayer%2Fwallet%2Fshop&tab=shop&payments=error');
  const error = page.getByTestId('wallet-debt-error');
  await expect(error).toContainText('Не удалось загрузить долг');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const retry = error.getByRole('button', { name: 'Повторить' });
  expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath(`wallet-error-${width}.png`), fullPage: true });
  await retry.click();
  await expect(error).toHaveCount(0);
  await expect(page.getByText('200 ₽', { exact: true })).toBeVisible();
 });
}

test('subviews survive refresh, browser Back and mini-game return addresses', async ({ page }) => {
 await page.goto('/e2e/player-cabinet.html?route=%2Fplayer%2Fclub');
 const community = page.getByLabel('Разделы сообщества');
 await community.getByRole('button', { name: 'Связи', exact: true }).click();
 expect(new URL(page.url()).searchParams.get('route')).toBe('/player/club/connections');
 await page.getByLabel('Что показать').getByRole('button', { name: 'Пары', exact: true }).click();
 await page.reload();
 await expect(page.getByTestId('club-duo-p1-p2')).toBeVisible();
 await community.getByRole('button', { name: 'Мини-игры' }).click();
 await page.reload();
 await expect(page.getByTestId('player-club-poker')).toBeVisible();
 await page.goBack();
 await expect(page.getByTestId('club-duo-p1-p2')).toBeVisible();
 await community.getByRole('button', { name: 'Активность' }).click();
 await page.getByLabel('Разделы активности').getByRole('button', { name: 'Матчи' }).click();
 await page.reload();
 await expect(page.getByLabel('Разделы активности').getByRole('button', { name: 'Матчи' })).toHaveAttribute('aria-current', 'page');
 await community.getByRole('button', { name: 'Рейтинг', exact: true }).click();
 await page.getByLabel('Разделы рейтинга').getByRole('button', { name: 'Показатели' }).click();
 await page.reload();
 await expect(page.getByLabel('Разделы рейтинга').getByRole('button', { name: 'Показатели' })).toHaveAttribute('aria-current', 'page');
 await page.getByTestId('player-quick-wallet').click();
 const wallet = page.getByRole('navigation', { name: 'Разделы кошелька' });
 await wallet.getByRole('button', { name: /История/ }).click();
 await page.reload();
 await expect(wallet.getByRole('button', { name: /История/ })).toHaveAttribute('aria-current', 'page');
 await wallet.getByRole('button', { name: /Магазин/ }).click();
 await page.goBack();
 await expect(wallet.getByRole('button', { name: /История/ })).toHaveAttribute('aria-current', 'page');
});
