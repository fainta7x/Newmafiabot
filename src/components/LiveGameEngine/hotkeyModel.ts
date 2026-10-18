// Desktop keyboard control of the Live Game (owner, 2026-10-17). Pure mapping from a key event to a command, so the
// layout-independent rules (physical keys, mirrored action keys, digits as seats) are covered by unit tests.

export type SeatAction = 'expose' | 'foul' | 'minorTech' | 'majorTech' | 'removeFoul' | 'panel';
export type ArrowDirection = 'left' | 'right' | 'up' | 'down';

export type HotkeyCommand =
  | { type: 'digit'; digit: number; shift: boolean }
  | { type: 'seatAction'; action: SeatAction; code: string }
  | { type: 'arrow'; direction: ArrowDirection }
  | { type: 'primary' }
  | { type: 'space' }
  | { type: 'back' }
  | { type: 'undo' }
  | { type: 'escape' }
  | { type: 'split' }
  | { type: 'timerMinus' }
  | { type: 'extension' }
  | { type: 'mute' }
  | { type: 'help' };

export type HotkeyEventLike = {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
};

/**
 * Mirrored action keys: the same action on the left hand and on the right hand, so after a seat digit the opposite hand
 * is always close to its key. Physical codes, so they work on any layout; the hints show the Russian letters.
 */
export const SEAT_ACTION_CODES: Record<string, SeatAction> = {
  KeyD: 'expose', KeyK: 'expose',
  KeyF: 'foul', KeyJ: 'foul',
  KeyS: 'minorTech', KeyL: 'minorTech',
  KeyA: 'majorTech', Semicolon: 'majorTech',
  KeyG: 'removeFoul', KeyH: 'removeFoul',
};

/** The second digit does the same: 1 expose, 2 foul, 3 small tech, 4 big tech, 5 take a foul back, 0 the player panel. */
export const SEAT_ACTION_DIGITS: Record<number, SeatAction> = {
  1: 'expose', 2: 'foul', 3: 'minorTech', 4: 'majorTech', 5: 'removeFoul', 0: 'panel',
};

export const SEAT_ACTION_LABELS: Array<{ action: SeatAction; label: string; digit: number; keys: string }> = [
  { action: 'expose', label: 'Выставить', digit: 1, keys: 'В / Л' },
  { action: 'foul', label: 'Фол', digit: 2, keys: 'А / О' },
  { action: 'minorTech', label: 'Малый тех', digit: 3, keys: 'Ы / Д' },
  { action: 'majorTech', label: 'Большой тех', digit: 4, keys: 'Ф / Ж' },
  { action: 'removeFoul', label: 'Снять фол', digit: 5, keys: 'П / Р' },
  { action: 'panel', label: 'Панель', digit: 0, keys: 'Пробел' },
];

export const digitFromCode = (code: string): number | null => {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return match ? Number(match[1]) : null;
};

/** Digit 0 is the tenth seat, 1–9 are the seats 1–9. */
export const seatFromDigit = (digit: number): number => (digit === 0 ? 10 : digit);

const ARROWS: Record<string, ArrowDirection> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
};

export function parseHotkey(event: HotkeyEventLike): HotkeyCommand | null {
  if (event.repeat || event.altKey) return null;
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !event.shiftKey) return { type: 'undo' };
  // Any other Ctrl/Cmd combination belongs to the browser.
  if (event.ctrlKey || event.metaKey) return null;

  const digit = digitFromCode(event.code);
  if (digit !== null) return { type: 'digit', digit, shift: event.shiftKey };

  if (event.shiftKey && event.code === 'Slash') return { type: 'help' };
  if (event.shiftKey) return null;

  const action = SEAT_ACTION_CODES[event.code];
  // `A` is also the auto-mode switch: it only acts as «big tech foul» while the seat menu is open (the hook decides).
  if (action) return { type: 'seatAction', action, code: event.code };
  const direction = ARROWS[event.code];
  if (direction) return { type: 'arrow', direction };

  switch (event.code) {
    case 'Enter':
    case 'NumpadEnter':
      return { type: 'primary' };
    case 'Space': return { type: 'space' };
    case 'Backspace': return { type: 'back' };
    case 'Escape': return { type: 'escape' };
    case 'KeyQ': return { type: 'split' };
    case 'BracketLeft': return { type: 'timerMinus' };
    case 'Equal':
    case 'NumpadAdd': return { type: 'extension' };
    case 'KeyM': return { type: 'mute' };
    case 'Slash': return { type: 'help' };
    default: return null;
  }
}

export type SeatRect = { slot: number; x: number; y: number };

/**
 * Moves the seat cursor across the table the way it looks on the screen: the nearest seat in the pressed direction,
 * preferring the same row/column. Stays where it is when nothing lies that way.
 */
export function moveSeatCursor(rects: SeatRect[], from: number | null, direction: ArrowDirection): number | null {
  if (!rects.length) return from;
  const current = from === null ? null : rects.find((rect) => rect.slot === from) ?? null;
  if (!current) return [...rects].sort((a, b) => a.slot - b.slot)[0].slot;
  let best: { slot: number; score: number } | null = null;
  for (const rect of rects) {
    if (rect.slot === current.slot) continue;
    const dx = rect.x - current.x;
    const dy = rect.y - current.y;
    const forward = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    if (forward <= 1) continue;
    const sideways = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = forward + sideways * 2.5;
    if (!best || score < best.score) best = { slot: rect.slot, score };
  }
  return best ? best.slot : current.slot;
}

/** Hotkeys never fire while the judge types into a field. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true;
};
