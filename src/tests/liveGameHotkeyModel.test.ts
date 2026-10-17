// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget, moveSeatCursor, parseHotkey, seatFromDigit, type HotkeyEventLike } from '../components/LiveGameEngine/hotkeyModel';

const key = (code: string, extra: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({
  code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra,
});

describe('Live Game hotkey model', () => {
  it('maps digits to seats, 0 to the tenth, top row and numpad alike', () => {
    expect(parseHotkey(key('Digit3'))).toEqual({ type: 'digit', digit: 3, shift: false });
    expect(parseHotkey(key('Numpad7'))).toEqual({ type: 'digit', digit: 7, shift: false });
    expect(parseHotkey(key('Digit5', { shiftKey: true }))).toEqual({ type: 'digit', digit: 5, shift: true });
    expect(seatFromDigit(0)).toBe(10);
    expect(seatFromDigit(4)).toBe(4);
  });

  it('puts every action on both hands, by physical key', () => {
    const pair = (left: string, right: string, action: string) => {
      expect(parseHotkey(key(left))).toMatchObject({ type: 'seatAction', action });
      expect(parseHotkey(key(right))).toMatchObject({ type: 'seatAction', action });
    };
    pair('KeyD', 'KeyK', 'expose');
    pair('KeyF', 'KeyJ', 'foul');
    pair('KeyS', 'KeyL', 'minorTech');
    pair('KeyA', 'Semicolon', 'majorTech');
    pair('KeyG', 'KeyH', 'removeFoul');
  });

  it('keeps the step, timer and utility keys', () => {
    expect(parseHotkey(key('Enter'))).toEqual({ type: 'primary' });
    expect(parseHotkey(key('Space'))).toEqual({ type: 'space' });
    expect(parseHotkey(key('Backspace'))).toEqual({ type: 'back' });
    expect(parseHotkey(key('Escape'))).toEqual({ type: 'escape' });
    expect(parseHotkey(key('KeyQ'))).toEqual({ type: 'split' });
    expect(parseHotkey(key('Slash', { shiftKey: true }))).toEqual({ type: 'help' });
    expect(parseHotkey(key('ArrowLeft'))).toEqual({ type: 'arrow', direction: 'left' });
  });

  it('undo is Cmd+Z on a Mac and Ctrl+Z elsewhere; other browser combinations are left alone', () => {
    expect(parseHotkey(key('KeyZ', { metaKey: true }))).toEqual({ type: 'undo' });
    expect(parseHotkey(key('KeyZ', { ctrlKey: true }))).toEqual({ type: 'undo' });
    expect(parseHotkey(key('KeyF', { metaKey: true }))).toBeNull();
    expect(parseHotkey(key('KeyR', { ctrlKey: true }))).toBeNull();
  });

  it('ignores key repeat and Alt combinations', () => {
    expect(parseHotkey(key('KeyF', { repeat: true }))).toBeNull();
    expect(parseHotkey(key('Digit1', { altKey: true }))).toBeNull();
  });

  it('moves the cursor across the table the way it looks on the screen', () => {
    // 4 columns × 3 rows like the mobile table
    const rects = [
      { slot: 1, x: 0, y: 0 }, { slot: 2, x: 100, y: 0 }, { slot: 3, x: 200, y: 0 }, { slot: 4, x: 300, y: 0 },
      { slot: 5, x: 0, y: 100 }, { slot: 6, x: 300, y: 100 },
      { slot: 7, x: 0, y: 200 }, { slot: 8, x: 100, y: 200 }, { slot: 9, x: 200, y: 200 }, { slot: 10, x: 300, y: 200 },
    ];
    expect(moveSeatCursor(rects, 1, 'right')).toBe(2);
    expect(moveSeatCursor(rects, 4, 'down')).toBe(6);
    expect(moveSeatCursor(rects, 6, 'left')).toBe(5);
    expect(moveSeatCursor(rects, 5, 'down')).toBe(7);
    expect(moveSeatCursor(rects, 1, 'left')).toBe(1);
    expect(moveSeatCursor(rects, null, 'down')).toBe(1);
  });

  it('never fires while typing into a field', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});
