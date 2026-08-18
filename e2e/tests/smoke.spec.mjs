import { expect, test } from '@playwright/test';

test('health endpoint and organizer entry render safely on mobile', async ({ page, request }) => {
  const pageErrors = [];
  const browserErrors = [];
  const unauthorizedPaths = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() !== 401) return;
    try {
      unauthorizedPaths.push(new URL(response.url()).pathname);
    } catch {
      unauthorizedPaths.push(response.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Chromium reports a generic console error for expected 401 network probes.
    // Exact unauthorized endpoints are asserted separately below, so unexpected
    // 401s still fail this smoke test instead of being silently ignored.
    const isUnauthorizedResourceNoise =
      text.includes('Failed to load resource') && text.includes('401 (Unauthorized)');
    if (!isUnauthorizedResourceNoise) browserErrors.push(text);
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
  const uniqueUnauthorizedPaths = [...new Set(unauthorizedPaths)].sort();
  console.log(`[e2e] /admin status=${navigation?.status()} body=${JSON.stringify(bodyText)}`);
  if (pageErrors.length) console.log(`[e2e] page errors=${JSON.stringify(pageErrors)}`);
  if (browserErrors.length) console.log(`[e2e] console errors=${JSON.stringify(browserErrors)}`);
  if (uniqueUnauthorizedPaths.length) console.log(`[e2e] unauthorized paths=${JSON.stringify(uniqueUnauthorizedPaths)}`);

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
  expect(uniqueUnauthorizedPaths).toEqual(['/api/player/judge-music']);
});
