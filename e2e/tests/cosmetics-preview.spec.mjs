import { test, expect } from '@playwright/test';

for (const width of [360, 390, 1440]) {
  test(`fiery autumn preview switches surfaces at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/e2e/cosmetics.html');
    for (const [surface, label] of [['profile','Профиль'],['poker','Покер'],['broadcast','Эфир']]) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const scene = page.getByTestId(`autumn-scene-${surface}`);
      await expect(scene).toBeVisible();
      await expect.poll(() => scene.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`fiery-autumn-${surface}-${width}.png`) });
    }
    await page.getByText('Оформление', { exact: true }).click();
    await expect(page.getByTestId('autumn-scene-broadcast')).not.toBeVisible();
  });
}

for (const width of [360, 390, 1440]) {
  test(`four role looks save independently at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const roles = ['civilian', 'mafia', 'don', 'sheriff'];
    const looks = roles.map(role => ({ role, phrase: '', background: 'noir', hatItemId: null, jacketItemId: null, revision: 0 }));
    await page.route('**/api/player/cosmetics/role-looks', route => route.fulfill({ json: { looks, layers: [], portraitVersion: null } }));
    await page.route('**/api/player/cosmetics/role-looks/*', async route => {
      const role = route.request().url().split('/').pop(), input = route.request().postDataJSON();
      const next = { ...input, role, revision: input.expectedRevision + 1 }; delete next.expectedRevision;
      looks[roles.indexOf(role)] = next;
      await route.fulfill({ json: next });
    });
    await page.route('**/api/players/preview-player/avatar', route => route.fulfill({ status: 404, json: {} }));
    await page.goto('/e2e/cosmetics.html');
    const editor = page.locator('.role-looks-editor');
    await expect(editor.getByLabel('Фраза', { exact: true })).toBeVisible();
    for (const label of ['Мирный', 'Мафия', 'Дон', 'Шериф']) {
      const button = editor.getByRole('button', { name: label, exact: true });
      await button.click();
      await editor.getByLabel('Фраза', { exact: true }).fill(`Фраза: ${label}`);
      await editor.getByRole('button', { name: `Сохранить: ${label}`, exact: true }).click();
      await expect(editor.getByRole('status')).toContainText('сохранён');
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.reload();
    await editor.getByRole('button', { name: 'Дон', exact: true }).click();
    await expect(editor.getByLabel('Фраза', { exact: true })).toHaveValue('Фраза: Дон');
    await editor.getByLabel('Фраза', { exact: true }).fill('Оченьдлиннаяфразабезпробелов'.repeat(2));
    await editor.getByLabel('Фон', { exact: true }).selectOption('autumn');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(editor.getByLabel('Головной убор')).toBeDisabled();
    await editor.screenshot({ path: testInfo.outputPath(`role-looks-editor-${width}.png`) });
  });
}

for (const width of [360, 390, 1440]) {
  test(`clickable wardrobe lab previews clothing and freezes a game at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/cosmetics-lab.html');
    const editor = page.locator('.role-looks-editor');
    await editor.getByRole('button', { name: 'Дон', exact: true }).click();
    await editor.getByLabel('Фраза', { exact: true }).fill('Первая фраза');
    await editor.getByLabel('Головной убор', { exact: true }).selectOption('lab-hat');
    await editor.getByLabel('Пиджак', { exact: true }).selectOption('lab-jacket');
    await editor.getByLabel('Фон', { exact: true }).selectOption('autumn');
    await editor.getByRole('button', { name: 'Сохранить: Дон', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('сохранён');
    await page.getByRole('group', { name: 'Роль на трансляции' }).getByRole('button', { name: 'Дон', exact: true }).click();
    const broadcast = page.getByTestId('lab-broadcast-card');
    await expect(broadcast).toContainText('Первая фраза');
    await expect(broadcast.getByAltText('Пиджак')).toBeVisible();
    await expect(broadcast.getByAltText('Головной убор')).toBeVisible();
    for (const img of await broadcast.locator('img').all()) await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Зафиксировать образ для тестовой игры' }).click();
    await editor.getByLabel('Фраза', { exact: true }).fill('Новая фраза');
    await editor.getByLabel('Головной убор', { exact: true }).selectOption('');
    await editor.getByRole('button', { name: 'Сохранить: Дон', exact: true }).click();
    await expect(broadcast).toContainText('Новая фраза');
    await expect(broadcast.getByAltText('Головной убор')).toHaveCount(0);
    await expect(page.getByTestId('lab-frozen-card')).toContainText('Первая фраза');
    await expect(page.getByTestId('lab-frozen-card').getByAltText('Головной убор')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`clickable-cosmetics-lab-${width}.png`), fullPage: true });
    await page.reload();
    await editor.getByRole('button', { name: 'Дон', exact: true }).click();
    await expect(editor.getByLabel('Фраза', { exact: true })).toHaveValue('Новая фраза');
    await expect(editor.getByLabel('Пиджак', { exact: true })).toHaveValue('lab-jacket');
  });
}
