import { useEffect, useRef, useState } from 'react';
import {
  SEAT_ACTION_DIGITS,
  isTypingTarget,
  moveSeatCursor,
  parseHotkey,
  seatFromDigit,
  type SeatAction,
  type SeatRect,
} from './hotkeyModel.js';

/** After this much silence the seat cursor and any half-typed command go away. */
const IDLE_MS = 6000;

export type HotkeyHandlers = {
  /** Same as tapping the seat card: a vote, a night target or check, otherwise the player action sheet. */
  tapSeat: (slot: number) => void;
  openPanel: (slot: number) => void;
  expose: (slot: number) => void;
  foul: (slot: number) => void;
  removeFoul: (slot: number) => void;
  techFoul: (slot: number, kind: 'minor' | 'major') => void;
  /** «Вскрытие» of a seat: mark it and open the panel for the announced checks. */
  reveal: (slot: number) => void;
  openReveals: () => void;
  undo: () => void;
  /** Backspace in a voting: takes back the last vote; false when nothing to erase. */
  eraseLastVote: () => boolean;
  quickSplit: (pair: [number, number]) => void;
  toast: (message: string) => void;
};

export type HotkeyContext = {
  enabled: boolean;
  /** An overlay owns the keyboard (player sheet, confirmations, best move, death protocol). */
  blocked: boolean;
  seats: number[];
  aliveSeats: number[];
  /** A tap on a seat card does the game's work here (voting, night target/check), so a digit is that tap. */
  tapPhase: boolean;
  quickSplitAvailable: boolean;
};

const click = (selector: string): boolean => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element || (element as HTMLButtonElement).disabled) return false;
  element.click();
  return true;
};

const HUD = '[data-testid="live-judge-hud"]';
const PRIMARY = `${HUD} .live-judge-hud__primary:not(:disabled), ${HUD} .live-judge-action--primary:not(:disabled), ${HUD} .live-judge-action--success:not(:disabled)`;
const BACK = `${HUD} [aria-label="Назад"]:not(:disabled), ${HUD} .live-judge-hud__secondary:not(:disabled), ${HUD} [data-testid="live-voting-back-to-speeches"]`;
const TIMER_TOGGLE = `${HUD} .live-judge-timer__button--pause, ${HUD} .live-judge-timer__button--primary`;

