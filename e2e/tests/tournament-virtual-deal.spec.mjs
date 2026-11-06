import {test,expect} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';
for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]])test(`tournament virtual roles ${width}x${height}`,async({page})=>{
  test.setTimeout(60_000);
  await page.addInitScript(()=>sessionStorage.setItem('role_deal_card_seconds','0'));
  await page.setViewportSize({width,height});await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();const deal=page.getByTestId('virtual-role-deal');
  await deal.getByRole('button',{name:'Начать раздачу'}).click();await deal.getByTestId('virtual-deal-go').click();
  expect(await page.evaluate(auditScreen)).toEqual([]);
  for(let i=0;i<10;i++){
    // Owner, 2026-11-03: a tapped card shows its role; «Следующий игрок» passes the turn.
    await deal.getByRole('button',{name:/^Карта №/}).first().click();await deal.getByTestId('virtual-deal-next-player').click();
  }
  // The last card saves the roles by itself (owner, 2026-11-03).
  await expect(deal).toHaveCount(0);
  const roles=await page.evaluate(()=>window.__savedVirtualRoles);expect(roles).toHaveLength(10);
  expect(roles.filter(r=>r.role==='mafia')).toHaveLength(2);expect(roles.filter(r=>r.role==='don')).toHaveLength(1);expect(roles.filter(r=>r.role==='sheriff')).toHaveLength(1);expect(roles.filter(r=>r.role==='citizen')).toHaveLength(6);
  await page.getByRole('button',{name:'Запустить Игру 🚀',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mafia_live_session')||'null')?.phase)).toBe('zero_night');
  const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('mafia_live_session')).activePlayers.map(p=>({seat_number:p.slot_num,role:p.role})));
  expect(actual).toEqual(roles.slice().sort((a,b)=>a.seat_number-b.seat_number));
});

test('tournament draw resumes after reload without duplicating a role or resetting confirmed cards', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '0'));
  await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();
  const deal = page.getByTestId('virtual-role-deal');
  await expect(deal.getByTestId('virtual-deal-buy-role')).toHaveCount(0);
  await deal.getByRole('button', { name: 'Начать раздачу' }).click();
  await deal.getByTestId('virtual-deal-go').click();
  for (let n = 0; n < 3; n++) {
    await deal.getByRole('button', { name: /^Карта №/ }).first().click();
    await deal.getByTestId('virtual-deal-next-player').click();
  }
  await expect(deal).toContainText('Выдано 3 из 10');
  const key = 'mafia_tournament_virtual_deal:tournament-e2e:game-e2e';
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(before.history).toHaveLength(3);
  expect(before.deck).toHaveLength(7);
  await page.reload();
  await expect(deal).toBeVisible();
  await expect(deal).toContainText('Выдано 3 из 10');
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(after.history).toEqual(before.history);
  expect(after.deck).toEqual(before.deck);
  for (let n = 3; n < 10; n++) {
    await deal.getByRole('button', { name: /^Карта №/ }).first().click();
    await deal.getByTestId('virtual-deal-next-player').click();
  }
  await expect(deal).toHaveCount(0);
  const saved = await page.evaluate(() => window.__savedVirtualRoles);
  expect(saved).toHaveLength(10);
  expect(saved.filter((row) => row.role === 'mafia')).toHaveLength(2);
  expect(saved.filter((row) => row.role === 'don')).toHaveLength(1);
  expect(saved.filter((row) => row.role === 'sheriff')).toHaveLength(1);
  expect(saved.filter((row) => row.role === 'citizen')).toHaveLength(6);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test('tournament draw undo and full reset preserve deck integrity', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '0'));
  await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();
  const deal = page.getByTestId('virtual-role-deal');
  await deal.getByRole('button', { name: 'Начать раздачу' }).click();
  await deal.getByTestId('virtual-deal-go').click();
  for (let n = 0; n < 2; n++) {
    await deal.getByRole('button', { name: /^Карта №/ }).first().click();
    await deal.getByTestId('virtual-deal-next-player').click();
  }
  await expect(deal).toContainText('Выдано 2 из 10');
  await deal.getByRole('button', { name: 'Отменить последнюю карту' }).click();
  await expect(deal).toContainText('Выдано 1 из 10');
  await expect(deal.getByRole('button', { name: /^Карта №/ })).toHaveCount(9);
  await deal.getByRole('button', { name: 'Перераздать всё' }).click();
  await deal.getByRole('button', { name: 'Да, перераздать' }).click();
  await expect(deal).toContainText('Выдано 0 из 10');
  await expect(deal.getByRole('button', { name: /^Карта №/ })).toHaveCount(10);
});

test('tournament random timeout reveals a card without duplicating a turn', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '1'));
  await page.clock.install();
  await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();
  const deal = page.getByTestId('virtual-role-deal');
  await deal.getByRole('button', { name: 'Начать раздачу' }).click();
  await deal.getByTestId('virtual-deal-go').click();
  await expect(deal.getByTestId('virtual-deal-timer')).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(deal.getByTestId('virtual-deal-next-player')).toBeEnabled();
  await deal.getByTestId('virtual-deal-next-player').click();
  await expect(deal).toContainText('Выдано 1 из 10');
  const key = 'mafia_tournament_virtual_deal:tournament-e2e:game-e2e';
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.history).toHaveLength(1);
  expect(new Set(saved.history.map((item) => item.cardId)).size).toBe(1);
});

test('reloading after the role is revealed keeps that very card for confirmation', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '0'));
  await page.goto('/e2e/tournament-live-game.html?mode=deal');
  await page.getByTestId('tournament-start-virtual-deal').click();
  const deal = page.getByTestId('virtual-role-deal');
  await deal.getByRole('button', { name: 'Начать раздачу' }).click();
  await deal.getByTestId('virtual-deal-go').click();
  await deal.getByRole('button', { name: /^Карта №/ }).first().click();
  const roleBefore = await deal.locator('.deal-face').getAttribute('aria-label');
  const key = 'mafia_tournament_virtual_deal:tournament-e2e:game-e2e';
  const cardBefore = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).selectedId, key);
  await page.reload();
  await expect(deal).toBeVisible();
  await expect(deal.locator('.deal-face')).toHaveAttribute('aria-label', roleBefore);
  const cardAfter = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).selectedId, key);
  expect(cardAfter).toBe(cardBefore);
  await deal.getByTestId('virtual-deal-next-player').click();
  await expect(deal).toContainText('Выдано 1 из 10');
});
