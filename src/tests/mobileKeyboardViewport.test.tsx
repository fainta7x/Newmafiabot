/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMobileKeyboardViewport } from '../hooks/useMobileKeyboardViewport';

class MockVisualViewport extends EventTarget {
  height = 800;
  width = 390;
  offsetTop = 0;
  offsetLeft = 0;
  pageTop = 0;
  pageLeft = 0;
  scale = 1;

  onresize = null;
  onscroll = null;
}

describe('useMobileKeyboardViewport', () => {
  const originalViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('mobile-keyboard-open');
    document.documentElement.style.removeProperty('--app-visual-viewport-height');
    document.documentElement.style.removeProperty('--app-visual-viewport-offset-top');

    if (originalViewportDescriptor) {
      Object.defineProperty(window, 'visualViewport', originalViewportDescriptor);
    } else {
      Reflect.deleteProperty(window, 'visualViewport');
    }

    if (originalInnerHeightDescriptor) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeightDescriptor);
    }
  });

  it('marks the keyboard as open only while an editable field owns the reduced viewport', () => {
    const viewport = new MockVisualViewport();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });

    const input = document.createElement('input');
    document.body.append(input);

    const { unmount } = renderHook(() => useMobileKeyboardViewport());
    expect(document.documentElement.classList.contains('mobile-keyboard-open')).toBe(false);

    input.focus();
    viewport.height = 500;
    act(() => viewport.dispatchEvent(new Event('resize')));

    expect(document.documentElement.classList.contains('mobile-keyboard-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--app-visual-viewport-height')).toBe('500px');

    unmount();
    expect(document.documentElement.classList.contains('mobile-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--app-visual-viewport-height')).toBe('');
  });
});
