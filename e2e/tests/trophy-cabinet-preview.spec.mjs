import { test, expect } from '@playwright/test';

for (const width of [360, 390, 960]) {
  test('interactive verified trophy cabinet keeps mobile/desktop profile layout at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 840 });
    await page.goto('/e2e/player-profile.html');
    await page.getByRole('button', { name: 'Награды', exact: true }).click();
    const cabinet = page.getByTestId('trophy-cabinet');
    await expect(cabinet).toBeVisible();
    await expect(page.getByTestId('cabinet-3d-stage')).toBeVisible();
    await expect(cabinet.getByTestId('cabinet-exhibit')).toHaveCount(1);
    const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(width);
    const stage = cabinet.getByTestId('cabinet-3d-stage');
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('trophy-cabinet-' + width + '.png'), fullPage: true });

    await cabinet.getByRole('button', { name: 'Повернуть витрину вправо' }).click();
    await expect(cabinet.locator('.trophy-cabinet__viewport')).toHaveAttribute('style', /8deg/);
    await cabinet.getByTestId('cabinet-exhibit').first().click();
    await expect(cabinet.getByTestId('cabinet-details')).toBeVisible();
    await expect(cabinet.getByTestId('cabinet-details')).toContainText('Лучший игрок вечера');
    await page.screenshot({ path: info.outputPath('trophy-cabinet-selected-' + width + '.png'), fullPage: true });

    await cabinet.getByRole('button', { name: 'Закрыть сведения' }).click();
    await cabinet.getByTestId('cabinet-filter-medals').click();
    await expect(cabinet.getByTestId('cabinet-empty')).toBeVisible();
    await cabinet.getByTestId('cabinet-filter-cups').click();
    await expect(cabinet.getByTestId('cabinet-exhibit')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}


test('two numbered tournament wins have different 2.5D models and drill into the real tournament screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/player-profile.html?trophies=2');
  await page.getByRole('button', { name: 'Награды', exact: true }).click();
  const cabinet = page.getByTestId('trophy-cabinet');
  await expect(cabinet.getByTestId('cabinet-exhibit')).toHaveCount(2);
  const modelLabels = await cabinet.locator('.trophy-cabinet__object--cup[role="img"]').evaluateAll(
    nodes => nodes.map(node => node.getAttribute('aria-label')),
  );
  expect(new Set(modelLabels).size).toBe(2);
  await cabinet.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('two-different-tournament-trophies-390.png'), fullPage: true });
  await cabinet.getByTestId('cabinet-exhibit').first().click();
  await expect(cabinet.getByTestId('cabinet-details')).toBeVisible();
  await cabinet.getByTestId('cabinet-open-tournament').click();
  await expect(page.getByTestId('cabinet-tournament-overlay')).toBeVisible();
  await expect(page.getByTestId('player-tournament-view')).toBeVisible();
  await expect(page.getByTestId('player-tournament-view')).toContainText('Турнир Богдана 2.09');
  await page.getByTestId('cabinet-tournament-overlay').getByRole('button', { name: 'Турниры' }).click();
  await expect(page.getByTestId('cabinet-tournament-overlay')).toHaveCount(0);
  await expect(cabinet.getByTestId('cabinet-details')).toBeVisible();
});
