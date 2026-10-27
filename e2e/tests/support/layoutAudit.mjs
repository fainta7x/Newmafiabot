// The layout and text detector of the «Layout and text gate» (AGENTS.md; how it works: docs/RUNBOOK.md → Layout and text
// audit). Pass it to page.evaluate on any screen: it returns the findings as plain strings, an empty list when clean.

/** Runs in the page: finds overlapping, truncated and clipped text and covered buttons on the current screen. */
export const auditScreen = () => {
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
  // Window chrome: a fixed or sticky bar along the top or bottom edge (the bottom menu, a top bar). Content of a page that
  // can still scroll passes under it — that is scrolling, not a defect; content it covers for good is.
  const chromeOf = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      const r = node.getBoundingClientRect();
      if (r.width >= 0.5 * vw && r.height <= 0.4 * vh && (r.top <= 2 || r.bottom >= vh - 2)) return node;
    }
    return null;
  };
  const canScrollPast = (el, chrome) => {
    const down = chrome.getBoundingClientRect().top > vh / 2;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const scrolls = node === document.scrollingElement || ['auto', 'scroll'].includes(style.overflowY);
      if (!scrolls || node.scrollHeight <= node.clientHeight + 1) continue;
      if (down ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
    }
    return false;
  };
  // Covers that only mean «scrolled under the menu» are left out; the rest are defects.
  const realCover = (cover, el) => {
    const chrome = chromeOf(cover);
    return !(chrome && !chrome.contains(el) && canScrollPast(el, chrome));
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
    let inScroller = false;
    // The part of the first line the reader can see: inside every box that clips it and inside the window.
    const seen = { left: Math.max(rects[0].left, 0), top: Math.max(rects[0].top, 0), right: Math.min(rects[0].right, vw), bottom: Math.min(rects[0].bottom, vh) };
    // Every box that clips the text (all its lines), for comparing it with other text: a label cut to «…» still reports
    // its whole width, but only the part inside these boxes is drawn.
    const clip = { left: 0, top: 0, right: vw, bottom: vh };
    // The text's own element counts too: a label that hides its own overflow clips its text.
    for (let p = el; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      const box = p.getBoundingClientRect();
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        seen.left = Math.max(seen.left, box.left); seen.top = Math.max(seen.top, box.top);
        seen.right = Math.min(seen.right, box.right); seen.bottom = Math.min(seen.bottom, box.bottom);
        clip.left = Math.max(clip.left, box.left); clip.top = Math.max(clip.top, box.top);
        clip.right = Math.min(clip.right, box.right); clip.bottom = Math.min(clip.bottom, box.bottom);
      }
      const out = rects.every((r) => r.bottom <= box.top + 1 || r.top >= box.bottom - 1 || r.right <= box.left + 1 || r.left >= box.right - 1);
      if (['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflowX)) {
        if (out) { hiddenByScroll = true; break; }
        // Inside a strip that scrolls, a half-shown item is scrolling, not a cut: the boxes around the strip do not count.
        if (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1) { inScroller = true; break; }
      }
      else if (['hidden', 'clip'].includes(style.overflowY) || ['hidden', 'clip'].includes(style.overflowX)) {
        if (out) { hiddenByScroll = true; break; }
        // Text that sticks out of a box which hides overflow is cut.
        const cut = rects.some((r) => r.right > box.right + 1.5 || r.left < box.left - 1.5 || r.bottom > box.bottom + 1.5 || r.top < box.top - 1.5);
        if (cut && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).webkitLineClamp === 'none') pendingCuts.push(`cut «${text.slice(0, 30)}» by ${name(p)}`);
      }
      // A fixed layer escapes the clipping of the boxes around it (a window inside a page that hides its overflow).
      if (style.position === 'fixed') break;
    }
    if (hiddenByScroll) { pendingCuts.length = 0; continue; }
    rects = rects.filter((r) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
    if (!rects.length) { pendingCuts.length = 0; continue; }
    // Text under an opaque layer (a modal, a sheet, the game window over the page) is not seen.
    // Hit-test the visible part: a label cut to «…» is far wider than its box, and its middle lies outside it (Codex, #1061).
    if (seen.right - seen.left < 1 || seen.bottom - seen.top < 1) { pendingCuts.length = 0; continue; }
    // Three points across the visible text (a badge or a button often covers only a part of a label).
    let underWindow = false;
    let offText = 0;
    let coverOver = null;
    for (const fx of [0.2, 0.5, 0.8]) {
      const above = document.elementsFromPoint(Math.min(seen.left + (seen.right - seen.left) * fx, vw - 1), Math.min((seen.top + seen.bottom) / 2, vh - 1));
      const own = above.findIndex((e) => e === el || el.contains(e));
      if (own < 0) { offText += 1; continue; }
      const layers = above.slice(0, own).filter((e) => !e.contains(el) && !e.closest('[role="status"]'));
      // Under an open window (a large fixed layer) text is meant to be out of sight.
      if (layers.some((e) => modalOf(e) && !modalOf(e).contains(el))) { underWindow = true; break; }
      // Anything else drawn over the text — a button, a badge, an icon, a card — hides part of it.
      // An svg shape (a ring around a percentage) is drawn around the text, not over it; an image or a button is over it.
      // A layer marked data-layout-cover="intended" covers by an approved design (the OBS «Убит» ribbon over a portrait).
      coverOver = coverOver || layers.find((e) => (coverAlpha(e) >= 0.3 || ['IMG', 'BUTTON'].includes(e.tagName)) && realCover(e, el) && !e.closest('[data-layout-cover="intended"]')) || null;
    }
    if (underWindow || offText === 3) { pendingCuts.length = 0; continue; }
    if (coverOver) { issues.add(`text «${text.slice(0, 30)}» covered by ${name(coverOver)}`); pendingCuts.length = 0; continue; }
    for (const cut of pendingCuts) issues.add(cut);
    if (!inScroller && rects.some((r) => r.right > vw + 1 || r.left < -1)) issues.add(`off screen «${text.slice(0, 30)}»`);
    pendingCuts.length = 0;
    const drawn = rects
      .map((r) => ({ left: Math.max(r.left, clip.left), top: Math.max(r.top, clip.top), right: Math.min(r.right, clip.right), bottom: Math.min(r.bottom, clip.bottom) }))
      .filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1);
    items.push({ el, text, rects: drawn });
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
        if (a.el.closest('[data-layout-cover="intended"]') || b.el.closest('[data-layout-cover="intended"]')) continue;
        // One text in the window chrome, the other in the page under it that can still scroll out: scrolling.
        const ca = chromeOf(a.el);
        const cb = chromeOf(b.el);
        if (ca !== cb && (ca || cb)) {
          const chrome = ca || cb;
          const below = ca ? b.el : a.el;
          if (!chrome.contains(below) && canScrollPast(below, chrome)) continue;
        }
        const ma = modalOf(a.el);
        const mb = modalOf(b.el);
        if (ma !== mb && (ma || mb) && coverAlpha(ma || mb) >= 0.5) continue;
        const stack = document.elementsFromPoint(o.cx, o.cy);
        const ia = stack.findIndex((e) => e === a.el || a.el.contains(e));
        const ib = stack.findIndex((e) => e === b.el || b.el.contains(e));
        // A text run outside an ancestor scroll clip is not painted at this intersection.
        if (ia < 0 || ib < 0) continue;
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
      const cover = over.find((e) => drawnAt(e, x, y) && realCover(e, button));
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
