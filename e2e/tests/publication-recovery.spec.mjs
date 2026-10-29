import { expect,test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';
for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]]) {
  test(`public publication reconciliation ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await page.goto('/e2e/publication-recovery.html');
    const queue=page.getByTestId('publication-recovery');await expect(queue).toBeVisible();
    const audit=async(label)=>{await page.waitForTimeout(200);expect(await page.evaluate(auditScreen),label).toEqual([]);};
    await audit('held queue');await page.screenshot({path:info.outputPath(`after-${width}.png`),fullPage:true});
    await queue.getByRole('button',{name:'Пост вышел',exact:true}).first().click();
    await queue.getByRole('textbox',{name:'Ссылка или ID поста'}).fill('https://t.me/club/100');
    await audit('accept confirmation');await queue.getByRole('button',{name:'Подтвердить: пост вышел'}).click();
    await expect(queue.getByRole('button',{name:'Пост вышел',exact:true})).toHaveCount(1);
    await queue.getByRole('button',{name:'Проверил: поста нет',exact:true}).click();await audit('absence confirmation');
    expect(await page.evaluate(()=>window.__publicationDecisions)).toHaveLength(1);
    await page.screenshot({path:info.outputPath(`confirmation-${width}.png`),fullPage:true});
    await queue.getByRole('button',{name:'Проверил: поста нет — разрешить повтор',exact:true}).click();
    await expect(queue.locator('article')).toHaveCount(0);
    const decisions=await page.evaluate(()=>window.__publicationDecisions);
    expect(decisions.map(item=>item.decision)).toEqual(['accepted','absent']);expect(decisions[1].confirmed).toBe(true);await audit('resolved queue');
  });
}
