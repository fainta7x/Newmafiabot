import { test, expect } from '@playwright/test';

for (const width of [390, 1024, 1366, 1440]) {
  test(`Cabinet and CRM home hierarchy at ${width}px`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 900 });
    const shot = async name => {
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByText('Этот сценарий пока не подготовлен в предпросмотре', { exact: true })).toHaveCount(0);
      await page.mouse.move(0, 0);
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    };
    await page.goto('/e2e/organizer-crm.html');
    await expect(page.getByTestId('crm-week-events')).toBeVisible();
    if (width >= 1024) {
      const agenda = await page.locator('.crm-today-agenda').boundingBox();
      const week = await page.locator('.crm-today-week').boundingBox();
      expect(Math.abs(week.y-agenda.y)).toBeLessThan(2);
      expect(agenda.width).toBeGreaterThan(week.width*1.5);
    }
    await shot('crm-upcoming');
    await page.goto('/e2e/organizer-crm.html?scenario=active');
    await expect(page.getByTestId('crm-today-evening-card')).toBeVisible();
    await shot('crm-active');
    await page.goto('/e2e/player-cabinet.html');
    await expect(page.getByTestId('player-home-next')).toBeVisible();
    await expect(page.getByTestId('player-home-news')).toBeVisible();
    if (width >= 1024) {
      const body = await page.locator('.player-home-layout').boundingBox();
      expect(body.width).toBeGreaterThan(900);
      const primary = await page.locator('.player-home-primary').boundingBox();
      const secondary = await page.locator('.player-home-secondary').boundingBox();
      expect(Math.abs(primary.y-secondary.y)).toBeLessThan(2);
      expect(primary.x+primary.width).toBeLessThan(secondary.x);
    }
    await shot('player-home');
    await page.getByRole('button', { name: 'Мои игры', exact: true }).scrollIntoViewIfNeeded();
    await shot('player-home-bottom');
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    await nav.getByRole('button', { name: 'Вечера', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Календарь', exact: true })).toBeVisible();
    await shot('evenings-list');
    await page.getByRole('button', { name: 'Календарь', exact: true }).click();
    await expect(page.locator('.player-event-calendar')).toBeVisible();
    await shot('evenings-calendar');
    for (const name of ['Прошедшие', 'Мои игры']) {
      await page.getByLabel('Разделы вечеров').getByRole('button', { name, exact: true }).click();
      await shot(`evenings-${name}`);
    }
    await nav.getByRole('button', { name: 'Сообщество', exact: true }).click();
    await expect(page.getByTestId('rating-self-row')).toBeVisible();
    await shot('community-rating');
    for (const name of ['Сезон', 'Турниры']) {
      await page.getByLabel('Разделы рейтинга').getByRole('button', { name, exact: true }).click();
      await shot(`rating-${name}`);
    }
    for (const name of ['Игроки', 'Связи']) {
      await page.getByLabel('Разделы сообщества').getByRole('button', { name, exact: true }).click();
      if (name === 'Игроки') await expect(page.getByTestId('club-directory').getByRole('button')).toHaveCount(10);
      if (name === 'Связи') await expect(page.getByTestId('club-rivals')).toBeVisible();
      await shot(`community-${name}`);
      if (name === 'Связи') {
        const duos = page.getByTestId('club-duos');
        await expect(duos.getByText('Александра с длинным никнеймом', { exact: true })).toBeVisible();
        await expect(duos.getByText('Рано делать выводы о силе связки.', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: 'Самые сыгранные', exact: true }).click();
        await expect(duos.getByText('Ночной игрок', { exact: true })).toBeVisible();
        await shot('connections-most-played');
        await page.getByTestId('club-recent').scrollIntoViewIfNeeded();
        await expect(page.getByText('Клубный вечер 2 октября', { exact: false })).toBeVisible();
        await shot('connections-recent');
        await page.getByTestId('club-teammates').scrollIntoViewIfNeeded();
        await shot('connections-personal');
      }
    }
    await page.getByLabel('Разделы сообщества').getByRole('button', { name: 'Активность', exact: true }).click();
    for (const name of ['Форма', 'Матчи', 'Сезон', 'Архив']) {
      await page.getByLabel('Разделы активности').getByRole('button', { name, exact: true }).click();
      await shot(`activity-${name}`);
    }
    await page.getByTestId('player-quick-wallet').click();
    await expect(page.getByRole('navigation', { name: 'Разделы кошелька' })).toBeVisible();
    for (const name of ['Оплата', 'Магазин', 'Ставки', 'История']) {
      await page.getByRole('navigation', { name: 'Разделы кошелька' }).getByRole('button', { name: new RegExp(`${name}$`) }).click();
      if (name === 'Оплата') {
        await expect(page.getByText('По игровым вечерам', { exact: true })).toHaveCount(0);
        await expect(page.getByText('оплачено всего', { exact: true })).toBeVisible();
      }
      await shot(`wallet-${name}`);
    }
    await page.getByTestId('player-quick-settings').click();
    await expect(page.getByTestId('player-settings')).toBeVisible();
    await shot('player-settings');
    await page.getByTestId('profile-save').scrollIntoViewIfNeeded();
    await shot('player-settings-save');
    await page.getByText('Моя музыка для вечера', { exact: true }).click();
    await expect(page.getByPlaceholder('Ссылка на трек Яндекс Музыки')).toHaveCount(2);
    await shot('player-settings-music');
    const lastMusicAction = page.getByRole('button', { name: 'Добавить', exact: true }).last();
    await lastMusicAction.scrollIntoViewIfNeeded();
    const musicBox = await lastMusicAction.boundingBox();
    const navBox = await nav.boundingBox();
    expect(musicBox.y + musicBox.height).toBeLessThanOrEqual(navBox.y);
    await shot('player-settings-music-bottom');
  });
}
