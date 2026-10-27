import {expect,test} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';

for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]]) {
  test(`Community and Progress content at ${width}x${height}`,async({page},info)=>{
    test.setTimeout(90_000);
    await page.setViewportSize({width,height});
    const check=async(name)=>{
      await page.evaluate(()=>document.fonts.ready);
      await expect.poll(()=>page.evaluate(auditScreen),{message:name}).toEqual([]);
      await page.screenshot({path:info.outputPath(`${name}-${width}.png`),animations:'disabled'});
    };
    await page.goto('/e2e/player-profile.html?content=1&history=1');
    await expect(page.getByTestId('player-result-observations')).toContainText('Предыдущие 10 игр');
    await expect(page.getByTestId('profile-key-stats')).toContainText('29 из 48');
    await check('overview');
    await page.getByRole('button',{name:/Моя аналитика/}).click();
    await page.getByTestId('player-result-observations').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('player-result-observations')).toContainText('За 30 дней: 8 побед из 13 игр');
    await check('observations');
    for(const [id,label] of [['decisions','Решения'],['night','Ночью'],['reveals','Вскрытия'],['exits','Круги ухода']]) {
      await page.getByRole('navigation',{name:'Разделы подробной статистики'}).getByRole('button',{name:label,exact:true}).click();
      await check(id);
    }
    await page.getByRole('button',{name:'Карьера',exact:true}).click();
    await page.getByRole('button',{name:'Роли',exact:true}).click();
    await expect(page.getByRole('region',{name:'Ролевая статистика'})).toContainText('8 побед из 12 игр');
    await expect(page.getByRole('list',{name:'Последние результаты в роли'})).toBeVisible();
    await check('roles');
    await page.getByRole('button',{name:'Elo',exact:true}).click();
    await page.locator('.elo-event-list button').first().click();
    await expect(page.getByText('Полный расчёт',{exact:true})).toBeVisible();
    await check('elo');
    await page.getByRole('button',{name:'Награды',exact:true}).click();
    await page.getByRole('button',{name:'Мои цели',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Цели этого пути'})).toBeVisible();
    await check('goals');
    await page.getByRole('button',{name:'Связи',exact:true}).click();
    await page.getByRole('button',{name:'Моя команда',exact:true}).click();
    await expect(page.getByTestId('my-team')).toContainText('В одной команде');
    await check('team');

    for(const [id,route] of [['metrics','/player/rating/metrics'],['form','/player/seasons/form'],['season','/player/seasons/season'],['archive','/player/seasons/history'],['learning','/player/profile/learning'],['tournaments','/player/rating/tournaments']]) {
      await page.goto('/e2e/player-cabinet.html?route='+encodeURIComponent(route));
      await page.waitForLoadState('networkidle');
      await check(id);
      if(id==='metrics') {
        await page.getByText('Как считается показатель',{exact:true}).click();
        await check('metric-definition');
        await page.getByText('Как считается показатель',{exact:true}).click();
        await page.getByRole('button',{name:'Показатель',exact:true}).click();
        await page.getByRole('option',{name:'Среднее место на турнирах федерации',exact:true}).click();
        await expect(page.getByTestId('metric-ratings-scope')).toContainText('Период и формат клуба не применяются');
        await expect(page.getByTestId('metric-ratings-scope')).not.toContainText('игр в выборе');
        await check('federation');
        await page.getByRole('button',{name:'По ролям',exact:true}).click();
        await expect(page.getByTestId('role-tables')).toContainText('Порядок по числу игр');
        await check('role-table');
      }
    }
    await page.goto('/e2e/gomafia-career.html');
    await page.waitForLoadState('networkidle');
    await check('gomafia');
  });
}
