import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width,height] of [[360,640],[390,844],[1366,768],[1440,900],[1920,1089]]) {
  test(`private VIP red rule at ${width}x${height}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height});
    const playerId='owner';
    let rule={id:'red',playerId,kind:'role',role:'citizen',otherPlayerId:null,percent:100,enabled:true};
    await page.route('**/api/players**',route=>route.fulfill({json:[{id:playerId,nickname:'Чагин'}]}));
    await page.route('**/api/admin/vip-probability-rules**',route=>{
      const url=route.request().url();
      if(url.endsWith('/game-quotas')) return route.fulfill({json:{quotas:[{playerId,wholeEvening:true,maxSuccessfulGames:null}]}});
      if(route.request().method()==='PUT') {rule={...rule,...route.request().postDataJSON()};return route.fulfill({json:rule});}
      return route.fulfill({json:{rules:[rule]}});
    });
    await page.goto('/e2e/evening-prices.html?vip=1');
    await expect(page.getByText('Чагин · Мне нравится играть на')).toBeVisible();
    await page.getByRole('button',{name:'Изменить',exact:true}).click();
    await expect(page.getByLabel('Условие',{exact:true})).toHaveValue('role');
    await expect(page.getByLabel('Роль')).toHaveCount(1);
    await expect(page.getByLabel('С кем',{exact:true})).toHaveCount(0);
    await page.getByRole('heading',{name:'Вероятности ролей и цвета'}).scrollIntoViewIfNeeded();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.getByRole('button',{name:'Сохранить изменения'}).scrollIntoViewIfNeeded();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`vip-red-${width}.png`),fullPage:true});
    await page.getByLabel('Шанс срабатывания').fill('0');
    await page.getByRole('button',{name:'Сохранить изменения'}).click();
    await expect(page.getByText('Мирный · 0% · Включено')).toBeVisible();
    expect(rule.percent).toBe(0);
  });
}
