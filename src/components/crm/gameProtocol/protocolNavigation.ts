import type { ProtocolTab } from './ProtocolWindow';

/**
 * Every remark of the protocol is a link (owner, 2026-11-02: «если протоколу что-то не нравится, пусть сразу перекидывает на момент,
 * который нужно исправить»): it opens the right page and circle, then scrolls to the exact block and flashes it.
 */
export type ProtocolAnchor = 'winner' | 'players' | 'night' | 'voting';

const ANCHOR_IDS: Record<ProtocolAnchor, string> = {
  winner: 'protocol-winner', players: 'protocol-players', night: 'circle-night', voting: 'circle-voting',
};

/** The anchor a remark that points at a «tab» means when it names none (the winner and the players live on the protocol page). */
export const anchorOfTab = (tab: ProtocolTab): ProtocolAnchor | null => (tab === 'result' ? 'winner' : tab === 'players' ? 'players' : null);

export function revealProtocolSection(anchor: ProtocolAnchor, doc: Document = document): boolean {
  const element = doc.getElementById(ANCHOR_IDS[anchor]);
  if (!element) return false;
  element.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  element.classList.add('ring-2', 'ring-amber-300/70', 'rounded-2xl', 'transition-shadow');
  window.setTimeout(() => element.classList.remove('ring-2', 'ring-amber-300/70'), 1800);
  return true;
}

/** The block may not be on screen yet (the page or the circle is still switching): look for it a few times. */
export function revealProtocolSectionSoon(anchor: ProtocolAnchor, tries = 8): void {
  const attempt = (left: number) => {
    if (revealProtocolSection(anchor) || left <= 0) return;
    window.setTimeout(() => attempt(left - 1), 80);
  };
  window.setTimeout(() => attempt(tries), 60);
}
