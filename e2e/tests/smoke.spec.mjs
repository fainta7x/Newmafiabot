import { expect, test } from '@playwright/test';

test('health endpoint and organizer entry render safely on mobile', async ({ page, request }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: 'ok' });

  await page.goto('/admin');

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
});
