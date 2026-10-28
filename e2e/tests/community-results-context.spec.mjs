import {expect,test} from '@playwright/test';
import {writeFileSync,copyFileSync} from 'node:fs';
import {auditScreen} from './support/layoutAudit.mjs';
const before=process.env.RESULTS_CAPTURE==='before';
for(const[width,height]of [[360,640],[390,844],[1366,768],[1440,900]])test(`Results context at ${width}x${height}`,async({page},info)=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height});
  const check=async(name,capture=false)=>{
    await page.evaluate(()=>document.fonts.ready);
    const findings=await page.evaluate(auditScreen);
    if(!before)expect(findings,name).toEqual([]);
    else writeFileSync(info.outputPath(`${name}-findings.json`),JSON.stringify(findings,null,2));
    const path=info.outputPath(`${name}-${width}.png`);await page.screenshot({path,animations:'disabled'});
    if(capture&&width===390&&process.env.RESULTS_CAPTURE)copyFileSync(path,new URL(`../../docs/reviews/2026-10-28-results-context/${before?'before':'after'}-${name}.png`,import.meta.url));
  };
  await page.goto('/e2e/player-profile.html?results-context=1');
  await page.getByRole('button',{name:'Карьера',exact:true}).click();
  await page.getByRole('button',{name:'Elo',exact:true}).click();
  await page.getByLabel('Формат вечера',{exact:true}).selectOption('RATING');
  await expect(page.locator('.profile-elo')).toContainText('Рейтинговый');
  if(!before){await expect(page.getByTestId('elo-chart-endpoints')).toContainText('1550');await expect(page.getByTestId('elo-chart-endpoints')).toContainText('1500');await expect(page.getByTestId('elo-history-count')).toHaveText('Показано: 8 из 9 · сначала новые');}
  await page.locator('.profile-elo-content > section').first().scrollIntoViewIfNeeded();await check('elo',true);
  const event=page.locator('.elo-event-list > div').filter({hasText:'№4'}).getByRole('button').first();await event.click();
  if(!before){await expect(event).toContainText('Поражение');await expect(event).toContainText('+5');}
  await check('elo-outcome');
  await page.getByRole('button',{name:'Все 9',exact:true}).click();
  if(!before)await expect(page.getByTestId('elo-history-count')).toHaveText('Показано: 9 из 9 · сначала новые');
  await check('elo-all');
  await page.getByRole('button',{name:'Игры',exact:true}).click();
  if(!before)await expect(page.getByTestId('profile-game-range')).toHaveText('Игры 1–15 из 18 · сначала новые');
  await page.getByText('Дополнительные фильтры',{exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await check('games',true);
  await page.getByRole('button',{name:'Дальше',exact:true}).click();
  await expect(page.locator('.profile-game-list > article')).toHaveCount(3);
  if(!before)await expect(page.getByTestId('profile-game-range')).toHaveText('Игры 16–18 из 18 · сначала новые');
  await check('games-page-2');
  await page.getByText('Дополнительные фильтры',{exact:true}).click();
  await page.getByLabel('Роль',{exact:true}).selectOption('mafia');
  await expect(page.locator('.profile-game-list > article')).toHaveCount(0);
  if(!before)await expect(page.getByTestId('profile-game-range')).toHaveText('Найдено игр: 0');
  await check('games-empty');
  await page.goto('/e2e/player-cabinet.html?results-context=1&route='+encodeURIComponent('/player/seasons/history'));
  await expect(page.getByText('Прошлые сезоны',{exact:true})).toBeVisible();
  if(!before)await expect(page.getByRole('region',{name:'Мой результат в сезоне'})).toContainText('8 побед из 12 игр');
  await check('archive',true);
  await page.getByRole('button',{name:/Весна 2026/}).click();
  if(!before){await expect(page.getByRole('region',{name:'Мой результат в сезоне'})).toContainText('Место не указано');await expect(page.getByRole('region',{name:'Мой результат в сезоне'})).toContainText('2 победы из 3 игр');}
  await check('archive-unranked');
  await page.getByRole('navigation',{name:'Разделы активности'}).getByRole('button',{name:'Сезон',exact:true}).click();
  if(!before)await expect(page.getByText('Показаны места 1–5. Участников в сезоне: 21.',{exact:true})).toBeVisible();
  await check('current-season');
  await page.getByRole('button',{name:before?'Показать всех · 10':'Показать места 6–10',exact:true}).click();
  if(!before)await expect(page.getByText('Показаны места 1–10. Участников в сезоне: 21.',{exact:true})).toBeVisible();
  await check('current-season-more');
});
