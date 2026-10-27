import {expect,test} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';
for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]]){
 test(`Community and Progress menus keep labels and context at ${width}px`,async({page},info)=>{
  test.setTimeout(60000);await page.setViewportSize({width,height});const report=[];
  const check=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});const findings=await page.evaluate(auditScreen);report.push(...findings.map(x=>`${name}: ${x}`));await page.screenshot({path:info.outputPath(`${name}-${width}.png`),animations:'disabled'});};
  await page.goto('/e2e/player-cabinet.html?route=/player/club/connections');await page.getByTestId('club-stories').waitFor();
  for(const label of ['Команды','Соперники','Знакомства','Пары']){await page.getByLabel('Что показать').getByRole('button',{name:label,exact:true}).click();await check(`club-${label}`);}
  await page.reload();await expect(page.getByTestId('club-duos')).toBeVisible();
  await page.goto('/e2e/player-profile.html?history=1');await page.getByTestId('profile-key-stats').waitFor();await check('profile-overview');
  await page.getByRole('button',{name:'Решения',exact:true}).click();await expect.poll(()=>page.locator('.profile-content').evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  if(width>=1024)expect((await page.getByTestId('profile-more-stats').boundingBox()).width).toBeGreaterThan((await page.locator('.profile-content').boundingBox()).width-90);
  await check('profile-statistics-scrolled');
  await page.getByRole('button',{name:'Карьера',exact:true}).click();await page.getByRole('button',{name:'Роли',exact:true}).click();await expect(page.getByText('Загрузка…',{exact:true})).toHaveCount(0);await check('profile-roles');
  await page.getByRole('button',{name:'Награды',exact:true}).click();await page.getByTestId('premium-profile-showcase').waitFor();await check('profile-awards');
  await page.getByRole('button',{name:'Мои цели',exact:true}).click();await page.getByTestId('achievement-paths').waitFor();await check('profile-goals');
  await page.getByRole('button',{name:'История клуба',exact:true}).click();await check('profile-history');
  await page.getByRole('button',{name:'Связи',exact:true}).click();await page.getByRole('searchbox',{name:'Найти среди связей'}).waitFor();await check('profile-players');
  await page.getByRole('button',{name:'Моя команда',exact:true}).click();await page.getByTestId('my-team').waitFor();await check('profile-team');
  await page.getByRole('button',{name:/^Приглашения/}).click();await page.getByTestId('smart-friend-invite-suggestions').waitFor();await check('profile-invites');
  await page.getByRole('button',{name:'Карьера',exact:true}).click();await expect(page.getByRole('button',{name:'Роли',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'Награды',exact:true}).click();await expect(page.getByRole('button',{name:'История клуба',exact:true})).toHaveAttribute('aria-current','page');
  await info.attach('layout-report.txt',{body:report.join('\n')||'clean',contentType:'text/plain'});console.log(`${width}px layout report:`,report);expect(report).toEqual([]);
 });
}

test('Community scroll viewport follows a shorter Telegram viewport',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/e2e/player-cabinet.html?route=/player/club/connections');
 await page.getByTestId('club-stories').waitFor();
 await page.evaluate(()=>document.documentElement.style.setProperty('--tg-viewport-stable-height','844px'));
 await page.setViewportSize({width:390,height:500});
 await page.getByLabel('Что показать').getByRole('button',{name:'Пары',exact:true}).click();
 const surface=await page.getByTestId('player-community-hub').boundingBox();
 const nav=await page.getByTestId('player-bottom-nav').boundingBox();
 expect(surface.y+surface.height).toBeLessThanOrEqual(nav.y+1);
 expect(await page.evaluate(auditScreen)).toEqual([]);
 await page.screenshot({path:info.outputPath('shorter-viewport.png'),animations:'disabled'});
});
