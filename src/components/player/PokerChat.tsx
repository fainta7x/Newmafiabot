import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { POKER_EMOTES, pokerEmoteById } from '../../shared/pokerEmotes.ts';

export type PokerChatMessage = { id: number; player_id: string; nickname: string; kind: 'text' | 'emote'; body: string; age_ms: number };

const EMOTE_SHOWN_MS = 3800;
const TEXT_SHOWN_MS = 5500;
const MUTE_KEY = 'poker-chat-muted';

const readMuted = () => { try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };
const writeMuted = (value: boolean) => { try { window.localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* the choice just is not remembered */ } };

/** Keeps the chat of the open table and when each message reached this device (the server's clock may differ). */
export function usePokerChat() {
  const [messages, setMessages] = useState<PokerChatMessage[]>([]);
  const created = useRef(new Map<number, number>());
  const ingest = (list: PokerChatMessage[]) => {
    const now = Date.now();
    for (const message of list) if (!created.current.has(message.id)) created.current.set(message.id, now - message.age_ms);
    setMessages(list);
  };
  const reset = () => { created.current.clear(); setMessages([]); };
  return { messages, ingest, reset, createdAt: (id: number) => created.current.get(id) ?? 0 };
}

/** Emotes and short texts drawn over the seat of whoever sent them, for a few seconds. */
export function PokerChatBubbles({ messages, createdAt, players, layout, muted }: {
  messages: PokerChatMessage[]; createdAt: (id: number) => number;
  players: Array<{ id: string }>; layout: Array<{ x: number; y: number }>; muted: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick((value) => value + 1), 400); return () => window.clearInterval(timer); }, []);
  if (muted) return null;
  const now = Date.now();
  // Only the newest message of each person is drawn, so a busy table does not pile up.
  const latest = new Map<string, PokerChatMessage>();
  for (const message of messages) latest.set(message.player_id, message);
  return (
    <>
      {[...latest.values()].map((message) => {
        const age = now - createdAt(message.id);
        const index = players.findIndex((player) => player.id === message.player_id);
        const spot = layout[index];
        if (!spot || age > (message.kind === 'emote' ? EMOTE_SHOWN_MS : TEXT_SHOWN_MS)) return null;
        const emote = message.kind === 'emote' ? pokerEmoteById(message.body) : null;
        // Seats along the top edge would lose the bubble above them, so it goes under their plaque.
        const nearTop = spot.y < 28;
        return (
          <div key={message.id} data-testid={emote ? 'poker-emote' : 'poker-chat-bubble'} className={`pointer-events-none absolute z-[24] -translate-x-1/2 ${nearTop ? '' : '-translate-y-full'}`} style={{ left: `${Math.min(84, Math.max(16, spot.x))}%`, top: nearTop ? `calc(${spot.y}% + 62px)` : `calc(${spot.y}% - 26px)` }}>
            {emote ? (
              <div className={`poker-emote poker-emote--${emote.anim} ${emote.tone === 'taunt' ? 'is-taunt' : ''}`}>
                <span className="poker-emote__glyph" aria-hidden="true">{emote.emoji}</span>
                <span className="poker-emote__label">{emote.label}</span>
              </div>
            ) : (
              <div className="poker-chat-bubble">{message.body}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** A wide screen has room for the chat beside the table, so it stays open there instead of covering the game. */
const WIDE_QUERY = '(min-width: 1120px)';
const useWideScreen = () => {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return wide;
};

/**
 * The chat of the table (owner, 2026-10-12: it must not cover the game). On a phone it is a small panel just above the action
 * buttons — no dimming, the table and the buttons stay usable while it is open. On a wide screen it is a column beside the table.
 */
export function PokerChatDock({ messages, viewerId, canPost, muted, onMutedChange, onSend, slot }: {
  messages: PokerChatMessage[]; viewerId: string | null; canPost: boolean; muted: boolean;
  onMutedChange: (muted: boolean) => void; onSend: (payload: { text?: string; emote?: string }) => Promise<void> | void;
  /** Where a phone puts the open panel: inside the block above the action buttons, so the table shrinks to make room instead of being covered. */
  slot?: HTMLElement | null;
}) {
  const wide = useWideScreen();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [text, setText] = useState('');
  const [readUpTo, setReadUpTo] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const newest = messages.length ? messages[messages.length - 1].id : 0;
  const visible = wide || open;
  const listShown = wide || showList;
  useEffect(() => {
    if (!visible) return;
    setReadUpTo(newest);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible, listShown, newest]);
  const unread = muted || visible ? 0 : messages.filter((message) => message.id > readUpTo && message.player_id !== viewerId).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    await onSend({ text: value });
  };

  const toggleButton = (testId: string, label: string, pressed: boolean, onClick: () => void) => (
    <button type="button" data-testid={testId} aria-pressed={pressed} onClick={onClick} className="min-h-9 rounded-xl border border-white/10 px-2.5 text-xs text-white/75">{label}</button>
  );

  const panel = (
    <section data-testid="poker-chat-sheet" className={wide
      ? 'fixed right-4 top-[72px] z-[45] flex w-[300px] flex-col gap-2 overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#101312]/95 p-3 shadow-2xl'
      : slot ? 'mb-2 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#101312] p-2'
        : 'fixed inset-x-2 z-[45] mx-auto flex max-w-[430px] flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#101312]/95 p-2 shadow-2xl backdrop-blur'}
    style={wide ? { bottom: 'calc(env(safe-area-inset-bottom) + 190px)' } : slot ? undefined : { bottom: 'calc(env(safe-area-inset-bottom) + 184px)' }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Чат стола</h2>
        <div className="flex items-center gap-1.5">
          {wide ? null : toggleButton('poker-chat-history', 'История', showList, () => setShowList((value) => !value))}
          {toggleButton('poker-chat-mute', muted ? 'Включить' : 'Выключить', muted, () => onMutedChange(!muted))}
          {wide ? null : <button type="button" aria-label="Закрыть чат" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/70">✕</button>}
        </div>
      </div>
      {muted ? <p className="rounded-xl bg-white/[.05] p-2.5 text-xs text-white/55">Чат выключен: сообщения и эмоции других игроков не показываются.</p> : listShown ? (
        <div ref={listRef} className={`${wide ? 'min-h-[84px] flex-1' : 'max-h-[22dvh] min-h-[56px] shrink-0'} space-y-1 overflow-y-auto rounded-2xl bg-black/30 p-2 text-sm`}>
          {messages.length === 0 ? <p className="p-2 text-center text-xs text-white/40">Пока тихо</p> : messages.map((message) => {
            const emote = message.kind === 'emote' ? pokerEmoteById(message.body) : null;
            return (
              <p key={message.id} className="break-words">
                <b className={message.player_id === viewerId ? 'text-amber-200' : 'text-white/80'}>{message.player_id === viewerId ? 'Я' : message.nickname}:</b>{' '}
                {emote ? <span>{emote.emoji} {emote.label}</span> : <span className="text-white/80">{message.body}</span>}
              </p>
            );
          })}
        </div>
      ) : null}
      {canPost ? (
        <>
          <div className={wide ? 'grid shrink-0 grid-cols-4 gap-1.5' : 'flex gap-1.5 overflow-x-auto pb-0.5'} data-testid="poker-emote-board">
            {POKER_EMOTES.map((emote) => (
              <button key={emote.id} type="button" data-testid={`poker-emote-${emote.id}`} onClick={() => void onSend({ emote: emote.id })} className={`flex min-h-12 shrink-0 flex-col items-center justify-center rounded-xl border px-2 ${wide ? '' : 'min-w-[68px]'} ${emote.tone === 'taunt' ? 'border-rose-300/25 bg-rose-300/[.06]' : 'border-white/10 bg-white/[.04]'}`}>
                <span className="text-xl" aria-hidden="true">{emote.emoji}</span>
                <span className="text-[10px] text-white/70">{emote.label}</span>
              </button>
            ))}
          </div>
          <form onSubmit={(event) => void submit(event)} className="flex shrink-0 gap-2">
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={140} placeholder="Написать за стол…" aria-label="Сообщение за стол" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] px-4 text-xs font-black text-black">Отправить</button>
          </form>
        </>
      ) : <p className="text-center text-xs text-white/45">Писать могут только игроки за этим столом</p>}
    </section>
  );

  return (
    <>
      {wide || open ? null : (
        <button
          type="button"
          data-testid="poker-chat-open"
          aria-label={unread ? `Чат, новых сообщений: ${unread}` : 'Чат и эмоции'}
          onClick={() => setOpen(true)}
          className="fixed right-3 z-[45] grid h-12 w-12 place-items-center rounded-full border border-amber-200/30 bg-[#17130c]/90 text-xl shadow-xl"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 190px)' }}
        >
          <span aria-hidden="true">💬</span>
          {unread ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{unread}</span> : null}
        </button>
      )}
      {visible ? (!wide && slot ? createPortal(panel, slot) : panel) : null}
    </>
  );
}

export { readMuted as readPokerChatMuted, writeMuted as writePokerChatMuted };
