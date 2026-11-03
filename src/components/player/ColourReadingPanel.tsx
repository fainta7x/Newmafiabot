import { useEffect, useState } from 'react';
import type { ColourReadingListKey } from '../../lib/colourReading.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar';

/** «Читать цвет» in «Обучение» (owner-approved mock-up, 2026-11-03): a switch of four tabs, top-3 cards. */
type Entry = { playerId: string; nickname: string; count: number };
type Data = { games: number; lists: Record<ColourReadingListKey, Entry[]> };
type Card = { key: ColourReadingListKey; title: string; tone: 'good' | 'bad'; unit: string };

const TABS: Array<{ id: string; label: string; hint: string; cards: Card[] }> = [
  { id: 'mine', label: 'Мои голоса', hint: 'Твои голоса, когда ты красный.', cards: [
    { key: 'mine_correct', title: 'В кого голосуешь правильно', tone: 'good', unit: 'голоса в чёрного' },
    { key: 'mine_wrong', title: 'В кого голосуешь неправильно', tone: 'bad', unit: 'голоса в красного' },
    { key: 'mine_don', title: 'В кого голосуешь, когда он дон', tone: 'good', unit: 'голоса в дона' },
    { key: 'mine_sheriff', title: 'В кого голосуешь, когда он шериф', tone: 'bad', unit: 'голоса в шерифа — самая тяжёлая ошибка' },
  ] },
  { id: 'me', label: 'Голоса в меня', hint: 'Кто голосует в тебя: правильно — когда ты чёрный, неправильно — когда ты красный.', cards: [
    { key: 'me_correct', title: 'Кто в тебя голосует правильно', tone: 'good', unit: 'ты был чёрным' },
    { key: 'me_wrong', title: 'Кто в тебя голосует неправильно', tone: 'bad', unit: 'ты был красным' },
  ] },
  { id: 'mafia', label: 'Я мафия', hint: 'Игры, где ты мафия.', cards: [
    { key: 'mafia_against', title: 'Кто тебе меньше всех верит', tone: 'bad', unit: 'голосует в тебя' },
    { key: 'mafia_with', title: 'Кто чаще голосует вместе с тобой', tone: 'good', unit: 'голосует как ты' },
  ] },
  { id: 'don', label: 'Я дон', hint: 'Игры, где ты дон.', cards: [
    { key: 'don_against', title: 'Кто тебе меньше всех верит', tone: 'bad', unit: 'голосует в тебя' },
    { key: 'don_with', title: 'Кто чаще голосует вместе с тобой', tone: 'good', unit: 'голосует как ты' },
  ] },
];

const toneText = { good: 'text-emerald-400', bad: 'text-rose-400' } as const;
const toneBar = { good: 'bg-emerald-400', bad: 'bg-rose-400' } as const;

function TopCard({ card, entries }: { card: Card; entries: Entry[] }) {
  const max = entries[0]?.count || 1;
  return (
    <section data-testid={`colour-reading-${card.key}`} className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
      <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 shrink-0 rounded-full ${toneBar[card.tone]}`} />{card.title}</h4>
      {!entries.length ? <p className="px-1 pb-1 text-xs text-white/50">Пока нет голосов.</p> : null}
      {entries.map((entry, index) => (
        <div key={entry.playerId} className={index === 0 ? 'mb-1.5 flex items-center gap-2.5 rounded-xl bg-white/[.05] p-2.5' : 'flex items-center gap-2.5 px-2.5 py-1.5'}>
          <PlayerAvatar playerId={entry.playerId} nickname={entry.nickname} size={index === 0 ? 'sm' : 'xs'} />
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-semibold leading-snug">{entry.nickname}</div>
            {index === 0 ? <div className="text-[11px] leading-snug text-white/50">{card.unit}</div> : null}
            <div className="mt-1 h-1 rounded-full bg-white/10"><div className={`h-full rounded-full ${toneBar[card.tone]}`} style={{ width: `${Math.max(6, (entry.count / max) * 100)}%` }} /></div>
          </div>
          <span className={`shrink-0 font-bold tabular-nums ${toneText[card.tone]} ${index === 0 ? 'text-2xl' : 'text-base'}`}>{entry.count}</span>
        </div>
      ))}
    </section>
  );
}

export default function ColourReadingPanel({ url }: { url: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(TABS[0].id);
  useEffect(() => {
    let active = true;
    setData(null); setFailed(false);
    fetch(url, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body) => { if (active) setData(body); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [url]);
  const current = TABS.find((item) => item.id === tab) || TABS[0];
  return (
    <section data-testid="colour-reading" className="space-y-3">
      <div className="px-1">
        <h3 className="text-lg font-semibold">Читать цвет</h3>
        <p className="mt-0.5 text-xs leading-5 text-white/50">Попилы не учитываются · по количеству голосов{data ? ` · игр с записью голосов: ${data.games}` : ''}</p>
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[.035] p-1 sm:grid-cols-4">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} data-testid={`colour-reading-tab-${item.id}`} onClick={() => setTab(item.id)}
            className={`min-h-11 rounded-xl px-2 text-[13px] font-semibold ${item.id === tab ? 'bg-rose-600 text-white' : 'text-white/60'}`}>{item.label}</button>
        ))}
      </div>
      <p className="px-1 text-xs text-white/50">{current.hint}</p>
      {failed ? <p className="px-1 text-sm text-white/60">Не удалось загрузить статистику.</p> : null}
      {!data && !failed ? <p className="px-1 text-sm text-white/50">Загружаем…</p> : null}
      {data ? <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">{current.cards.map((card) => <TopCard key={card.key} card={card} entries={data.lists[card.key] || []} />)}</div> : null}
    </section>
  );
}
