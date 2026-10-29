import {test,expect} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';
for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]])test(`tournament virtual roles ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();const deal=page.getByTestId('virtual-role-deal');
  await deal.getByRole('button',{name:'Включить музыку и начать раздачу'}).click();
  const musicDecision=page.getByRole('button',{name:'Продолжить без музыки',exact:true});if(await musicDecision.isVisible())await musicDecision.click();
  expect(await page.evaluate(auditScreen)).toEqual([]);
  for(let i=0;i<10;i++){
    await deal.getByRole('button',{name:'Карта №1',exact:true}).click();await deal.getByRole('button',{name:'Открыть карту №1',exact:true}).click();await deal.getByRole('button',{name:'Подтвердить роль и продолжить'}).click();
  }
  await deal.getByRole('button',{name:'Сохранить роли и вернуться к игре'}).click();await expect(deal).toHaveCount(0);
  const roles=await page.evaluate(()=>window.__savedVirtualRoles);expect(roles).toHaveLength(10);
  expect(roles.filter(r=>r.role==='mafia')).toHaveLength(2);expect(roles.filter(r=>r.role==='don')).toHaveLength(1);expect(roles.filter(r=>r.role==='sheriff')).toHaveLength(1);expect(roles.filter(r=>r.role==='citizen')).toHaveLength(6);
});
