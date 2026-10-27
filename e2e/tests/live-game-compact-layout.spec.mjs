import { expect, test } from '@playwright/test';

test('Live Game keeps compact proven mobile table geometry', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/e2e/live-game.html?mode=audit');
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

  const shell = page.locator('.evening-live-engine-shell');
  await expect(shell).toBeVisible();

  const center = page.locator('.live-judge-hud');
  await expect(center).toBeVisible();
  const centerBox = await center.boundingBox();
  expect(centerBox).not.toBeNull();
  expect(centerBox.width).toBeLessThan(340);

  await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
  await expect(page.locator('.live-seat-card[data-seat="10"]')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    giantPriorityLayer: Boolean(document.querySelector('.live-game-mobile-center-priority')),
  }));
  expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.giantPriorityLayer).toBe(false);

  await page.screenshot({ path: info.outputPath('live-game-compact-restored-360x800.png'), fullPage: false });
});

for (const viewport of [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1366, height: 768, name: '1366x768' },
]) {
  test(`Live Game desktop mirrors mobile board at ${viewport.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/e2e/live-game.html?mode=audit');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const center = page.locator('.live-judge-hud');
    await expect(center).toBeVisible();
    await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
    await expect(page.locator('.live-seat-card[data-seat="10"]')).toBeVisible();
    // The «Восстановить» click leaves the pointer over a seat, whose hover scale (1.01) shifts it by a pixel.
    await page.mouse.move(1, 1);

    const positions = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      };
      return {
        s9: box('.live-seat-card[data-seat="9"]'),
        s10: box('.live-seat-card[data-seat="10"]'),
        s1: box('.live-seat-card[data-seat="1"]'),
        s2: box('.live-seat-card[data-seat="2"]'),
        s8: box('.live-seat-card[data-seat="8"]'),
        hud: box('.live-judge-hud'),
        s3: box('.live-seat-card[data-seat="3"]'),
        docWidth: document.documentElement.scrollWidth,
      };
    });

    expect(positions.docWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(positions.s9.y).toBeCloseTo(positions.s10.y, 0);
    expect(positions.s10.y).toBeCloseTo(positions.s1.y, 0);
    expect(positions.s1.y).toBeCloseTo(positions.s2.y, 0);
    expect(positions.s8.y).toBeCloseTo(positions.hud.y, 0);
    expect(positions.hud.y).toBeCloseTo(positions.s3.y, 0);
    expect(positions.hud.width).toBeGreaterThan(positions.s8.width * 1.8);

    await page.screenshot({ path: info.outputPath(`live-game-desktop-${viewport.name}.png`), fullPage: false });
  });
}

test('Tournament Live Game uses the same 4x3 desktop board as mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/tournament-live-game.html?mode=audit');
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

  await expect(page.locator('.tournament-live-shell.evening-live-engine-shell')).toBeVisible();
  await expect(page.getByText('Панель судейства', { exact: true })).toBeHidden();
  await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
  await expect(page.locator('.live-seat-card[data-seat="10"]')).toBeVisible();
  await page.mouse.move(1, 1);

  const positions = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      s9: box('.live-seat-card[data-seat="9"]'),
      s10: box('.live-seat-card[data-seat="10"]'),
      s1: box('.live-seat-card[data-seat="1"]'),
      s2: box('.live-seat-card[data-seat="2"]'),
      s8: box('.live-seat-card[data-seat="8"]'),
      hud: box('.live-judge-hud'),
      s3: box('.live-seat-card[data-seat="3"]'),
      name1: document.querySelector('.live-seat-card[data-seat="1"] .live-seat-footer__name')?.textContent?.trim() || '',
      docWidth: document.documentElement.scrollWidth,
    };
  });

  expect(positions.docWidth).toBeLessThanOrEqual(1441);
  expect(Math.abs(positions.s9.y - positions.s10.y)).toBeLessThan(2);
  expect(Math.abs(positions.s10.y - positions.s1.y)).toBeLessThan(2);
  expect(Math.abs(positions.s1.y - positions.s2.y)).toBeLessThan(2);
  expect(Math.abs(positions.s8.y - positions.hud.y)).toBeLessThan(2);
  expect(Math.abs(positions.hud.y - positions.s3.y)).toBeLessThan(2);
  expect(positions.hud.width).toBeGreaterThan(positions.s8.width * 1.8);
  expect(positions.name1).toBe('Игрок 1');

  await page.screenshot({ path: info.outputPath('tournament-live-game-desktop-1440x900.png'), fullPage: false });
});

test('Tournament Live Game mounts the killed-player protocol overlay on desktop', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/tournament-live-game.html?mode=death');

  // A saved death-protocol state is picked up by the scoped bridge as soon as
  // the tournament engine shell mounts. The overlay intentionally owns the
  // pointer before the underlying «Восстановить» action can be clicked.
  const overlay = page.locator('[class~="z-[126]"]').filter({ hasText: 'Красные' }).filter({ hasText: 'Чёрные' });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('Протокол убитого', { exact: true })).toBeVisible();
  await expect(overlay.getByText('#2 · Игрок 2', { exact: true })).toBeVisible();

  await page.screenshot({ path: info.outputPath('tournament-live-game-death-protocol-1440x900.png'), fullPage: false });
});

// Nothing a judge needs during a voting may sit under another element: the counters, «Отменить последний голос» and the
// action bar all have to be reachable by a real click on a laptop screen (owner, 2026-10-18).
for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`Live Game voting controls are not covered at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/live-game.html?mode=audit');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    await page.getByRole('button', { name: 'Начать голосование', exact: true }).click();
    await expect(page.getByText(/Кто против/)).toBeVisible();
    for (const label of ['Отменить последний голос', 'Следующий →']) {
      const target = page.getByRole('button', { name: label, exact: true });
      await expect(target).toBeVisible();
      const reachable = await target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return top === element || element.contains(top);
      });
      expect(reachable, `${label} must not be covered`).toBe(true);
    }
  });
}

