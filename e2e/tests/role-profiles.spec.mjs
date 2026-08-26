import { expect, test } from '@playwright/test';

async function attachViewport(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function createProfile(page, role) {
  const response = await page.request.post('/api/auth/e2e/profile', { data: { role } });
  expect(response.ok(), `create ${role} profile`).toBe(true);
  const body = await response.json();
  expect(body.profile).toBe(role);
  expect(body.production_writes).toBe(false);
  return body;
}

test.describe('isolated organizer and player profiles', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('opens the real player cabinet with a deterministic test profile', async ({ page }, testInfo) => {
    await page.context().clearCookies();
    const profile = await createProfile(page, 'player');

    const session = await page.request.get('/api/auth/me');
    expect(session.ok()).toBe(true);
    const sessionBody = await session.json();
    expect(sessionBody.role).toBe('PLAYER');
    expect(sessionBody.linked).toBe(true);
    expect(sessionBody.player.id).toBe(profile.playerId);
    expect(sessionBody.player.nickname).toBe('[TEST] Игрок');

    await page.goto('/player');
    await expect(page.getByTestId('player-cabinet-shell')).toBeVisible();
    await expect(page.getByText('[TEST] Игрок', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('navigation').last()).toBeVisible();

    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
    await attachViewport(page, testInfo, 'role-profile-player.png');
  });

  test('opens the real organizer surface with a deterministic test profile', async ({ page }, testInfo) => {
    await page.context().clearCookies();
    await createProfile(page, 'organizer');

    const session = await page.request.get('/api/auth/me');
    expect(session.ok()).toBe(true);
    const sessionBody = await session.json();
    expect(sessionBody.role).toBe('ORGANIZER');
    expect(sessionBody.isOrganizer).toBe(true);

    await page.goto('/admin');
    await expect(page.locator('body')).not.toContainText('Не удалось войти');
    await expect(page.locator('body')).not.toContainText('Внутренняя ошибка');
    await expect(page.getByText('События', { exact: true }).first()).toBeVisible();

    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
    await attachViewport(page, testInfo, 'role-profile-organizer.png');
  });
});
