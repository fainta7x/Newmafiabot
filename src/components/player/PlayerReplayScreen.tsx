import { useEffect, useMemo, useState } from 'react';
import AsyncState from '../ui/AsyncState.tsx';

type ReplayEvent = {
  id: string;
  type: string;
  round?: number;
  title: string;
  text: string;
  players?: string[];
  player?: string | null;
  votes?: Array<{ candidate: string; candidate_name: string | null; votes: number }>;
};

type ReplayData = {
  game_key: string;
  replay_available: boolean;
  game?: { id: string; number: number; title: string; created_at: string | null; winner_team: 'red' | 'black' | null };
  players?: Array<{ participant_id: string; player_id: string | null; nickname: string; seat_number: number; role: string | null }>;
  events: ReplayEvent[];
  analysis: string[];
  meta?: { source?: string };
};

const roleLabel = (role: string | null) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : '—';
const roleIcon = (role: string | null) => role === 'citizen' ? '🔴' : role === 'sheriff' ? '⭐' : role === 'mafia' ? '⚫' : role === 'don' ? '🎩' : '🎭';
const eventIcon = (type: string) => type === 'round' ? '☀️' : type === 'nominations' ? '✋' : type === 'votes' ? '🗳️' : type === 'night' || type === 'first_killed' ? '🌙' : type === 'eliminated' ? '🚪' : type === 'ppk' ? '⚠️' : type === 'best_move' ? '🧠' : type === 'finish' ? '🏁' : '•';

export default function PlayerReplayScreen({ gameKey, onBack }: { gameKey: string; onBack?: () => void }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/player/games/${encodeURIComponent(gameKey)}/replay`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить Replay');
        if (!cancelled) {
          setData(body as ReplayData);
          setStep(0);
        }
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить Replay'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameKey]);

  useEffect(() => {
    if (!playing || !data?.events.length) return;
    if (step >= data.events.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((value) => Math.min(data.events.length - 1, value + 1)), 1800);
    return () => window.clearTimeout(timer);
  }, [playing, step, data]);

  const visibleEvents = useMemo(() => data?.events.slice(0, step + 1) || [], [data, step]);
  const current = data?.events[step] || null;
  const goBack = onBack || (() => window.history.back());

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="loading" icon="🎬" title="Восстанавливаем партию…" description="Собираем сохранённую хронологию игры." /></div></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="error" icon="⚠️" title="Replay недоступен" description={error || 'Не удалось загрузить сохранённую игру.'} actionLabel="Назад" onAction={goBack} /></div></main>;

  if (!data.replay_available) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="empty" icon="📼" title="Подробного Replay нет" description={data.analysis.join(' ') || 'Для этой игры нет полной пошаговой хронологии.'} actionLabel="Назад" onAction={goBack} /></div></main>;

  return <main className="min-h-screen bg-[#090a0d] px-3 pb-12 pt-3 text-white">
    <div className="mx-auto w-full max-w-[520px]">
      <div className="flex items-center justify-between gap-3"><button type="button" onClick={goBack} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/55">←</button><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">Replay · завершённая игра</div><div className="h-11 w-11" /></div>

      <section className="mt-3 rounded-[26px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.025] p-4 text-center"><div className="text-[10px] uppercase tracking-[0.15em] text-white/25">{data.game?.title}</div><h1 className="mt-1 text-2xl font-black">Игра №{data.game?.number || '—'}</h1><div className={`mt-3 text-lg font-black ${data.game?.winner_team === 'red' ? 'text-rose-300' : 'text-white'}`}>{data.game?.winner_team === 'red' ? '🔴 Победа красных' : data.game?.winner_team === 'black' ? '⚫ Победа чёрных' : 'Игра завершена'}</div></section>

      {data.players?.length ? <section className="mt-3 rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/25">Раскрытый состав</div><div className="mt-2 grid grid-cols-2 gap-1.5">{data.players.map((player) => <div key={`${player.seat_number}:${player.nickname}`} className="flex items-center gap-2 rounded-xl bg-black/15 px-2.5 py-2"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-[10px] font-black">{player.seat_number}</div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold">{player.nickname}</div><div className="text-[8px] text-white/25">{roleIcon(player.role)} {roleLabel(player.role)}</div></div></div>)}</div></section> : null}

      <section className="mt-3 rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/25">Хронология</div><div className="mt-1 text-xs text-white/35">Шаг {Math.min(step + 1, data.events.length)} из {data.events.length}</div></div><button type="button" disabled={data.events.length < 2} onClick={() => setPlaying((value) => !value)} className="min-h-10 rounded-xl bg-white px-3 text-[10px] font-bold text-black disabled:opacity-40">{playing ? 'Пауза' : step >= data.events.length - 1 ? 'С начала ▶' : 'Авто ▶'}</button></div>

        {current && <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-center"><div className="text-3xl">{eventIcon(current.type)}</div><div className="mt-2 text-base font-black">{current.title}</div><div className="mt-1 text-xs leading-5 text-white/40">{current.text}</div></div>}

        <input type="range" min={0} max={Math.max(0, data.events.length - 1)} value={step} onChange={(event) => { setPlaying(false); setStep(Number(event.target.value)); }} className="mt-4 w-full accent-white" />
        <div className="mt-4 space-y-1.5">{visibleEvents.map((event, index) => <button key={event.id} type="button" onClick={() => { setPlaying(false); setStep(index); }} className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left ${index === step ? 'bg-white/[0.09]' : 'bg-black/10'}`}><div className="mt-0.5 text-sm">{eventIcon(event.type)}</div><div className="min-w-0 flex-1"><div className="text-[10px] font-semibold">{event.title}</div><div className="mt-0.5 text-[9px] leading-3 text-white/28">{event.text}</div></div>{event.round != null && <div className="text-[8px] text-white/18">круг {event.round}</div>}</button>)}</div>
      </section>

      <section className="mt-3 rounded-[24px] border border-sky-200/10 bg-sky-200/[0.035] p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100/40">🧠 Авторазбор партии</div><div className="mt-3 space-y-2">{data.analysis.map((item, index) => <div key={index} className="rounded-xl bg-black/15 px-3 py-2 text-[10px] leading-4 text-white/40">{item}</div>)}</div><p className="mt-3 text-[8px] leading-3 text-white/18">Авторазбор выделяет только факты сохранённого протокола. Он не оценивает скрытые мотивы и не выдаёт субъективные решения за истину.</p></section>

      <p className="mt-4 text-center text-[8px] leading-3 text-white/15">{data.meta?.source}</p>
    </div>
  </main>;
}
