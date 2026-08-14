import { useEffect, useMemo, useState } from 'react';

type EloEvent = {
  id: string;
  source: 'club' | 'tournament';
  date: string;
  title: string;
  game_number: number;
  team: 'red' | 'black';
  won: boolean;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  expected_percent: number;
  base_team_delta: number;
  carry_modifier: number;
  carry_effect: number;
  team_delta: number;
  personal_game_points: number;
  personal_delta: number;
  explanation: { headline: string; details: string[]; formula: string };
};

type PreviewOutcome = { expected_percent: number; elo_delta: number; team_delta: number; carry_modifier: number } | null;
type EloJourneyData = {
  player: { id: string; nickname: string; elo: number; seed: number };
  summary: { games: number; current: number; computed_current: number; peak: number; floor: number; net: number; last_delta: number };
  preview: {
    basis: string;
    red: { win: PreviewOutcome; loss: PreviewOutcome };
    black: { win: PreviewOutcome; loss: PreviewOutcome };
  };
  events: EloEvent[];
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const dateText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
};

function JourneyChart({ seed, events }: { seed: number; events: EloEvent[] }) {
  const values = [seed, ...events.map((event) => event.elo_after)];
  if (values.length < 2) return <div className="grid h-32 place-items-center text-xs text-white/25">График появится после первой рейтинговой игры</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(20, max - min);
  const pad = Math.max(8, range * 0.12);
  const low = min - pad;
  const high = max + pad;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 180 : 12 + (index / (values.length - 1)) * 336;
    const y = 126 - ((value - low) / (high - low)) * 110;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black/20 px-2 py-2">
      <svg viewBox="0 0 360 140" className="h-36 w-full" role="img" aria-label="График изменения Elo">
        <line x1="12" y1="16" x2="348" y2="16" stroke="currentColor" className="text-white/[0.06]" />
        <line x1="12" y1="71" x2="348" y2="71" stroke="currentColor" className="text-white/[0.06]" />
        <line x1="12" y1="126" x2="348" y2="126" stroke="currentColor" className="text-white/[0.06]" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-200" />
        {values.map((value, index) => {
          const [x, y] = points.split(' ')[index].split(',').map(Number);
          return <circle key={`${index}:${value}`} cx={x} cy={y} r={index === values.length - 1 ? 4 : 2.5} fill="currentColor" className={index === values.length - 1 ? 'text-amber-100' : 'text-white/55'} />;
        })}
      </svg>
      <div className="absolute left-3 top-2 text-[8px] text-white/20">{Math.round(high)}</div>
      <div className="absolute bottom-2 left-3 text-[8px] text-white/20">{Math.round(low)}</div>
    </div>
  );
}

