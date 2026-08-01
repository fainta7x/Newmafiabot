import { useEffect } from 'react';

const EDITABLE_SELECTOR =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

const isEditable = (element: Element | null): element is HTMLElement =>
  Boolean(element instanceof HTMLElement && element.matches(EDITABLE_SELECTOR));

/**
 * Keeps mobile forms usable while the on-screen keyboard resizes the visual viewport.
 * The hook is intentionally mounted once at CRM level and affects only components that
 * opt in through the keyboard-aware CSS classes/data attribute.
 */
export const useMobileKeyboardViewport = () => {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let baselineHeight = Math.max(window.innerHeight, viewport?.height ?? 0);
    let focusTimer: number | undefined;

    const updateViewport = () => {
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      baselineHeight = Math.max(baselineHeight, window.innerHeight, visibleHeight);

      root.style.setProperty('--app-visual-viewport-height', `${visibleHeight}px`);
      root.style.setProperty('--app-visual-viewport-offset-top', `${offsetTop}px`);

      const keyboardInset = baselineHeight - visibleHeight - offsetTop;
      root.classList.toggle(
        'mobile-keyboard-open',
        keyboardInset > 120 && isEditable(document.activeElement),
      );
    };

    const revealFocusedField = () => {
      const focused = document.activeElement;
      if (!isEditable(focused)) return;

      const scrollContainer = focused.closest<HTMLElement>('[data-keyboard-scroll-container]');
      if (scrollContainer) {
        const fieldRect = focused.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const centeredTop =
          scrollContainer.scrollTop +
          fieldRect.top -
          containerRect.top -
          (scrollContainer.clientHeight - fieldRect.height) / 2;

        if (typeof scrollContainer.scrollTo === 'function') {
          scrollContainer.scrollTo({ top: Math.max(0, centeredTop), behavior: 'smooth' });
        } else {
          scrollContainer.scrollTop = Math.max(0, centeredTop);
        }
        return;
      }

      focused.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    };

    const handleFocusIn = () => {
      window.clearTimeout(focusTimer);
      updateViewport();
      focusTimer = window.setTimeout(() => {
        updateViewport();
        revealFocusedField();
      }, 250);
    };

    const handleFocusOut = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(updateViewport, 120);
    };

    const handleOrientationChange = () => {
      baselineHeight = 0;
      window.setTimeout(updateViewport, 250);
    };

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.clearTimeout(focusTimer);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      root.classList.remove('mobile-keyboard-open');
      root.style.removeProperty('--app-visual-viewport-height');
      root.style.removeProperty('--app-visual-viewport-offset-top');
    };
  }, []);
};
