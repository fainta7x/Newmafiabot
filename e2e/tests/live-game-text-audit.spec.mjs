import { expect, test } from '@playwright/test';

// Every screen of a live game, phone and desktop (owner, 2026-10-27: «текст на тексте», «ПЕРЕ…»): no text sits on other
// text, no label is cut to «…», nothing leaves its box or the screen, and no button is covered.
// LIVE_TEXT_AUDIT_REPORT=1 prints every finding instead of failing on the first screen.

const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900]];

/** Runs in the page: finds overlapping, truncated and clipped text and covered buttons on the current screen. */
const auditScreen = () => {
  const forceHit = document.createElement('style');
  forceHit.textContent = '* { pointer-events: auto !important; }';
  document.head.appendChild(forceHit);
  const issues = new Set();
  const vw = innerWidth;
  const vh = innerHeight;
  // Any CSS colour syntax: rgb(a), color(srgb …), oklab/oklch with «/ alpha», or transparent.
  const alpha = (color) => {
    if (!color || color === 'transparent') return 0;
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
    if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = /^rgba\(([^)]+)\)$/.exec(color);
    if (rgba) return Number(rgba[1].split(',')[3]);
    return /^(rgb|hsl|color|oklab|oklch|lab|lch)\(/.test(color) ? 1 : 0;
  };
  const coverAlpha = (el) => {
    const style = getComputedStyle(el);
    const own = alpha(style.backgroundColor) * Number(style.opacity);
    const blur = style.backdropFilter && style.backdropFilter !== 'none' ? 0.5 : 0;
    const image = style.backgroundImage !== 'none' ? 0.5 : 0;
    return Math.max(own, blur, image);
  };
  // A modal: a fixed layer over most of the window. What lies under it is meant to be covered.
  const modalOf = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position !== 'fixed' && position !== 'absolute') continue;
      if (position === 'absolute' && coverAlpha(node) < 0.5 && !node.matches('[role="dialog"], [data-testid*="role-deal"]')) continue;
      const r = node.getBoundingClientRect();
      if (r.width * r.height >= 0.4 * vw * vh) return node;
    }
    return null;
  };
  const shown = (el) => {
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
      if (node.classList.contains('sr-only')) return false;
    }
    return true;
  };
  const name = (el) => {
    const id = el.closest('[data-testid]')?.getAttribute('data-testid');
    const cls = String(el.className || '').split(' ').find((c) => c && !c.includes(':') && !c.includes('[')) || el.tagName.toLowerCase();
    return id && !cls.startsWith('live-') ? `${id} ${cls}` : cls;
  };
  const inter = (a, b) => ({ x: Math.min(a.right, b.right) - Math.max(a.left, b.left), y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), cx: (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2, cy: (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2 });

  const items = [];
  const pendingCuts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || el.closest('script,style,noscript,option')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    let rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    if (!rects.length || !shown(el)) continue;
    // Text scrolled out of a scroll box, or outside the window, is not on screen.
    let hiddenByScroll = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      const box = p.getBoundingClientRect();
      const out = rects.every((r) => r.bottom <= box.top + 1 || r.top >= box.bottom - 1 || r.right <= box.left + 1 || r.left >= box.right - 1);
      if (['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflowX)) { if (out) { hiddenByScroll = true; break; } }
      else if (['hidden', 'clip'].includes(style.overflowY) || ['hidden', 'clip'].includes(style.overflowX)) {
        if (out) { hiddenByScroll = true; break; }
        // Text that sticks out of a box which hides overflow is cut.
        const cut = rects.some((r) => r.right > box.right + 1.5 || r.left < box.left - 1.5 || r.bottom > box.bottom + 1.5 || r.top < box.top - 1.5);
        if (cut && p.scrollWidth <= p.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).webkitLineClamp === 'none') pendingCuts.push(`cut «${text.slice(0, 30)}» by ${name(p)}`);
      }
    }
    if (hiddenByScroll) { pendingCuts.length = 0; continue; }
    rects = rects.filter((r) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
    if (!rects.length) { pendingCuts.length = 0; continue; }
    // Text under an opaque layer (a modal, a sheet, the game window over the page) is not seen.
    const r0 = rects[0];
    const above = document.elementsFromPoint(Math.min(Math.max(r0.left + r0.width / 2, 0), vw - 1), Math.min(Math.max(r0.top + r0.height / 2, 0), vh - 1));
    const own = above.findIndex((e) => e === el || el.contains(e));
    if (own < 0 || 1 - above.slice(0, own).reduce((left, e) => left * (1 - Math.min(1, coverAlpha(e))), 1) >= 0.75) { pendingCuts.length = 0; continue; }
    for (const cut of pendingCuts) issues.add(cut);
    if (rects.some((r) => r.right > vw + 1 || r.left < -1)) issues.add(`off screen «${text.slice(0, 30)}»`);
    pendingCuts.length = 0;
    items.push({ el, text, rects });
  }

  // «…»: a label shortened by text-overflow or a line clamp.
  const seen = new Set();
  for (const { el, text } of items) {
    for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      if (seen.has(node)) break;
      const style = getComputedStyle(node);
      const clamped = style.webkitLineClamp !== 'none' && style.webkitLineClamp && node.scrollHeight > node.clientHeight + 1;
      // The latest event is a two-line preview of the journal, which opens in full under «Журнал».
      if (node.matches('[data-testid="live-events-latest"]')) break;
      if ((style.textOverflow === 'ellipsis' && node.scrollWidth > node.clientWidth + 1) || clamped) {
        seen.add(node);
        issues.add(`truncated «${(node.textContent || text).replace(/\s+/g, ' ').trim().slice(0, 40)}» (${name(node)})`);
        break;
      }
    }
  }

  // Text on text: two text runs share pixels and nothing opaque lies between them.
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.el === b.el) continue;
      for (const ra of a.rects) for (const rb of b.rects) {
        const o = inter(ra, rb);
        if (o.x <= 2 || o.y <= 2) continue;
        const ma = modalOf(a.el);
        const mb = modalOf(b.el);
        if (ma !== mb && (ma || mb) && coverAlpha(ma || mb) >= 0.5) continue;
        const stack = document.elementsFromPoint(o.cx, o.cy);
        const ia = stack.findIndex((e) => e === a.el || a.el.contains(e));
        const ib = stack.findIndex((e) => e === b.el || b.el.contains(e));
        if (ia < 0 && ib < 0) continue;
        const top = ia < 0 ? ib : ib < 0 ? ia : Math.min(ia, ib);
        const low = ia < 0 || ib < 0 ? stack.length : Math.max(ia, ib);
        // Layers between the viewer and a text add up: three half-dark layers hide it as well as one dark one.
        const cover = (layers) => 1 - layers.reduce((left, el) => left * (1 - Math.min(1, coverAlpha(el))), 1);
        // A text's own boxes (its button, its card) are its background, not a cover over it.
        const upper = top === ia ? a.el : b.el;
        const lower = upper === a.el ? b.el : a.el;
        if (cover(stack.slice(0, top).filter((e) => !e.contains(upper))) >= 0.75) continue;
        if (cover(stack.slice(top, low).filter((e) => !e.contains(lower) && !e.contains(upper))) >= 0.75) continue;
        issues.add(`text on text «${a.text.slice(0, 24)}» × «${b.text.slice(0, 24)}» (${name(a.el)} / ${name(b.el)})`);
      }
    }
  }

  // A visible, enabled button that something drawn sits on — at its centre or at any of four inner corners — is covered.
  // Hit testing keeps every layer (also pointer-events: none badges and toasts); a layer counts only if it is drawn there:
  // a background, a blur, or text. An open window (a large fixed layer) puts what is under it out of reach on purpose.
  const drawnAt = (e, x, y) => {
    if (coverAlpha(e) >= 0.3) return true;
    return [...e.childNodes].some((child) => {
      if (child.nodeType !== 3 || !child.textContent.trim()) return false;
      const range = document.createRange();
      range.selectNodeContents(child);
      return [...range.getClientRects()].some((rr) => x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom);
    });
  };
  for (const button of document.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"]')) {
    if (!shown(button) || button.disabled) continue;
    const r = button.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    // A button with nothing to read or see: its caption is hidden and it has no icon.
    const caption = [...button.querySelectorAll('*'), button].some((node) => {
      if (node.tagName === 'svg' || node.tagName === 'IMG') return shown(node) && node.getBoundingClientRect().width > 2;
      return [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()) && shown(node) && node.getBoundingClientRect().width > 2;
    });
    if (!caption) issues.add(`empty button «${button.getAttribute('aria-label') || button.getAttribute('title') || button.getAttribute('data-testid') || name(button)}»`);
    const inset = Math.min(4, r.width / 4, r.height / 4);
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset]]
      .map(([x, y]) => [Math.min(Math.max(x, 1), vw - 1), Math.min(Math.max(y, 1), vh - 1)]);
    for (const [x, y] of points) {
      const above = document.elementsFromPoint(x, y);
      const own = above.findIndex((e) => e === button || button.contains(e));
      // A point past a rounded corner is not on the button; a passing notice (role=status, gone in seconds) is no cover.
      if (own < 0) continue;
      const over = above.slice(0, own).filter((e) => !e.contains(button) && !e.closest('[role="status"]'));
      if (over.some((e) => { const m = modalOf(e); return m && !m.contains(button); })) break;
      const cover = over.find((e) => drawnAt(e, x, y));
      if (cover) {
        const label = (button.getAttribute('aria-label') || button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        if (label) issues.add(`covered button «${label}» under ${name(cover)}`);
        break;
      }
    }
  }
  forceHit.remove();
  return [...issues];
};

const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };

for (const [width, height] of VIEWPORTS) {
  test(`live game text audit at ${width}x${height}`, async ({ page }, info) => {
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
      if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    }
    expect(report).toEqual([]);
  });
}
