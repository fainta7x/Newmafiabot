import { test, expect } from '@playwright/test';
for (const width of [360,390,1440]) {
  test(`achievement paths and action counters at ${width}px`, async ({page},testInfo) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/e2e/player-profile.html');
    await page.getByTestId('profile-more-stats').locator(':scope > summary').click();
    await page.getByTestId('game-action-metrics').locator('summary').click();
    await expect(page.getByText('Проверки доном',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByTestId('game-action-metrics').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`action-metrics-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Награды',exact:true}).click();
    const paths=page.getByTestId('achievement-paths');
    await expect(paths).toBeVisible();
    await expect(paths.getByRole('heading',{name:'Дело доведено'})).toBeVisible();
    await paths.scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`achievement-path-${width}.png`),fullPage:true});
    // All paths must render real definitions, including discrete role progress and the career path.
    await paths.locator('summary').filter({hasText:'Все истории'}).click();
    await expect(paths.getByText('Прогресс: 2 из 4',{exact:true})).toBeVisible();
    await expect(paths.getByText('Прогресс: 1 из 3',{exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`achievement-catalog-${width}.png`),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
