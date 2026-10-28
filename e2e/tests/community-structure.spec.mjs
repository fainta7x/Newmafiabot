import {expect,test} from '@playwright/test';
import {copyFileSync} from 'node:fs';
import {auditScreen} from './support/layoutAudit.mjs';
const before=process.env.COMMUNITY_CAPTURE==='before';
for(const[width,height]of [[360,640],[390,844],[1366,768],[1440,900]])test(`Community structure at ${width}x${height}`,async({page},info)=>{
 test.setTimeout(90000);await page.setViewportSize({width,height});
 const check=async(name,capture=false)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(auditScreen),{message:name}).toEqual([]);const file=info.outputPath(`${name}-${width}.png`);await page.screenshot({path:file,animations:'disabled'});if(capture&&width===390&&process.env.COMMUNITY_CAPTURE)copyFileSync(file,new URL(`../../docs/reviews/2026-10-28-community-rebuild/${before?'before':'after'}-${name}.png`,import.meta.url));};
 const go=async route=>{await page.goto('/e2e/player-cabinet.html?community=1&route='+encodeURIComponent(route));await page.waitForLoadState('networkidle');};
 const group=name=>page.getByLabel('Разделы сообщества').getByRole('button',{name,exact:true});
 await go('/player/club');await expect(page.getByTestId('club-directory')).toBeVisible();await check('players',true);
 if(!before){await page.getByLabel('Разделы игроков').getByRole('button',{name:'Показатели',exact:true}).click();await expect(page.getByLabel('Категория показателей')).toBeVisible();await check('metrics');await page.getByLabel('Категория показателей').selectOption('roles');await check('roles');}
 await go('/player/seasons/form');await expect(page.getByText('Форма игроков',{exact:true})).toBeVisible();await check('form-results');
 if(before){await page.getByText('Как считается форма',{exact:true}).scrollIntoViewIfNeeded();await check('form',true);}
 if(!before){await page.getByTestId('form-explanation').scrollIntoViewIfNeeded();await expect(page.getByTestId('form-explanation')).toContainText('115 баллов');await expect(page.getByTestId('form-explanation')).toContainText('97 баллов');await check('form',true);}
 await go('/player/rating/periods');
 if(!before){await expect(page.getByLabel('Выбрать сезон')).toHaveValue('demo-season');await expect(page.getByTestId('club-period-stats')).toContainText('Осень 2026');}
 await check('season',true);
 if(!before){await page.getByTestId('club-period-stats').scrollIntoViewIfNeeded();await check('period-stats');await page.getByLabel('Выбрать сезон').selectOption('demo-past');await expect(page.getByTestId('club-period-stats')).toContainText('Лето 2026');await expect(page.getByTestId('club-period-stats')).toContainText('2 победы из 4 игр');await check('past-period');await page.getByLabel('Выбрать сезон').selectOption('demo-novice');await expect(page.getByText('Школа мафии',{exact:true})).toBeVisible();await expect(page.getByTestId('club-period-stats')).toHaveCount(0);await check('novice-period');}
 await go('/player/club/connections');await expect(page.getByTestId('club-stories')).toBeVisible();await check('connections',true);
 if(!before){await page.getByText('Чёрные тройки',{exact:true}).scrollIntoViewIfNeeded();await check('trios');await page.getByText('Вместе за оба цвета',{exact:true}).scrollIntoViewIfNeeded();await check('both-colours');await page.getByLabel('Что показать').getByRole('button',{name:'Соперники',exact:true}).click();await expect(page.getByText('Вместе за оба цвета',{exact:true})).toHaveCount(0);await check('opponents');await page.getByLabel('Что показать').getByRole('button',{name:'За одним столом',exact:true}).click();await check('encounters');
 await group('История').click();await expect(page.getByLabel('Разделы истории')).toBeVisible();await check('evenings');await page.getByLabel('Разделы истории').getByRole('button',{name:'Зал славы',exact:true}).click();await expect(page.getByTestId('club-hall-of-fame')).toBeVisible();await expect(page.getByTestId('club-period-stats')).toHaveCount(0);await check('hall');
 await group('Мини-игры').click();await expect(page.getByTestId('player-club-poker')).toBeVisible();await check('minigames');
 await group('Игроки').click();await page.getByLabel('Разделы игроков').getByRole('button',{name:'Форма',exact:true}).click();await page.getByTestId('player-nav-home').click();await page.getByTestId('player-nav-community').click();await expect(page.getByLabel('Разделы игроков').getByRole('button',{name:'Форма',exact:true})).toHaveAttribute('aria-current','page');await check('return-to-form');
 await page.goto('/e2e/player-profile.html');await page.getByRole('button',{name:'Награды',exact:true}).click();await page.getByRole('button',{name:'Моя история',exact:true}).click();await expect(page.getByRole('heading',{name:'Моя история',exact:true})).toBeVisible();await check('my-history');
 await page.goto('/e2e/player-profile.html?target=friend');await page.getByRole('button',{name:'Награды',exact:true}).click();await page.getByRole('button',{name:'История игрока',exact:true}).click();await expect(page.getByRole('heading',{name:'История игрока',exact:true})).toBeVisible();await check('public-history');
 await page.goto('/e2e/player-cabinet.html?route=/player/rating/periods');await expect(page.getByTestId('club-period-stats')).toBeVisible();await expect(page.getByTestId('club-hall-of-fame')).toHaveCount(0);await check('no-sporting-season');}
});

for(const[width,height]of [[360,640],[390,844],[1366,768],[1440,900]])test(`Calendar statistics without a sporting season at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/e2e/player-cabinet.html?route=/player/rating/periods');
 const selector=page.getByRole('combobox',{name:'Период статистики клуба'});await expect(selector).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(auditScreen)).toEqual([]);
 await selector.selectOption('2026-summer');await expect(page.getByTestId('club-period-stats')).toContainText('Лето 2026');expect(await page.evaluate(auditScreen)).toEqual([]);
 await expect(page.getByTestId('club-hall-of-fame')).toHaveCount(0);
});