const readSeatRects = (seats: number[]): SeatRect[] => {
  const rects: SeatRect[] = [];
  for (const slot of seats) {
    const element = document.querySelector<HTMLElement>(`.live-seat-card[data-seat="${slot}"]`);
    if (!element) continue;
    const box = element.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    rects.push({ slot, x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }
  return rects;
};

/**
 * Keyboard control of the Live Game on a desktop or laptop (owner, 2026-10-17): a digit picks the seat (0 is the tenth),
 * the arrows move the cursor, then one key of either hand does the action. In a voting or at a night target a plain digit
 * is the tap itself; Shift+digit opens the action menu there. The engine keeps every rule: the hook only calls its handlers.
 */
export function useLiveGameHotkeys(context: HotkeyContext, handlers: HotkeyHandlers) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [split, setSplit] = useState<number[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const contextRef = useRef(context);
  const handlersRef = useRef(handlers);
  const cursorRef = useRef(cursor);
  const splitRef = useRef(split);
  const helpRef = useRef(helpOpen);
  contextRef.current = context;
  handlersRef.current = handlers;
  cursorRef.current = cursor;
  splitRef.current = split;
  helpRef.current = helpOpen;
  const idleRef = useRef<number | null>(null);

  const clearAll = () => {
    setCursor(null);
    setSplit(null);
    cursorRef.current = null;
    splitRef.current = null;
  };

  const armIdle = () => {
    if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      idleRef.current = null;
      clearAll();
    }, IDLE_MS);
  };

  // Highlight the cursor seat on the table without touching the seat card component.
  useEffect(() => {
    document.querySelectorAll('[data-hotkey-cursor]').forEach((element) => element.removeAttribute('data-hotkey-cursor'));
    if (cursor !== null) document.querySelector(`.live-seat-card[data-seat="${cursor}"]`)?.setAttribute('data-hotkey-cursor', 'true');
    return () => {
      document.querySelectorAll('[data-hotkey-cursor]').forEach((element) => element.removeAttribute('data-hotkey-cursor'));
    };
  }, [cursor]);

  useEffect(() => {
    if (!context.enabled || context.blocked) clearAll();
  }, [context.enabled, context.blocked]);

  useEffect(() => {
    const runSeatAction = (action: SeatAction, slot: number) => {
      const h = handlersRef.current;
      const alive = contextRef.current.aliveSeats.includes(slot);
      if (action === 'panel') return h.openPanel(slot);
      if (!alive) return h.toast(`#${slot} уже не за столом: действия — в панели игрока`);
      if (action === 'reveal') return h.reveal(slot);
      if (action === 'expose') return h.expose(slot);
      if (action === 'foul') { h.foul(slot); return h.toast(`Фол #${slot}`); }
      if (action === 'removeFoul') { h.removeFoul(slot); return h.toast(`Фол #${slot} снят`); }
      h.techFoul(slot, action === 'minorTech' ? 'minor' : 'major');
      return h.toast(`${action === 'minorTech' ? 'Малый' : 'Большой'} техфол #${slot}`);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const ctx = contextRef.current;
      if (!ctx.enabled || isTypingTarget(event.target)) return;
      const command = parseHotkey(event);
      if (!command) return;

      if (helpRef.current) {
        if (command.type === 'escape' || command.type === 'help') {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }
      if (ctx.blocked) {
        if (command.type === 'escape') clearAll();
        return;
      }
      if (command.type === 'help') {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      // A focused button would also react to Space/Enter by itself.
      if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') event.target.blur();

      const currentCursor = cursorRef.current;
      const currentSplit = splitRef.current;
      const handled = () => { event.preventDefault(); armIdle(); };
      const seatExists = (slot: number) => ctx.seats.includes(slot);

      switch (command.type) {
        case 'escape': {
          // Esc first stops a pending automatic step, then clears what was half typed.
          if (click('[data-testid="live-auto-stop"]')) return handled();
          if (currentCursor !== null || currentSplit !== null) { event.preventDefault(); clearAll(); }
          return;
        }
        case 'undo':
          event.preventDefault();
          handlersRef.current.undo();
          clearAll();
          return;
        case 'digit': {
          if (currentSplit !== null) {
            const slot = seatFromDigit(command.digit);
            if (!seatExists(slot)) return handled();
            if (!currentSplit.length) { setSplit([slot]); splitRef.current = [slot]; return handled(); }
            if (currentSplit[0] === slot) return handled();
            handlersRef.current.quickSplit([currentSplit[0], slot]);
            clearAll();
            return handled();
          }
          if (currentCursor !== null) {
            // The seat menu is open: the digit is the action.
            const action = SEAT_ACTION_DIGITS[command.digit];
            if (action) { runSeatAction(action, currentCursor); clearAll(); }
            return handled();
          }
          const slot = seatFromDigit(command.digit);
          if (!seatExists(slot)) return handled();
          if (ctx.tapPhase && !command.shift) {
            handlersRef.current.tapSeat(slot);
            return handled();
          }
          setCursor(slot);
          cursorRef.current = slot;
          return handled();
        }
        case 'seatAction': {
          if (currentCursor === null) {
            if (command.code === 'KeyA') {
              if (click('[data-testid="live-auto-toggle"]')) return handled();
            }
            return;
          }
          runSeatAction(command.action, currentCursor);
          clearAll();
          return handled();
        }
        case 'arrow': {
          const rects = readSeatRects(ctx.seats);
          let next: number | null;
          if (rects.length) next = moveSeatCursor(rects, currentCursor, command.direction);
          else {
            const ordered = [...ctx.seats].sort((a, b) => a - b);
            const index = currentCursor === null ? 0 : ordered.indexOf(currentCursor);
            const step = command.direction === 'left' || command.direction === 'up' ? -1 : 1;
            next = ordered[(index + step + ordered.length) % ordered.length] ?? null;
          }
          if (next !== null) { setCursor(next); cursorRef.current = next; }
          setSplit(null);
          splitRef.current = null;
          return handled();
        }
        case 'reveals':
          handlersRef.current.openReveals();
          clearAll();
          return handled();
        case 'primary':
          // A highlighted player: Enter opens that player's full action panel (owner, 2026-10-31).
          if (currentCursor !== null) {
            handlersRef.current.openPanel(currentCursor);
            clearAll();
            return handled();
          }
          if (click(PRIMARY)) return handled();
          return;
        case 'space': {
          if (ctx.tapPhase && currentCursor !== null) {
            handlersRef.current.tapSeat(currentCursor);
            return handled();
          }
          if (click(TIMER_TOGGLE)) return handled();
          return;
        }
        case 'back':
          if (handlersRef.current.eraseLastVote()) { clearAll(); return handled(); }
          if (click(BACK)) return handled();
          return;
        case 'split':
          if (!ctx.quickSplitAvailable) return;
          setSplit([]);
          splitRef.current = [];
          setCursor(null);
          cursorRef.current = null;
          return handled();
        case 'timerMinus': {
          const minus = Array.from(document.querySelectorAll<HTMLElement>(`${HUD} .live-judge-timer__button`)).find((element) => element.textContent?.trim() === '−10');
          if (minus) { minus.click(); return handled(); }
          return;
        }
        case 'extension':
          if (click('[data-testid="live-hud-speech-extension"]')) return handled();
          return;
        case 'mute': {
          const mute = Array.from(document.querySelectorAll<HTMLElement>(`${HUD} .live-judge-timer__button`)).find((element) => /звук/i.test(element.getAttribute('aria-label') ?? ''));
          if (mute) { mute.click(); return handled(); }
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    };
  }, []);

  return { cursor, split, helpOpen, closeHelp: () => setHelpOpen(false) };
}
