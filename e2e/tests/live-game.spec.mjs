import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const visualsDir = path.join(process.cwd(), 'test-results', 'visuals');

const saveVisual = async (page, name) => {
  fs.mkdirSync(visualsDir, { recursive: true });
  await page.screenshot({ path: path.join(visualsDir, `${name}.png`), fullPage: false });
};

const assertMobileLayout = async (page) => {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.evening-live-engine-shell');
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      shellClientWidth: shell?.clientWidth ?? 0,
      shellScrollWidth: shell?.scrollWidth ?? 0,
    };
  });
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.shellScrollWidth).toBeLessThanOrEqual(metrics.shellClientWidth + 1);
};

const mountLiveGameHarness = async (page) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    localStorage.clear();
    const applicationRoot = document.getElementById('root');
    if (applicationRoot) applicationRoot.style.display = 'none';
    document.getElementById('live-game-e2e-root')?.remove();
    const root = document.createElement('div');
    root.id = 'live-game-e2e-root';
    document.body.appendChild(root);
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/src/liveGameE2EEntry.tsx';
    document.body.appendChild(script);
  });
  await expect(page.getByTestId('live-game-e2e-harness')).toBeVisible();
};

const tableSeat = (page, seat) => page
  .locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]')
  .first()
  .locator(':scope > div')
  .nth(seat - 1);

const primarySpeechAction = (page, seat) => page.getByRole('button', { name: `Речь #${seat}` }).last();

const openSeatAction = async (page, seat) => {
  await tableSeat(page, seat).click({ force: true });
};

const addRegularFoulFromActionSheet = async (page, seat) => {
  await openSeatAction(page, seat);
  await page.getByRole('button', { name: '+ Обычный фол', exact: true }).click();
};

test('club Live Game can run through the critical mobile flow', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await mountLiveGameHarness(page);
  await expect(page.getByRole('heading', { name: 'Раздача ролей' })).toBeVisible();
  await assertMobileLayout(page);
  await saveVisual(page, '01-setup');

  await page.getByRole('button', { name: 'Начать раздачу ролей →' }).click();
  await expect(page.getByRole('heading', { name: 'Подготовьте 10 карт' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать раздачу', exact: true }).click();
  await expect(page.getByText('Место №1')).toBeVisible();
  await saveVisual(page, '02-role-deal');

  for (let index = 0; index < 6; index += 1) await page.getByRole('button', { name: /Мирный/ }).click();
  await page.getByRole('button', { name: /Шериф/ }).click();
  await page.getByRole('button', { name: /Мафия/ }).click();
  await page.getByRole('button', { name: /Мафия/ }).click();
  await page.getByRole('button', { name: /Дон/ }).click();
  await page.getByRole('button', { name: /Роли зафиксированы — перейти к договорке/ }).click();

  await expect(page.getByRole('button', { name: 'Договорка · 75с' })).toBeVisible();
  await saveVisual(page, '03-zero-night');
  await page.getByRole('button', { name: 'Договорка · 75с' }).click();
  await page.getByRole('button', { name: 'Вызов шерифа · 10с' }).click();
  await page.getByRole('button', { name: 'Посадка · 40с' }).click();
  await page.getByRole('button', { name: 'Разбудить город' }).click();

  await expect(primarySpeechAction(page, 1)).toBeVisible();
  await assertMobileLayout(page);
  await saveVisual(page, '04-day-one');

  await primarySpeechAction(page, 1).click();
  await openSeatAction(page, 2);
  await expect(page.getByRole('button', { name: 'Выставить · речь #1' })).toBeVisible();
  await saveVisual(page, '05-player-action-sheet');
  await page.getByRole('button', { name: 'Выставить · речь #1' }).click();
  await page.getByRole('button', { name: 'Завершить речь #1' }).click();

  await primarySpeechAction(page, 2).click();
  await openSeatAction(page, 3);
  await page.getByRole('button', { name: 'Выставить · речь #2' }).click();
  await page.getByRole('button', { name: 'Завершить речь #2' }).click();

  for (let seat = 3; seat <= 10; seat += 1) {
    await primarySpeechAction(page, seat).click();
    await page.getByRole('button', { name: `Завершить речь #${seat}` }).click();
  }

  await page.getByRole('button', { name: 'К голосованию' }).click();
  await expect(page.getByText('Кто против', { exact: false })).toBeVisible();
  for (let index = 0; index < 6; index += 1) await page.getByRole('button', { name: '+1', exact: true }).click();
  await assertMobileLayout(page);
  await saveVisual(page, '06-voting-first-candidate');

  await page.getByRole('button', { name: 'Следующий →' }).click();
  await expect(page.getByText('Последнему кандидату автоматически уходят все оставшиеся голоса', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Подвести итог' }).click();
  await expect(page.getByText('Игрок #2 покидает стол')).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить' }).click();

  await expect(page.getByRole('heading', { name: 'Протокол ЛХ' })).toBeVisible();
  await saveVisual(page, '07-zero-round-best-move');
  const bestMoveDialog = page.getByRole('heading', { name: 'Протокол ЛХ' }).locator('..').locator('..');
  for (const seat of [1, 2, 3]) await bestMoveDialog.getByRole('button', { name: String(seat), exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить протокол' }).click();
  await page.getByRole('button', { name: 'Завершить прощальные' }).click();

  await expect(page.getByRole('button', { name: '♫ Включить музыку ночи' })).toBeVisible();
  await page.getByRole('button', { name: '♫ Включить музыку ночи' }).click();
  await expect(page.getByRole('button', { name: 'Стрельба мафии' })).toBeVisible();
  await page.getByRole('button', { name: 'Стрельба мафии' }).click();
  await tableSeat(page, 8).click({ force: true });
  await page.getByRole('button', { name: 'Проверка Дона' }).click();
  await tableSeat(page, 7).click({ force: true });
  await page.getByRole('button', { name: 'Проверка Шерифа' }).click();
  await tableSeat(page, 10).click({ force: true });
  await expect(page.getByRole('button', { name: '♫ Выключить музыку' })).toBeVisible();
  await page.getByRole('button', { name: '♫ Выключить музыку' }).click();
  await expect(page.getByRole('button', { name: 'Итоги ночи' })).toBeVisible();
  await saveVisual(page, '08-night-checks');
  await page.getByRole('button', { name: 'Итоги ночи' }).click();
  await page.getByRole('button', { name: 'Зафиксировать ночь' }).click();
  await page.getByRole('button', { name: 'Протокол убитого · 15с' }).click();
  await page.getByRole('button', { name: 'К дневным речам' }).click();

  await expect(primarySpeechAction(page, 2)).toBeVisible();
  await addRegularFoulFromActionSheet(page, 3);
  await addRegularFoulFromActionSheet(page, 3);
  await addRegularFoulFromActionSheet(page, 3);
  await primarySpeechAction(page, 2).click();
  await page.getByRole('button', { name: 'Завершить речь #2' }).click();
  await primarySpeechAction(page, 3).click();
  await expect(page.getByText('30с', { exact: true })).toBeVisible();
  await assertMobileLayout(page);
  await saveVisual(page, '09-third-foul-30-seconds');
  await page.getByRole('button', { name: 'Завершить речь #3' }).click();

  await openSeatAction(page, 4);
  await page.getByRole('button', { name: 'ППК', exact: true }).click();
  await expect(page.getByText('Требуется подтверждение')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Подтвердить ППК' })).toBeVisible();
  await saveVisual(page, '10-ppk-confirmation');
  await page.getByRole('button', { name: 'Отмена' }).click();

  expect(pageErrors).toEqual([]);
});
