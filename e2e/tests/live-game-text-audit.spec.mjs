import { expect, test } from '@playwright/test';
import { auditScreen, auditSeatZones } from './support/layoutAudit.mjs';

// Every screen of a live game, phone and desktop (owner, 2026-10-27: «текст на тексте», «ПЕРЕ…»): no text sits on other
// text, no label is cut to «…», nothing leaves its box or the screen, and no button is covered.
// LIVE_TEXT_AUDIT_REPORT=1 prints every finding instead of failing on the first screen.

const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];
// Phones run twice: in the app's font and in a wider one (DejaVu Sans with a little letter spacing), so a label that only
// just fits does not pass — fonts differ between phones, and CI's Chrome renders wider than a local Chromium.
const VIEWPORTS = [[360, 640, false], [390, 844, false], [1366, 768, false], [1440, 900, false], [1920, 1089, false], [360, 640, true], [390, 844, true]];

const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };

for (const [width, height, wideFont] of VIEWPORTS) {
  test(`live game text audit at ${width}x${height}${wideFont ? ' in a wide font' : ''}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    const report = [];
    let shot = 0;
    let layerBaseline = null;
    const check = async (screen) => {
      await page.waitForTimeout(250);
      const found = await page.evaluate(auditScreen);
      shot += 1;
      await page.screenshot({ path: info.outputPath(`${String(shot).padStart(2, '0')}-${screen}.png`) });
      for (const issue of found) report.push(`${screen}: ${issue}`);
      // The avatars and nicknames are a separate layer over the board: it must stay on its cards (a banner or panel above the
      // board once pushed the board down and left the layer behind).
      const drift = await page.evaluate(() => {
        const layer = document.querySelector('.evening-live-identity-layer');
        if (!layer || getComputedStyle(layer).display === 'none') return null;
        const cards = [...document.querySelectorAll('.live-seat-card')].filter((card) => card.getBoundingClientRect().height > 40);
        if (!cards.length) return null;
        const cardsTop = Math.min(...cards.map((card) => card.getBoundingClientRect().top));
        return Math.round(layer.getBoundingClientRect().top - cardsTop);
      });
      // The layer's resting offset differs by layout (a few px on desktop), so the first reading is the baseline and a later
      // screen is flagged when the layer moves away from it.
      if (drift !== null) {
        if (layerBaseline === null) layerBaseline = drift;
        else if (Math.abs(drift - layerBaseline) > 6) report.push(`${screen}: the avatar layer moved ${drift - layerBaseline}px off the seat cards`);
      }
      // The parts of a seat card never intersect (owner, 2026-11-02).
      for (const issue of await page.evaluate(auditSeatZones)) report.push(`${screen}: ${issue}`);
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
      await page.getByTestId('physical-role-deal-start').click();
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
      // Fouls and the auto-mode switch (owner, 2026-10-31: layout broken with fouls and the auto-mode pop-up).
      await clickOptional(page.getByTestId('live-auto-toggle'));
      await check('auto-mode-on');
      // Auto mode would end speeches by itself in a slow run and skip the screens below: switch it off again.
      await clickOptional(page.getByTestId('live-auto-toggle'));
      for (const [slot, count] of [[1, 2], [3, 3]]) {
        for (let i = 0; i < count; i += 1) {
          await seatCard(page, slot).click();
          await page.getByTestId('live-player-add-regular-foul').click();
        }
      }
      await check('fouls-on-table');
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
      // «Цифрами» opens by itself, and it can be folded to reach the seat cards (owner, 2026-11-02).
      await check('vote-numbers-auto');
      await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
      for (const voter of [1, 2, 3, 4, 5, 6]) await seatCard(page, voter).click();
      await check('vote-count');
      // «Между кем попил?» takes the centre cell alone (stress walk, 2026-11-02).
      await page.getByTestId('live-quick-split').click();
      await check('quick-split-picker');
      await page.getByRole('button', { name: 'Отмена', exact: true }).click();
      await page.getByRole('button', { name: 'Цифрами', exact: true }).click();
      await check('vote-numbers');
      await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
      await page.getByRole('button', { name: /Следующий/ }).click();
      await check('vote-count-last');
      await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
      await check('voting-result');
      // «Сломал попил красным» (owner, 2026-11-01): the tag question and its picker of red seats.
      await check('voting-result-tag-button');
      await page.getByTestId('live-split-break-tag').click();
      await check('split-break-tag-picker');
      await page.getByRole('group', { name: 'Красный, сломавший попил' }).getByRole('button', { name: '#4', exact: true }).click();
      await check('split-break-tagged');
      await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
      await check('best-move');
      for (const seat of [1, 4, 8]) await page.locator('div[class*="z-[120]"]').getByRole('button', { name: String(seat), exact: true }).click();
      await page.getByRole('button', { name: 'Подтвердить лучший ход', exact: true }).click();
      await check('last-speech');
      await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();
      // The will of the player voted out (owner, 2026-11-01): the same red / black / sheriff marks as the death protocol.
      await check('voting-will');
      await page.getByRole('button', { name: 'Сохранить → дальше', exact: true }).click();
      await check('night');
      // The window «Текущее состояние игры» (stress walk, 2026-11-02: «Заголосован в нулевом круге» was cut to «…» on a phone).
      await page.locator('button[aria-label="Текущее состояние игры"]:visible').first().click();
      await check('state-sheet');
      await page.getByTitle('Закрыть', { exact: true }).click();
      await clickOptional(page.getByRole('button', { name: /Включите музыку/ }));
      await page.getByRole('button', { name: 'Отстрел', exact: true }).click();
      // Tall screens get the banner above the board; a short one (≤ 700 px) carries the stage in the central panel itself.
      if (height > 700) await expect(page.getByTestId('live-night-stage')).toBeVisible();
      else await expect(page.getByTestId('live-judge-hud')).toHaveAttribute('data-night-tone', 'shot');
      await check('night-shooting');
      // «Вы никого не выбрали» (owner, 2026-11-02): the next step with no target asks whether it was a miss and who missed.
      await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
      await expect(page.getByTestId('night-prompt')).toBeVisible();
      await check('night-prompt-miss');
      await page.getByTestId('night-miss-error').click();
      await check('night-prompt-miss-who');
      await expect(page.getByTestId('night-miss-save')).toBeDisabled();
      await page.locator('[data-testid^="night-miss-seat-"]').first().click();
      await expect(page.getByTestId('night-miss-save')).toBeEnabled();
      await page.getByTestId('night-prompt').getByRole('button', { name: 'Назад', exact: true }).click();
      await page.getByTestId('night-prompt-choose').click();
      await seatCard(page, 1).click();
      await check('night-shot-chosen');
      await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
      await check('night-don');
      await page.getByRole('button', { name: 'Проверка Шерифа', exact: true }).click();
      await expect(page.getByTestId('night-prompt')).toBeVisible();
      await check('night-prompt-don');
      await page.getByTestId('night-prompt-choose').click();
      await seatCard(page, 4).click();
      await check('night-don-chosen');
      await page.getByRole('button', { name: 'Проверка Шерифа', exact: true }).click();
      await check('night-sheriff');
      await clickOptional(page.getByRole('button', { name: /Выключите музыку/ }));
      await page.getByRole('button', { name: /ЛХ первого убитого|Итоги ночи/ }).click();
      await expect(page.getByTestId('night-prompt')).toBeVisible();
      await check('night-prompt-sheriff');
      await page.getByTestId('night-prompt-choose').click();
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
      // The judge timer with every button it can have at once: −10, +10, pause, reset, mute and «+30 за два фола»
      // (owner, 2026-11-02: the new «+10» must not break the row when the speech-extension button appears).
      await page.getByRole('button', { name: /Завершить речь #3/ }).click();
      await page.getByRole('button', { name: /Речь #4(?:\s| ·|$)/ }).last().click();
      await expect(page.getByTestId('live-hud-speech-extension')).toBeVisible();
      await check('day-1-speech-extension');
      await page.screenshot({ path: info.outputPath('day-1-speech-extension.png') });
      const row = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.live-judge-timer__buttons > *')];
        const box = document.querySelector('.live-judge-timer__buttons')?.getBoundingClientRect();
        return { cutOff: buttons.some((node) => { const r = node.getBoundingClientRect(); return r.width < 20 || !box || r.right > box.right + 1 || r.left < box.left - 1; }), count: buttons.length };
      });
      expect(row.cutOff, 'timer buttons row').toBe(false);
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
    test.setTimeout(120_000); // Ten reveals (each waits the 1 s card timer)/confirmations, manual seat choice, screenshots and the music notice, like the physical audit's bounded budget.
    await page.addInitScript(()=>sessionStorage.setItem('role_deal_card_seconds','1'));
    await page.setViewportSize({width,height});
    if(wideFont)await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='*{font-family:"DejaVu Sans",sans-serif!important;letter-spacing:.04em!important}';document.head.appendChild(style);}));
    const check=async label=>{await page.waitForTimeout(200);expect(await page.evaluate(auditScreen),label).toEqual([]);};
    const next=async()=>{const b=deal.getByTestId('virtual-deal-next-player');await expect(b).toBeEnabled({timeout:4000});await b.click();};
    await page.goto('/e2e/live-game.html');await page.getByRole('button',{name:'Подтвердить состав'}).click();
    await check('choose dealing method');
    await page.screenshot({path:info.outputPath('setup.png')});
    // Owner, 2026-11-03: the virtual deal is the main button on top.
    await page.getByTestId('club-game-start-role-deal').click();const deal=page.getByTestId('virtual-role-deal');
    await check('virtual music');
    await deal.getByTestId('virtual-deal-buy-role').click();await expect(deal.getByTestId('virtual-deal-buy-panel')).toBeVisible();await check('role purchase before the deal');await page.screenshot({path:info.outputPath('virtual-buy.png')});await deal.getByTestId('virtual-deal-buy-role').click();
    await deal.getByRole('button',{name:'Начать раздачу'}).click();
    // The first player's turn opens by itself.
    await expect(deal.getByTestId('virtual-deal-turn')).toContainText('№1 Игрок 1');await expect(deal.getByTestId('virtual-deal-timer')).toBeVisible();await check('card timer');
    await expect(deal.getByRole('button',{name:/№7 Игрок 7/})).toBeVisible();
    await deal.getByRole('button',{name:/№7 Игрок 7/}).click();
    await expect(deal.getByTestId('virtual-deal-turn')).toContainText('№7 Игрок 7');
    const notice=page.getByText(/Музыки для вечера нет — продолжаем/);if(await notice.isVisible())await expect(notice).toBeHidden({timeout:6000});
    await page.screenshot({path:info.outputPath('virtual-deck.png')});
    const cards=deal.getByRole('button',{name:/^Карта №/});
    // Owner, 2026-11-01: numbered cards in two rows and no scrolling on any screen.
    expect(await page.evaluate(()=>[...document.querySelectorAll('[data-testid="virtual-role-deal"], [data-testid="virtual-role-deal"] *')].filter(e=>e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>String(e.className).slice(0,40))),'virtual deal scrolls').toEqual([]);
    expect(await page.evaluate(()=>{const g=document.querySelector('[data-testid="virtual-card-grid"]');return g?g.scrollWidth<=g.clientWidth+1:false;}),'card row scrolls sideways').toBe(true);
    await cards.nth(4).click();await expect(deal.getByRole('status').first()).toBeVisible();await check('revealed role');await page.screenshot({path:info.outputPath('virtual-revealed.png')});
    expect(await page.evaluate(()=>[...document.querySelectorAll('[data-testid="virtual-role-deal"], [data-testid="virtual-role-deal"] *')].filter(e=>e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>String(e.className).slice(0,30)+' '+e.scrollHeight+'>'+e.clientHeight)),'virtual deal scrolls after the reveal').toEqual([]);
    await next();
    await deal.getByRole('button',{name:'Отменить последнюю карту'}).click();await expect(cards).toHaveCount(10);
    await deal.getByRole('button',{name:'Перераздать всё'}).click();await check('redeal confirmation');
    await deal.getByRole('button',{name:'Нет',exact:true}).click();
    for(let remaining=10;remaining>0;remaining--){
      await deal.getByRole('button',{name:/^Карта №/}).first().click();
      await next();
    }
    await check('complete virtual deal');await page.screenshot({path:info.outputPath('virtual-complete.png')});
    await deal.getByRole('button',{name:'Все роли выданы — начать игру'}).click();
    await expect(deal).toHaveCount(0);await expect(page.getByRole('button',{name:/Включите музыку/})).toBeVisible();await check('night after virtual deal');
  });
}
