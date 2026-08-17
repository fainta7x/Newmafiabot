/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileKeyboardViewport } from '../hooks/useMobileKeyboardViewport';

describe('useMobileKeyboardViewport hook', () => {
  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
  });

  it('adds mobile-keyboard-open class when input receives focus', () => {
    renderHook(() => useMobileKeyboardViewport());

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(document.body.classList.contains('mobile-keyboard-open')).toBe(true);
    expect(document.documentElement.classList.contains('mobile-keyboard-open')).toBe(true);

    document.body.removeChild(input);
  });

  it('removes mobile-keyboard-open class when focus is lost', async () => {
    renderHook(() => useMobileKeyboardViewport());

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(document.body.classList.contains('mobile-keyboard-open')).toBe(true);

    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    expect(document.body.classList.contains('mobile-keyboard-open')).toBe(false);

    document.body.removeChild(input);
  });
});