// The vote count lives in one small table cell: the counters, «Цифрами» and the step buttons each keep their own line,
// nothing covers a button and no text leaves its box (owner, 2026-10-27: the shortcut row climbed onto the counters).
for (const [width, height] of [[360, 780], [390, 844], [1366, 768], [1440, 900]]) {
  test(`Live Game vote count has no overlaps at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/live-game.html?mode=audit');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    await page.getByRole('button', { name: 'Начать голосование', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Цифрами', exact: true })).toBeVisible();
    const problems = await page.evaluate(() => {
      const stack = document.querySelector('.live-judge-hud__stack--voting-scroll');
      const hud = document.querySelector('.live-judge-hud').getBoundingClientRect();
      const bar = stack.querySelector('.live-judge-vote-actions');
      const visible = (el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
      const rows = [...[...stack.children].filter((el) => el !== bar), ...(bar ? [...bar.children] : [])].filter(visible)
        .map((el) => ({ name: el.className.split(' ')[0], r: el.getBoundingClientRect() }));
      const found = [];
      rows.forEach((a, i) => rows.slice(i + 1).forEach((b) => {
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 1 && y > 1) found.push(`${a.name} overlaps ${b.name}`);
      }));
      for (const row of rows) if (row.r.bottom > hud.bottom + 1) found.push(`${row.name} leaves the panel`);
      for (const button of stack.querySelectorAll('button')) {
        const r = button.getBoundingClientRect();
        if (!r.height) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(top === button || button.contains(top))) found.push(`«${button.getAttribute('aria-label') || button.textContent.trim()}» is covered`);
      }
      for (const el of stack.querySelectorAll('.live-judge-stat, .live-judge-action')) {
        if (el.scrollWidth > el.clientWidth + 1) found.push(`text leaves «${el.textContent.trim()}»`);
      }
      return found;
    });
    await page.screenshot({ path: info.outputPath(`live-vote-count-${width}x${height}.png`), fullPage: false });
    expect(problems).toEqual([]);
  });
}

for (const width of [360, 390]) {
  test(`Tournament CRM role corrections reach the live engine at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.install();
    await page.goto('/e2e/tournament-live-game.html?mode=role-correction');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`crm-roles-before-${width}.png`), fullPage: true });
    await page.clock.fastForward(20_100);
    await expect(page.getByTestId('tournament-live-roles-changed')).toContainText('Движок применяет исправления');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session')).activePlayers[0].role)).toBe('mafia');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session')));
    expect(saved.activePlayers[0].team).toBe('black');
    expect(saved.activePlayers[1].role).toBe('citizen');
    expect(saved.protocolEvidence.events.filter(event => event.kind === 'role_corrected')).toHaveLength(2);
    await page.clock.fastForward(20_100);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session')).protocolEvidence.events.filter(event => event.kind === 'role_corrected').length)).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`crm-roles-after-${width}.png`), fullPage: true });
  });
}
