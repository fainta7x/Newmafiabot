import { useEffect, useRef, useState, type FormEvent } from 'react';
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

/** The chat button and its sheet: the last messages, a line to write and the emote board. */
export function PokerChatDock({ messages, viewerId, canPost, muted, onMutedChange, onSend }: {
  messages: PokerChatMessage[]; viewerId: string | null; canPost: boolean; muted: boolean;
  onMutedChange: (muted: boolean) => void; onSend: (payload: { text?: string; emote?: string }) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [readUpTo, setReadUpTo] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const newest = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    if (!open) return;
    setReadUpTo(newest);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, newest]);
  const unread = muted || open ? 0 : messages.filter((message) => message.id > readUpTo && message.player_id !== viewerId).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    await onSend({ text: value });
  };

  return (
    <>
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
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 px-3 pt-10 backdrop-blur-sm" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }} onClick={() => setOpen(false)}>
          <section data-testid="poker-chat-sheet" className="mx-auto flex max-h-[78dvh] w-full max-w-[430px] flex-col gap-2 rounded-3xl border border-white/10 bg-[#101312] p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Чат стола</h2>
              <div className="flex items-center gap-2">
                <button type="button" data-testid="poker-chat-mute" aria-pressed={muted} onClick={() => onMutedChange(!muted)} className="min-h-10 rounded-xl border border-white/10 px-3 text-xs text-white/70">{muted ? 'Включить чат' : 'Выключить чат'}</button>
                <button type="button" aria-label="Закрыть чат" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/70">✕</button>
              </div>
            </div>
            {muted ? <p className="rounded-xl bg-white/[.05] p-3 text-xs text-white/55">Чат выключен: сообщения и эмоции других игроков не показываются.</p> : (
              <div ref={listRef} className="min-h-[96px] flex-1 space-y-1 overflow-y-auto rounded-2xl bg-black/30 p-2 text-sm">
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
            )}
            {canPost ? (
              <>
                <div className="grid grid-cols-3 gap-1.5" data-testid="poker-emote-board">
                  {POKER_EMOTES.map((emote) => (
                    <button key={emote.id} type="button" data-testid={`poker-emote-${emote.id}`} onClick={() => void onSend({ emote: emote.id })} className={`flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 py-1 text-center leading-tight ${emote.tone === 'taunt' ? 'border-rose-300/20 bg-rose-300/[.06]' : 'border-emerald-300/20 bg-emerald-300/[.06]'}`}>
                      <span className="text-xl" aria-hidden="true">{emote.emoji}</span>
                      <span className="text-[10px] text-white/70">{emote.label}</span>
                    </button>
                  ))}
                </div>
                <form onSubmit={(event) => void submit(event)} className="flex gap-2">
                  <input value={text} onChange={(event) => setText(event.target.value)} maxLength={140} placeholder="Написать за стол…" aria-label="Сообщение за стол" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-amber-200/40" />
                  <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] px-4 text-xs font-black text-black">Отправить</button>
                </form>
              </>
            ) : <p className="text-center text-xs text-white/45">Писать могут только игроки за этим столом</p>}
          </section>
        </div>
      ) : null}
    </>
  );
}

export { readMuted as readPokerChatMuted, writeMuted as writePokerChatMuted };
