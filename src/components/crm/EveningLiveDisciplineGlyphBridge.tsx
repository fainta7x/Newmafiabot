import { useEffect } from 'react';

const syncDisciplineCounts = () => {
  document.querySelectorAll<HTMLElement>('.evening-live-discipline > span').forEach((node) => {
    const match = String(node.textContent || '').match(/-?\d+/);
    const value = match?.[0] || '0';
    if (node.dataset.count !== value) node.dataset.count = value;
  });
};

export function EveningLiveDisciplineGlyphBridge() {
  useEffect(() => {
    syncDisciplineCounts();
    const observer = new MutationObserver(syncDisciplineCounts);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
