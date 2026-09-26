/**
 * Scrolls the page back to its top. In the app html, body and #root are 100% high, so the page scrolls
 * inside #root and window.scrollTo alone does nothing; reset every scrolled ancestor as well.
 */
export const scrollPageTop = (from?: HTMLElement | null) => {
  if (typeof window === 'undefined') return;
  for (let node = from ?? document.getElementById('root'); node; node = node.parentElement) {
    if (node.scrollTop) node.scrollTop = 0;
  }
  window.scrollTo?.({ top: 0 });
};
