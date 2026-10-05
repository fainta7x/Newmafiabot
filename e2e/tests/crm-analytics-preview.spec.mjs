import { test,expect } from '@playwright/test';

for(const width of [360,390]) test(`analytics all tabs at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:713});
  await page.goto('/e2e/crm-analytics.html');
  await expect(page.getByTestId('crm-analytics')).toBeVisible();
  await expect(page.getByText(/визитов — 62/)).toBeVisible();
  const analytics=page.getByTestId('crm-analytics');
  const scrollPage=(top)=>page.evaluate((to)=>{const c=document.querySelector('[data-testid="analytics-controls"]');for(let el=c&&c.parentElement;el;el=el.parentElement){if(el.scrollHeight>el.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(el).overflowY)){el.scrollTop=to;return;}}window.scrollTo(0,to);},top);
  await scrollPage(500);
  const controls=await page.getByTestId('analytics-controls').boundingBox();
  const header=await page.locator('.crm-premium-header').boundingBox();
  expect(controls.y).toBeGreaterThanOrEqual(header.y+header.height-1);
  expect(controls.y).toBeLessThanOrEqual(header.y+header.height+16);
  await scrollPage(0);
  for(const name of ['Клуб','Деньги','Сейчас','Игры и люди']) {
    await analytics.getByRole('tab',{name,exact:true}).click();
    await expect(analytics.getByRole('tabpanel')).toBeVisible();
    if(name==='Деньги') await expect(analytics.getByText('Поступило в период',{exact:true})).toBeVisible();
    if(name==='Игры и люди') await expect(analytics.getByText(/нет игр с журналом/)).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const targets=await analytics.locator('button:visible,select:visible,summary:visible').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
    expect(targets.every(height=>height>=43.5)).toBe(true);
    const small=await analytics.locator('p:visible,span:visible,h3:visible').evaluateAll(nodes=>nodes.filter(node=>parseFloat(getComputedStyle(node).fontSize)<12).map(node=>node.textContent));
    expect(small).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`analytics-${width}-${name}.png`),fullPage:true});
  }
  await analytics.getByRole('tab',{name:'Клуб',exact:true}).click();
  await analytics.getByRole('button',{name:'Как считаем: Визиты',exact:true}).click();
  const helpDialog=page.getByRole('dialog');
  await expect(helpDialog).toBeVisible();
  await expect(helpDialog).toHaveCSS('opacity','1');
  const box=await helpDialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath(`analytics-${width}-help.png`),fullPage:true});
});
