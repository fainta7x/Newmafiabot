import { useEffect, useState } from 'react';
import { MobileSheet } from '../ui/MobileSheet.tsx';

type Entry = { id: string; title: string; body: string; published_at: string | null };
const SEEN_KEY = '2la-whats-new-seen-at';

const readSeen = () => { try { return window.localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const writeSeen = (value: string) => { try { window.localStorage.setItem(SEEN_KEY, value); } catch { /* the «new» mark just comes back next time */ } };
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }) : '');

/**
 * «Что нового в приложении» on the player's home: what the organizer published in the CRM («Ещё → Что нового»).
 * A dot shows what the player has not opened yet; the card is hidden while nothing is published.
 */
export default function WhatsNewCard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(readSeen);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whats-new', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { entries: [] }))
      .then((body) => { if (!cancelled && Array.isArray(body.entries)) setEntries(body.entries); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);

  if (!entries.length) return null;
  const newest = entries[0].published_at || '';
  const unread = entries.filter((entry) => (entry.published_at || '') > seenAt).length;
  const openList = () => { setOpen(true); writeSeen(newest); setSeenAt(newest); };

  return (
    <>
      <button type="button" data-testid="player-home-whats-new" onClick={openList} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/[0.045] p-4 text-left">
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Что нового в приложении</span>
          <span className="mt-1 block truncate text-sm font-semibold text-white/90">{entries[0].title}</span>
        </span>
        {unread ? <span data-testid="whats-new-unread" className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-rose-500 px-2 text-[12px] font-black text-white">{unread}</span> : <span className="shrink-0 text-white/40">›</span>}
      </button>
      <MobileSheet open={open} onClose={() => setOpen(false)} title="Что нового" widthClass="sm:max-w-lg">
        <div className="space-y-3">
          {entries.map((entry) => (
            <article key={entry.id} data-testid="whats-new-entry" className="rounded-2xl bg-white/[0.045] p-3.5">
              <h3 className="text-[15px] font-semibold text-white">{entry.title}</h3>
              <div className="mt-0.5 text-[12px] text-white/45">{dateOf(entry.published_at)}</div>
              {entry.body ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/80">{entry.body}</p> : null}
            </article>
          ))}
        </div>
      </MobileSheet>
    </>
  );
}
