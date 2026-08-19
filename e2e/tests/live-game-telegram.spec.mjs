import { expect, test } from '@playwright/test';

const ROLE_SEQUENCE = [
  'Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный',
  'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный',
];

const tableGrid = (page) => page
  .locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]')
  .first();

const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const centerPanel = (page) => page.getByTestId('live-judge-hud');

const prepareZeroRound = async (page) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/e2e/live-game.html');

  // Telegram exposes these variables inside the Mini App WebView. Keep the
  // browser harness intentionally shorter than the generic 390x844 mobile run.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '0px');
    document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom', '8px');

    const shell = document.createElement('div');
    shell.className = 'player-events-shell';
    shell.dataset.testid = 'telegram-fake-cabinet';
    const nav = document.createElement('nav');
    nav.className = 'fixed';
    nav.dataset.testid = 'telegram-fake-bottom-nav';
    nav.style.position = 'fixed';
    nav.style.inset = 'auto 0 0 0';
    nav.style.zIndex = '100';
    nav.style.height = '64px';
    shell.appendChild(nav);
    document.body.appendChild(shell);
  });

  await expect(page.getByText('Раздача ролей', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
  const intro = page.getByText('Подготовьте 10 карт');
  await expect(intro).toBeVisible();
  await intro.locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Начать раздачу', exact: true }).click();

  for (const role of ROLE_SEQUENCE) {
    await page.getByRole('button', { name: new RegExp(role) }).click();
  }
  await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
  await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
  await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
  await expect(tableGrid(page)).toBeVisible();
};

test.describe('Live Game in Telegram WebApp host', () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(90_000);

  test('fits the stable viewport and supports direct nomination during speech', async ({ page }, testInfo) => {
    await prepareZeroRound(page);

    const hostMetrics = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0.z-\\[95\\]:has(> .evening-live-engine-shell)');
      const shell = document.querySelector('.evening-live-engine-shell');
      const board = document.querySelector('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]');
      const fakeNav = document.querySelector('[data-testid="telegram-fake-bottom-nav"]');
      const modalStyle = modal ? getComputedStyle(modal) : null;
      const navStyle = fakeNav ? getComputedStyle(fakeNav) : null;
      const modalRect = modal?.getBoundingClientRect();
      const boardRect = board?.getBoundingClientRect();
      return {
        modalHeight: modalRect?.height || 0,
        modalZ: Number(modalStyle?.zIndex || 0),
        boardHeight: boardRect?.height || 0,
        shellClientHeight: shell?.clientHeight || 0,
        navVisibility: navStyle?.visibility || '',
        navPointerEvents: navStyle?.pointerEvents || '',
      };
    });

    expect(hostMetrics.modalHeight).toBeLessThanOrEqual(620.5);
    expect(hostMetrics.modalHeight).toBeGreaterThan(600);
    expect(hostMetrics.modalZ).toBeGreaterThan(100);
    expect(hostMetrics.boardHeight).toBeLessThanOrEqual(580);
    expect(hostMetrics.boardHeight).toBeGreaterThan(0);
    expect(hostMetrics.shellClientHeight).toBeGreaterThan(0);
    expect(hostMetrics.navVisibility).toBe('hidden');
    expect(hostMetrics.navPointerEvents).toBe('none');

    const nominateTwo = seatCard(page, 2).getByRole('button', { name: 'Выставить #2', exact: true });
    await expect(nominateTwo).toBeVisible();
    expect(await nominateTwo.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');

    await page.getByRole('button', { name: /Речь #1(?:\s| ·|$)/ }).last().click();
    await expect(page.getByRole('button', { name: /Завершить речь #1/ })).toBeVisible();
    expect(await nominateTwo.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('auto');

    await nominateTwo.click();
    await expect(seatCard(page, 2).getByRole('button', { name: 'Снять выставление #2', exact: true })).toBeVisible();
    await expect(centerPanel(page)).toContainText('Выставлены #2');

    const hudMetrics = await centerPanel(page).evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));
    expect(hudMetrics.scrollWidth).toBeLessThanOrEqual(hudMetrics.clientWidth + 1);
    expect(hudMetrics.clientHeight).toBeGreaterThan(0);

    await page.getByRole('button', { name: /Завершить речь #1/ }).click();
    await expect(seatCard(page, 1).locator('.live-seat-state__value--done')).toBeHidden();
    await expect(page.locator('.evening-live-identity[data-seat="1"] .evening-live-identity-name')).toBeVisible();

    const screenshotPath = testInfo.outputPath('telegram-stable-viewport.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('telegram-stable-viewport.png', { path: screenshotPath, contentType: 'image/png' });
  });
});
