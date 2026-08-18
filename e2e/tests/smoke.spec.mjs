import { expect, test } from '@playwright/test';

test('health endpoint and organizer entry render safely on mobile', async ({ page, request }) => {
  const pageErrors = [];
  const browserErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const isExpectedUnauthorizedResourceError =
      text.includes('Failed to load resource') && text.includes('401 (Unauthorized)');
    if (!isExpectedUnauthorizedResourceError) browserErrors.push(text);
  });

  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: 'ok' });

  const navigation = await page.goto('/admin');
  expect(navigation?.ok()).toBeTruthy();

  // Keep a small, durable diagnostic snapshot in CI so a browser smoke failure
  // identifies whether the SPA failed to load, crashed, or rendered the wrong state.
  await page.waitForTimeout(500);
  const bodyText = (await page.locator('body').innerText()).trim().slice(0, 1200);
  console.log(`[e2e] /admin status=${navigation?.status()} body=${JSON.stringify(bodyText)}`);
  if (pageErrors.length) console.log(`[e2e] page errors=${JSON.stringify(pageErrors)}`);
  if (browserErrors.length) console.log(`[e2e] console errors=${JSON.stringify(browserErrors)}`);

  await expect(page.getByRole('heading', { name: 'Вход для организатора' })).toBeVisible();
  const passwordInput = page.getByPlaceholder('Пароль организатора');
  await expect(passwordInput).toBeVisible();

  const loginForm = page.locator('form').filter({ has: passwordInput });
  await expect(loginForm.getByRole('button', { name: 'Войти' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(pageErrors).toEqual([]);
  expect(browserErrors).toEqual([]);
});
