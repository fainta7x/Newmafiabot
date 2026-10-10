import { useEffect, useState } from 'react';
import { countGames, countWins } from '../../lib/russianPlural';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type Person = { player_id: string; nickname: string; games: number; wins: number; win_rate: number; avatar_url: string };
type RecentEvent = { title: string; date: string; teammates: Person[]; rivals: Person[] };

function Row({ item, kind }: { item: Person; kind: 'mate' | 'rival' }) {
  const tone = kind === 'rival' ? 'border-rose-200/[0.07] bg-rose-300/[0.035]' : 'border-emerald-200/[0.07] bg-emerald-300/[0.035]';
  return (
    <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id)} className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left ${tone}`}>
      {item.avatar_url
        ? <img src={item.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
        : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/45">{item.nickname.slice(0, 1).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{item.nickname}</div>
        <div className="mt-0.5 text-[11px] text-white/45">{countGames(item.games)}{kind === 'mate' ? ' в одной команде' : ' друг против друга'} · {countWins(item.wins)} твоей команды</div>
      </div>
    </button>
  );
}

/** «С последнего вечера»: who the player sat with at the last finished evening or tournament. */
export default function PersonalRecentEvening() {
  const [event, setEvent] = useState<RecentEvent | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/relationships', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled) setEvent(body?.recent_event || null); })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, []);

  if (!event) return null;
  const when = new Date(event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  return (
    <section data-testid="personal-recent-evening" className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">С последнего вечера</div>
      <h2 className="mt-1 text-base font-semibold">{event.title}</h2>
      <p className="mt-0.5 text-xs text-white/45">{when}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([['teammates', 'Были в одной команде', 'mate'], ['rivals', 'Были соперниками', 'rival']] as const).map(([key, label, kind]) => (
          <div key={key}>
            <h3 className="mb-2 text-xs font-semibold text-white/65">{label}</h3>
            <div className="space-y-2">{event[key].map((item) => <Row key={item.player_id} item={item} kind={kind} />)}</div>
            {!event[key].length && <p className="text-xs text-white/40">Таких игр не было.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
