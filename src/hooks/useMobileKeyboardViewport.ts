import { useState, useEffect } from 'react';

/**
 * Hook to detect mobile virtual keyboard visibility and auto-hide peripheral UI elements.
 * Adds CSS class 'mobile-keyboard-open' to document body and document element.
 */
export function useMobileKeyboardViewport() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
        document.body.classList.add('mobile-keyboard-open');
        document.documentElement.classList.add('mobile-keyboard-open');

        // Smoothly scroll active element into middle view
        setTimeout(() => {
          if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, 150);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          !active ||
          !(active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        ) {
          setIsKeyboardOpen(false);
          document.body.classList.remove('mobile-keyboard-open');
          document.documentElement.classList.remove('mobile-keyboard-open');
        }
      }, 100);
    };

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.85;
        if (isKeyboard) {
          setIsKeyboardOpen(true);
          document.body.classList.add('mobile-keyboard-open');
          document.documentElement.classList.add('mobile-keyboard-open');
        } else {
          const active = document.activeElement as HTMLElement | null;
          if (
            !active ||
            !(active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
          ) {
            setIsKeyboardOpen(false);
            document.body.classList.remove('mobile-keyboard-open');
            document.documentElement.classList.remove('mobile-keyboard-open');
          }
        }
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
      document.body.classList.remove('mobile-keyboard-open');
      document.documentElement.classList.remove('mobile-keyboard-open');
    };
  }, []);

  return { isKeyboardOpen };
}

export default useMobileKeyboardViewport;
