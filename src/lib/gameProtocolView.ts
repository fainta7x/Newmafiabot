/** Keep the current protocol's disclosures in its own history entry while Replay replaces the cabinet. */
export function rememberGameProtocolView(gameKey: string) {
  const sheet = document.querySelector<HTMLElement>('[data-testid="game-score-sheet"]');
  if (!sheet) return;
  const openSections = Array.from(sheet.querySelectorAll<HTMLDetailsElement>('details[data-testid]'))
    .filter(section => section.open).map(section => section.dataset.testid!);
  const scrollTops: number[] = [];
  for (let parent = sheet.parentElement; parent; parent = parent.parentElement) scrollTops.push(parent.scrollTop);
  window.history.replaceState({ ...window.history.state, gameProtocolView: { gameKey, openSections, scrollTops, scrollY: window.scrollY } }, '', window.location.href);
}

export function restoreGameProtocolView(gameKey: string, sheet: HTMLElement | null) {
  const saved = window.history.state?.gameProtocolView;
  if (!sheet || saved?.gameKey !== gameKey || !Array.isArray(saved.openSections)) return;
  for (const section of sheet.querySelectorAll<HTMLDetailsElement>('details[data-testid]')) {
    section.open = saved.openSections.includes(section.dataset.testid);
  }
  const scrollY = Number(saved.scrollY);
  if (!Number.isFinite(scrollY) || scrollY < 0) return;
  const frame = window.requestAnimationFrame(() => {
    let index = 0;
    for (let parent = sheet.parentElement; parent; parent = parent.parentElement) {
      const top = Number(saved.scrollTops?.[index++]);
      if (Number.isFinite(top) && top >= 0) parent.scrollTop = top;
    }
    window.scrollTo({ top: scrollY, behavior: 'auto' });
  });
  return () => window.cancelAnimationFrame(frame);
}
