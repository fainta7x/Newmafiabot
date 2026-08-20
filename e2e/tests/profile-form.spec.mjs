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

test.describe('Stage 4 shared profile patterns', () => {
  test.use({ viewport: { width: 390, height: 620 } });

  test('keeps canonical fields usable and saves profile data in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/profile-form.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const section = page.getByTestId('profile-personal-data');
    await expect(section).toBeVisible();
    const sectionBorder = await section.evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(sectionBorder).toBe('rgba(255, 255, 255, 0.1)');

    const nickname = page.getByLabel('Игровой ник');
    const fullName = page.getByLabel('Имя');
    const phone = page.getByLabel('Телефон');
    const fields = [nickname, fullName, phone];

    for (const field of fields) {
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
      const treatment = await field.evaluate((element) => {
        const style = getComputedStyle(element);
        return { backgroundImage: style.backgroundImage, boxShadow: style.boxShadow };
      });
      expect(treatment.backgroundImage).toBe('none');
      expect(treatment.boxShadow).toBe('none');
    }

    const save = page.getByTestId('profile-save');
    const saveTreatment = await save.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      };
    });
    expect(saveTreatment.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(saveTreatment.color).toBe('rgb(9, 10, 13)');
    expect(saveTreatment.backgroundImage).toBe('none');
    expect(saveTreatment.boxShadow).toBe('none');

    await expectNoHorizontalOverflow(page, 'profile form');

    await nickname.fill('Чагин 2');
    await fullName.fill('Евгений');
    await phone.fill('+7 999 111-22-33');
    await save.click();

    await expect(page.getByTestId('profile-form-message')).toContainText('Профиль сохранён');
    await expect(nickname).toHaveValue('Чагин 2');

    const path = testInfo.outputPath('stage4-profile-form.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('stage4-profile-form.png', { path, contentType: 'image/png' });

    await nickname.fill('');
    await save.click();
    await expect(page.getByRole('alert')).toContainText('Ник не может быть пустым');
  });

  test('keeps avatar deletion inside the canonical confirmation layer', async ({ page }, testInfo) => {
    await page.goto('/e2e/profile-form.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const deleteAvatar = page.getByRole('button', { name: 'Удалить', exact: true }).first();
    await expect(deleteAvatar).toBeVisible();
    await deleteAvatar.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Удалить аватар?')).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect.soft(box.x).toBeGreaterThanOrEqual(-1);
    expect.soft(box.x + box.width).toBeLessThanOrEqual(391);
    expect.soft(box.y).toBeGreaterThanOrEqual(-1);
    expect.soft(box.y + box.height).toBeLessThanOrEqual(621);

    const dialogTreatment = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, boxShadow: style.boxShadow };
    });
    expect(dialogTreatment.backgroundImage).toBe('none');
    expect(dialogTreatment.boxShadow).not.toBe('none');

    const confirm = dialog.getByRole('button', { name: 'Удалить', exact: true });
    const confirmTreatment = await confirm.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, boxShadow: style.boxShadow };
    });
    expect(confirmTreatment.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(confirmTreatment.backgroundImage).toBe('none');
    expect(confirmTreatment.boxShadow).toBe('none');

    await expectNoHorizontalOverflow(page, 'confirmation dialog');

    const path = testInfo.outputPath('stage4-confirm-dialog.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('stage4-confirm-dialog.png', { path, contentType: 'image/png' });

    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();

    await deleteAvatar.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByTestId('profile-form-message')).toContainText('Аватар удалён');
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });
});
