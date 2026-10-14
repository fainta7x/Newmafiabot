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
    const lockedHat = editor.getByRole('group', { name: 'Головной убор' });
    // Playwright may report the FIELDSET itself enabled; verify its actual disabled attribute
    // and the user-facing button it disables while the portrait base is unapproved.
    await expect(lockedHat).toHaveAttribute('disabled', '');
    await expect(lockedHat.getByRole('button', { name: 'Без предмета' })).toBeDisabled();
    await editor.screenshot({ path: testInfo.outputPath(`role-looks-editor-${width}.png`) });
  });
}

for (const width of [360, 390, 1440]) {
  test(`clickable wardrobe lab previews clothing and freezes a game at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/cosmetics-lab.html');
    const active=page.locator('.cosmetics-lab-character-view:not([hidden])');
    const editor = active.locator('.role-looks-editor');
    await editor.getByRole('button', { name: 'Дон', exact: true }).click();
    await editor.getByLabel('Фраза', { exact: true }).fill('Первая фраза');
    await editor.getByRole('button', { name: /Медный лист/ }).click();
    await editor.getByRole('button', { name: /Багряный пиджак/ }).click();
    await editor.getByLabel('Фон', { exact: true }).selectOption('autumn');
    await editor.getByRole('button', { name: 'Сохранить: Дон', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('сохранён');
    await page.getByRole('group', { name: 'Роль на трансляции' }).getByRole('button', { name: 'Дон', exact: true }).click();
    const broadcast = active.getByTestId('lab-broadcast-card');
    await expect(broadcast).toContainText('Первая фраза');
    await expect(broadcast.getByRole('img',{name:'Пиджак',exact:true})).toBeVisible();
    await expect(broadcast.getByAltText('Головной убор')).toBeVisible();
    for (const canvas of await broadcast.locator('canvas').all())await expect(canvas).toHaveAttribute('data-rendered','true');
    for (const img of await broadcast.locator('img').all()) await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Зафиксировать образ для тестовой игры' }).click();
    await editor.getByLabel('Фраза', { exact: true }).fill('Новая фраза');
    await editor.getByRole('group', { name: 'Головной убор' }).getByRole('button', { name: 'Без предмета' }).click();
    await editor.getByRole('button', { name: 'Сохранить: Дон', exact: true }).click();
    await expect(broadcast).toContainText('Новая фраза');
    await expect(broadcast.getByAltText('Головной убор')).toHaveCount(0);
    await expect(active.getByTestId('lab-frozen-card')).toContainText('Первая фраза');
    await expect(active.getByTestId('lab-frozen-card').getByAltText('Головной убор')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`clickable-cosmetics-lab-${width}.png`), fullPage: true });
    await page.reload();
    await editor.getByRole('button', { name: 'Дон', exact: true }).click();
    await expect(editor.getByLabel('Фраза', { exact: true })).toHaveValue('Новая фраза');
    await expect(editor.getByRole('button', { name: /Багряный пиджак/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: /Белая рубашка/ })).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: /Чёрный пиджак/ }).click();
    await expect(editor.getByTestId('role-look-preview').getByRole('img',{name:'Пиджак',exact:true})).toHaveAttribute('data-asset-url', /jacket-black-v2/);
    await expect(editor.getByTestId('role-look-preview').getByAltText('Портрет игрока')).toHaveAttribute('src', /base-v2/);
  });
}

for (const width of [360, 390, 1440]) {
  test(`five approved-quantity draft set slots are clickable at ${width}px`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/e2e/cosmetics-lab.html');
    const workshop=page.locator('.cosmetics-lab-character-view:not([hidden]) .cosmetic-set-studio');
    await expect(workshop).toBeVisible();
    await expect(workshop.getByRole('group',{name:'Черновики сетов'}).getByRole('button')).toHaveCount(5);
    await expect(workshop.getByRole('button',{name:/Сет 1/})).toContainText('Обычный');
    await expect(workshop.getByRole('button',{name:/Сет 5/})).toContainText('Легендарный');
    await workshop.getByRole('button',{name:/Медный лист · примерка/}).click();
    await workshop.getByRole('button',{name:/Багряный пиджак · примерка/}).click();
    await expect(workshop.getByAltText('Пиджак')).toBeVisible();
    await expect(workshop.getByAltText('Головной убор')).toBeVisible();
    await workshop.getByRole('button',{name:'Сохранить состав черновика'}).click();
    await expect(workshop.getByRole('status')).toContainText('Состав черновика сохранён');
    const first=workshop.getByRole('button',{name:/Сет 1/});
    await expect(first).toContainText('2 шт.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await workshop.screenshot({path:testInfo.outputPath(`draft-set-workshop-${width}.png`)});
    await page.reload();
    const restored=page.locator('.cosmetics-lab-character-view:not([hidden]) .cosmetic-set-studio');
    await expect(restored.getByRole('button',{name:/Сет 1/})).toContainText('2 шт.');
    await expect(restored.getByRole('button',{name:/Медный лист · примерка/})).toHaveAttribute('aria-pressed','true');
    await expect(restored.getByRole('button',{name:/Багряный пиджак · примерка/})).toHaveAttribute('aria-pressed','true');
  });
}
