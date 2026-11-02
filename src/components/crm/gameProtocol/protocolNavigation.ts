import type { ProtocolTab } from './ProtocolWindow';

/**
 * «Исправить» in «Что проверить» (owner, 2026-11-02: «кнопка ничего не делает»): the winner and the players live on the protocol
 * page itself, so a remark pointing at them used to switch to the page that was already open — and nothing visibly happened.
 * Now the target section is scrolled into view and flashed.
 */
const SECTION_IDS: Partial<Record<ProtocolTab, string>> = { result: 'protocol-winner', players: 'protocol-players' };

export function revealProtocolSection(tab: ProtocolTab, doc: Document = document): boolean {
  const id = SECTION_IDS[tab];
  if (!id) return false;
  const element = doc.getElementById(id);
  if (!element) return false;
  element.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  element.classList.add('ring-2', 'ring-amber-300/70', 'rounded-2xl', 'transition-shadow');
  window.setTimeout(() => element.classList.remove('ring-2', 'ring-amber-300/70'), 1800);
  return true;
}