export default function PlayerEloJourney({
  onBack,
  onOpenGame,
  embedded = false,
}: {
  onBack?: () => void;
  onOpenGame?: (gameId: string) => void;
  embedded?: boolean;
}) {
  const [data, setData] = useState<EloJourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<'red' | 'black'>('red');
  const [showAll, setShowAll] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/elo-journey', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить Elo-карьеру');
        if (!cancelled) setData(body as EloJourneyData);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить Elo-карьеру'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const newest = useMemo(() => data ? data.events.slice().reverse() : [], [data]);

  if (loading) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] text-white`}><div className="text-center"><div className="text-3xl">📈</div><div className="mt-2 text-xs text-white/30">Строим Elo-карьеру…</div></div></main>;
  if (error || !data) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] px-4 text-white`}><div className="w-full max-w-[430px] rounded-3xl border border-rose-200/10 bg-rose-200/[0.04] p-5 text-center"><div className="text-sm font-semibold">{error || 'Elo-карьера недоступна'}</div>{onBack && <button type="button" onClick={onBack} className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black">Назад</button>}</div></main>;

  const preview = data.preview[team];
  const events = showAll ? newest : newest.slice(0, 8);

  return (
    <main className={`min-h-screen bg-[#090a0d] px-3 pb-28 ${embedded ? 'pt-2' : 'pt-3'} text-white`}>
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        {!embedded && <div className="flex items-start gap-3 px-1 pt-1">
          {onBack && <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/55">←</button>}
          <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/40">Elo-карьера</div><h1 className="mt-1 text-2xl font-semibold">Почему рейтинг меняется</h1><p className="mt-1 text-xs leading-5 text-white/40">Каждая партия раскладывается на командный результат, силу состава и личные игровые баллы.</p></div>
        </div>}

        <section className="rounded-[28px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.07] to-white/[0.025] p-4">
          <div className="flex items-end justify-between gap-3"><div><div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Текущий Elo</div><div className="mt-1 text-4xl font-black">{Math.round(data.summary.current)}</div></div><div className={`text-right text-lg font-black ${data.summary.net > 0 ? 'text-emerald-300' : data.summary.net < 0 ? 'text-rose-300' : 'text-white/50'}`}>{signed(data.summary.net)}<div className="mt-0.5 text-[9px] font-medium text-white/25">от старта {Math.round(data.player.seed)}</div></div></div>
          <div className="mt-4"><JourneyChart seed={data.player.seed} events={data.events} /></div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{Math.round(data.summary.peak)}</div><div className="text-[8px] text-white/25">пик</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{Math.round(data.summary.floor)}</div><div className="text-[8px] text-white/25">минимум</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.summary.games}</div><div className="text-[8px] text-white/25">игр в Elo</div></div></div>
        </section>

        <section className="rounded-[24px] border border-sky-200/10 bg-sky-200/[0.03] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-100/40">Что если следующая игра?</div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1"><button type="button" onClick={() => setTeam('red')} className={`min-h-10 rounded-lg text-xs font-semibold ${team === 'red' ? 'bg-white text-black' : 'text-white/45'}`}>🔴 За красных</button><button type="button" onClick={() => setTeam('black')} className={`min-h-10 rounded-lg text-xs font-semibold ${team === 'black' ? 'bg-white text-black' : 'text-white/45'}`}>⚫ За чёрных</button></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-emerald-300/[0.07] p-3"><div className="text-[9px] text-emerald-100/45">Если победа</div><div className="mt-1 text-2xl font-black text-emerald-300">{preview.win ? signed(preview.win.elo_delta) : '—'}</div><div className="mt-1 text-[9px] text-white/25">шанс команды {preview.win?.expected_percent ?? '—'}%</div></div><div className="rounded-2xl bg-rose-300/[0.07] p-3"><div className="text-[9px] text-rose-100/45">Если поражение</div><div className="mt-1 text-2xl font-black text-rose-300">{preview.loss ? signed(preview.loss.elo_delta) : '—'}</div><div className="mt-1 text-[9px] text-white/25">шанс команды {preview.loss?.expected_percent ?? '—'}%</div></div></div>
          <p className="mt-3 text-[9px] leading-4 text-white/25">Ориентир, а не обещание результата. {data.preview.basis} Реальная десятка и личные баллы изменят итог.</p>
        </section>

        <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="flex items-end justify-between gap-3 px-1"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">История изменений</div><div className="mt-0.5 text-[9px] text-white/20">Нажми на игру — покажу формулу</div></div>{newest.length > 8 && <button type="button" onClick={() => setShowAll((value) => !value)} className="text-[9px] font-semibold text-white/35">{showAll ? 'Свернуть' : `Все ${newest.length}`}</button>}</div>
          <div className="mt-3 space-y-1.5">{events.length ? events.map((event) => {
            const open = openEvent === event.id;
            return <div key={event.id} className="overflow-hidden rounded-2xl bg-black/20"><button type="button" onClick={() => setOpenEvent(open ? null : event.id)} className="flex w-full items-center gap-3 p-3 text-left"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${event.won ? 'bg-emerald-300/10' : 'bg-rose-300/10'}`}>{event.won ? '✓' : '×'}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{event.title}</div><div className="mt-0.5 text-[9px] text-white/25">{dateText(event.date)} · {event.team === 'red' ? '🔴 красные' : '⚫ чёрные'} · шанс {event.expected_percent}%</div></div><div className="shrink-0 text-right"><div className={`text-sm font-black ${event.elo_delta > 0 ? 'text-emerald-300' : event.elo_delta < 0 ? 'text-rose-300' : 'text-white/45'}`}>{signed(event.elo_delta)}</div><div className="text-[8px] text-white/20">{Math.round(event.elo_before)} → {Math.round(event.elo_after)}</div></div></button>{open && <div className="border-t border-white/[0.05] px-3 pb-3 pt-2"><div className="text-xs font-semibold">{event.explanation.headline}</div><div className="mt-2 space-y-1">{event.explanation.details.map((detail) => <div key={detail} className="text-[10px] leading-4 text-white/35">• {detail}</div>)}</div><div className="mt-2 rounded-xl bg-white/[0.04] px-2.5 py-2 font-mono text-[10px] text-white/45">{event.explanation.formula}</div>{onOpenGame && <button type="button" onClick={() => onOpenGame(event.id)} className="mt-2 text-[10px] font-semibold text-white/40">Открыть протокол ›</button>}</div>}</div>;
          }) : <div className="px-3 py-8 text-center text-xs text-white/25">Рейтинговых игр пока нет.</div>}</div>
        </section>
      </div>
    </main>
  );
}
