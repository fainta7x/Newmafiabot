import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// Every screen of a live game, phone and desktop (owner, 2026-10-27: «текст на тексте», «ПЕРЕ…»): no text sits on other
// text, no label is cut to «…», nothing leaves its box or the screen, and no button is covered.
// LIVE_TEXT_AUDIT_REPORT=1 prints every finding instead of failing on the first screen.

const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];
// Phones run twice: in the app's font and in a wider one (DejaVu Sans with a little letter spacing), so a label that only
// just fits does not pass — fonts differ between phones, and CI's Chrome renders wider than a local Chromium.
const VIEWPORTS = [[360, 640, false], [390, 844, false], [1366, 768, false], [1440, 900, false], [360, 640, true], [390, 844, true]];

const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };

for (const [width, height, wideFont] of VIEWPORTS) {
  test(`live game text audit at ${width}x${height}${wideFont ? ' in a wide font' : ''}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    const report = [];
    let shot = 0;
    const check = async (screen) => {
      await page.waitForTimeout(250);
      const found = await page.evaluate(auditScreen);
      shot += 1;
      await page.screenshot({ path: info.outputPath(`${String(shot).padStart(2, '0')}-${screen}.png`) });
      for (const issue of found) report.push(`${screen}: ${issue}`);
    };
    const speech = async (slot, nominee) => {
      await page.getByRole('button', { name: new RegExp(`Речь #${slot}(?:\\s| ·|$)`) }).last().click();
      if (nominee) {
        await seatCard(page, nominee).click();
        await page.locator('div[class*="z-[112]"]').getByRole('button', { name: 'Выставить', exact: true }).click();
      }
      await page.getByRole('button', { name: new RegExp(`Завершить речь #${slot}`) }).click();
    };

    try {
      if (wideFont) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = ':root{--font-sans:"DejaVu Sans",sans-serif}html,body{font-family:"DejaVu Sans",sans-serif}*{letter-spacing:.04em!important}'; document.head.appendChild(style); }));
      await page.goto('/e2e/live-game.html');
      await check('roster');
      await page.getByRole('button', { name: 'Подтвердить состав' }).click();
      await page.getByTestId('zero-round-rule').getByRole('radio', { name: 'Турнирная' }).click();
      await check('setup');
      await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
      await check('deal-music');
      await page.getByRole('button', { name: /Включить музыку и начать раздачу/ }).click();
      await check('role-deal');
      for (const [index, role] of ROLE_SEQUENCE.entries()) {
        await page.getByRole('button', { name: new RegExp(role) }).click();
        if (index === 4) await check('role-deal-half');
      }
      await check('role-deal-done');
      await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
      await check('zero-night');
      await page.getByRole('button', { name: /Включите музыку/ }).click();
      await check('zero-night-music');
      await page.getByRole('button', { name: /Договорка · 75с/ }).click();
      await check('zero-night-agreement');
      await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
      await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
      await page.getByRole('button', { name: /Выключите музыку/ }).click();
      await check('zero-night-end');
      await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
      await check('zero-round');
      await page.getByRole('button', { name: /Речь #1(?:\s| ·|$)/ }).last().click();
      await check('speech-active');
      await seatCard(page, 2).click();
      await check('player-action');
      await page.locator('div[class*="z-[112]"]').getByRole('button', { name: 'Выставить', exact: true }).click();
      await check('speech-nominated');
      await page.getByRole('button', { name: /Завершить речь #1/ }).click();
      await speech(2, 3);
      for (let slot = 3; slot <= 10; slot += 1) await speech(slot);
      await check('speeches-done');
      await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
      await check('voting-announcement');
      await page.getByRole('button', { name: 'Начать голосование', exact: true }).click();
      for (const voter of [1, 2, 3, 4, 5, 6]) await seatCard(page, voter).click();
      await check('vote-count');
      await page.getByRole('button', { name: 'Цифрами', exact: true }).click();
      await check('vote-numbers');
      await page.getByRole('button', { name: 'Карточками за столом', exact: true }).click();
      await page.getByRole('button', { name: /Следующий/ }).click();
      await check('vote-count-last');
      await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
      await check('voting-result');
      await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
      await check('best-move');
      for (const seat of [1, 4, 8]) await page.locator('div[class*="z-[120]"]').getByRole('button', { name: String(seat), exact: true }).click();
      await page.getByRole('button', { name: 'Подтвердить лучший ход', exact: true }).click();
      await check('last-speech');
      await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();
      await check('night');
      await clickOptional(page.getByRole('button', { name: /Включите музыку/ }));
      await page.getByRole('button', { name: 'Отстрел', exact: true }).click();
      await seatCard(page, 1).click();
      await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
      await seatCard(page, 4).click();
      await page.getByRole('button', { name: 'Проверка Шерифа', exact: true }).click();
      await seatCard(page, 6).click();
      await check('night-checks');
      await clickOptional(page.getByRole('button', { name: /Выключите музыку/ }));
      await page.getByRole('button', { name: 'ЛХ первого убитого', exact: true }).click();
      await check('night-best-move');
      for (const seat of [2, 6, 8]) await page.locator('div[class*="z-[120]"]').getByRole('button', { name: String(seat), exact: true }).click();
      await page.getByRole('button', { name: 'Подтвердить лучший ход', exact: true }).click();
      await page.getByRole('button', { name: 'Зафиксировать ночь', exact: true }).click();
      await check('killed-last-speech');
      await page.getByRole('button', { name: /Протокол убитого · \d+с/ }).click();
      await check('death-protocol');
      await page.getByRole('button', { name: 'Сохранить → день', exact: true }).click();
      await check('day-1');
      await page.getByRole('button', { name: /Речь #3(?:\s| ·|$)/ }).last().click();
      await check('day-1-speech');
    } finally {
      await info.attach('report.txt', { body: report.join('\n') || 'clean', contentType: 'text/plain' });
      if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height}${wideFont ? '-wide' : ''} ===\n${report.join('\n') || 'clean'}`);
    }
    expect(report).toEqual([]);
  });
}

// The approved alternative deal must pass the same four-size gate as physical dealing.
for (const [width,height,wideFont] of VIEWPORTS) {
  test(`virtual role deal text audit at ${width}x${height}${wideFont?' wide':''}`,async({page},info)=>{
    test.setTimeout(60_000); // Ten reveals/confirmations, manual seat choice, screenshots and the music notice, like the physical audit's bounded budget.
    await page.setViewportSize({width,height});
    if(wideFont)await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='*{font-family:"DejaVu Sans",sans-serif!important;letter-spacing:.04em!important}';document.head.appendChild(style);}));
    const check=async label=>{await page.waitForTimeout(200);expect(await page.evaluate(auditScreen),label).toEqual([]);};
    await page.goto('/e2e/live-game.html');await page.getByRole('button',{name:'Подтвердить состав'}).click();
    await check('choose dealing method');
    await page.screenshot({path:info.outputPath('setup.png')});
    await page.getByTestId('club-game-start-virtual-deal').click();const deal=page.getByTestId('virtual-role-deal');
    await check('virtual music');await deal.getByRole('button',{name:'Включить музыку и начать раздачу'}).click();
    const musicDecision=page.getByRole('button',{name:'Продолжить без музыки',exact:true});
    await expect.poll(async()=>await musicDecision.isVisible()||await page.getByTestId('judge-music-player').isVisible()||await page.getByText(/Музыки для вечера нет — продолжаем/).isVisible()).toBe(true);
    if(await musicDecision.isVisible()){await check('music decision');await musicDecision.click();}
    await check('horizontal deck');
    await expect(deal.getByRole('button',{name:/№7 Игрок 7/})).toBeVisible();
    await deal.getByRole('button',{name:/№7 Игрок 7/}).click();
    await expect(deal.getByText('Выбирает: №7 Игрок 7',{exact:true})).toBeVisible();
    const notice=page.getByText(/Музыки для вечера нет — продолжаем/);if(await notice.isVisible())await expect(notice).toBeHidden({timeout:6000});
    await page.screenshot({path:info.outputPath('virtual-deck.png')});
    const cards=deal.getByRole('button',{name:/^Карта №/});
    await cards.nth(4).click();await deal.getByRole('button',{name:'Открыть карту №5'}).click();await check('revealed role');
    await deal.getByRole('button',{name:'Подтвердить роль и продолжить'}).click();
    await deal.getByRole('button',{name:'Отменить последнюю карту'}).click();await expect(cards).toHaveCount(10);
    await deal.getByRole('button',{name:'Перераздать всё'}).click();await check('redeal confirmation');
    await deal.getByRole('button',{name:'Нет',exact:true}).click();
    for(let remaining=10;remaining>0;remaining--){
      await deal.getByRole('button',{name:'Карта №1',exact:true}).click();
      await deal.getByRole('button',{name:'Открыть карту №1',exact:true}).click();
      await deal.getByRole('button',{name:'Подтвердить роль и продолжить'}).click();
    }
    await check('complete virtual deal');await page.screenshot({path:info.outputPath('virtual-complete.png')});
    await deal.getByRole('button',{name:'Все роли выданы — начать игру'}).click();
    await expect(deal).toHaveCount(0);await expect(page.getByRole('button',{name:/Включите музыку/})).toBeVisible();await check('night after virtual deal');
  });
}
