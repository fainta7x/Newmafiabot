import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360,640],[390,844],[1366,768],[1440,900]]) {
  test(`avatars keep detail and list geometry ${width}`, async ({page}, info) => {
    const nason = `data:image/jpeg;base64,${(await readFile(new URL('../../public/player-avatars/nason.jpg', import.meta.url))).toString('base64')}`;
    const dendi = `data:image/jpeg;base64,${(await readFile(new URL('../../public/player-avatars/dendi.jpg', import.meta.url))).toString('base64')}`;
    await page.addInitScript(photos => { window.avatarFixtures = photos; }, {nason,dendi});
    await page.setViewportSize({width,height});
    await page.goto('/e2e/player-avatar.html');
    const first = page.locator('img').first();
    await expect(first).toBeVisible();
    await expect.poll(()=>first.evaluate(img => img.naturalHeight)).toBe(48);
    expect(await first.evaluate(img=>img.getBoundingClientRect().width)).toBe(46); //48px outer frame,1px border each side
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({path:info.outputPath('avatar-quality.png'),fullPage:true});
    const sizes = await page.locator('section').nth(1).locator('img').evaluateAll(images => images.map(img=>Math.min(img.naturalWidth,img.naturalHeight)));
    expect(sizes).toEqual([28,36,48,64,80]);
  });
}
test('Retina avatars retain physical pixels', async ({browser})=>{
  const context = await browser.newContext({deviceScaleFactor:2,viewport:{width:390,height:844}});
  const page = await context.newPage();
  await page.goto('/e2e/player-avatar.html');
  await expect.poll(()=>page.locator('img').first().evaluate(img=>Math.min(img.naturalWidth,img.naturalHeight))).toBe(96);
  await context.close();
});
