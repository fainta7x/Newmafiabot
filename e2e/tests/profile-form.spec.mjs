import { expect, test } from '@playwright/test';

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
};

test.describe('Stage 4.2 shared profile form', () => {
  test.use({ viewport: { width: 390, height: 620 } });

  test('keeps canonical fields usable and saves profile data in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/profile-form.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const section = page.getByTestId('profile-personal-data');
    await expect(section).toBeVisible();

    const nickname = page.getByLabel('Игровой ник');
    const fullName = page.getByLabel('Имя');
    const phone = page.getByLabel('Телефон');
    const fields = [nickname, fullName, phone];

    for (const field of fields) {
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page, 'profile form');

    await nickname.fill('Чагин 2');
    await fullName.fill('Евгений');
    await phone.fill('+7 999 111-22-33');
    await page.getByTestId('profile-save').click();

    await expect(page.getByTestId('profile-form-message')).toContainText('Профиль сохранён');
    await expect(nickname).toHaveValue('Чагин 2');

    const path = testInfo.outputPath('stage4-profile-form.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('stage4-profile-form.png', { path, contentType: 'image/png' });

    await nickname.fill('');
    await page.getByTestId('profile-save').click();
    await expect(page.getByRole('alert')).toContainText('Ник не может быть пустым');
  });
});
