import { useCallback, useEffect, useState } from 'react';

type EveningInfo = {
  id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  format: string;
  default_price?: number | null;
};

type LivePlayer = { seat_number: number; player_id: string | null; nickname: string };
type LiveGame = {
  id: number;
  game_key: string;
  local_number: number;
  global_number: number;
  table_name: string | null;
  judge_name: string | null;
  created_at: string | null;
  status: 'draft' | 'completed';
  winner_team: 'red' | 'black' | null;
  players: LivePlayer[];
};

type LiveJourney = {
  phase: 'live';
  evening: EveningInfo;
  participation: {
    response_status: string;
    attendance_status: string;
    state: 'playing' | 'waiting' | 'expected' | 'watching';
    seat_number: number | null;
  };
  score: { red: number; black: number; completed: number; total_created: number };
  present_count: number;
  current_game: LiveGame | null;
  recent_results: Array<{
    id: number;
    game_key: string;
    local_number: number;
    winner_team: 'red' | 'black' | null;
    table_name: string | null;
    judge_name: string | null;
    self_played: boolean;
    self_won: boolean | null;
  }>;
  latest_self_game: { game_key: string; local_number: number; won: boolean | null } | null;
};

type UpcomingJourney = {
  phase: 'upcoming';
  evening: EveningInfo;
  participation: { response_status: string; attendance_status: string };
  attending_count: number;
  thinking_count: number;
};

type RecapJourney = {
  phase: 'recap';
  recap: {
    id: string;
    title: string;
    starts_at: string;
    settled_at: string | null;
    venue: string | null;
    games: number;
    red_wins: number;
    black_wins: number;
    score: string;
    player: { games: number; wins: number; losses: number; win_rate: number; elo_delta: number };
    facts: string[];
    game_ids: string[];
  };
};

type EveningJourney = LiveJourney | UpcomingJourney | RecapJourney | { phase: 'idle' };

type ResponseStatus = 'going' | 'late' | 'thinking' | 'declined';

const responseOptions: Array<{ id: ResponseStatus; label: string }> = [
  { id: 'going', label: '✅ Иду' },
  { id: 'late', label: '⏳ Позже' },
  { id: 'thinking', label: '🤔 Думаю' },
  { id: 'declined', label: '❌ Не иду' },
];

const responseLabel = (value: string) => value === 'going'
  ? 'Ты идёшь'
  : value === 'late'
    ? 'Придёшь позже'
    : value === 'thinking'
      ? 'Пока думаешь'
      : value === 'declined'
        ? 'Не идёшь'
        : 'Нужен ответ';

const dateTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

const winnerText = (winner: 'red' | 'black' | null) => winner === 'red' ? '🔴 Красные' : winner === 'black' ? '⚫ Чёрные' : 'Результат';

function JourneySteps({ phase }: { phase: 'upcoming' | 'live' | 'recap' }) {
  const current = phase === 'upcoming' ? 0 : phase === 'live' ? 2 : 3;
  const steps = ['Запись', 'Сегодня', 'Игра', 'Итог'];
  return <div className="grid grid-cols-4 gap-1.5">{steps.map((label, index) => (
    <div key={label} className="min-w-0 text-center">
      <div className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-[9px] font-black ${index < current ? 'bg-emerald-400/80 text-black' : index === current ? 'bg-white text-black' : 'bg-white/[0.06] text-white/25'}`}>{index < current ? '✓' : index + 1}</div>
      <div className={`mt-1 truncate text-[8px] font-semibold ${index === current ? 'text-white/70' : 'text-white/25'}`}>{label}</div>
    </div>
  ))}</div>;
}

export default function PlayerLiveCenter() {
  const [journey, setJourney] = useState<EveningJourney | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingResponse, setSavingResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/player/evening-journey', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      setJourney((body?.journey || { phase: 'idle' }) as EveningJourney);
      setUpdatedAt(new Date());
      setError(null);
      if (body?.journey?.phase === 'idle') setOpen(false);
    } catch {
      if (!silent) setError('Не удалось обновить состояние вечера');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 20_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const navigate = (path: string) => {
    setOpen(false);
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const respond = async (status: ResponseStatus) => {
    if (journey?.phase !== 'upcoming' || savingResponse) return;
    setSavingResponse(true);
    setError(null);
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(journey.evening.id)}/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_status: status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить ответ');
      await refresh(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить ответ');
    } finally {
      setSavingResponse(false);
    }
  };

  if (!journey || journey.phase === 'idle') return null;

  const isLive = journey.phase === 'live';
  const isRecap = journey.phase === 'recap';
  const title = isRecap ? journey.recap.title : journey.evening.title;
  const compactMeta = journey.phase === 'upcoming'
    ? `${dateTime(journey.evening.starts_at)} · ${responseLabel(journey.participation.response_status)}`
    : journey.phase === 'live'
      ? journey.participation.state === 'playing'
        ? `Ты за столом · место ${journey.participation.seat_number}`
        : journey.current_game ? `Игра ${journey.current_game.local_number} · ${journey.score.completed} завершено` : `Между играми · ${journey.score.completed} завершено`
      : `Вечер завершён · твой результат ${journey.recap.player.wins}/${journey.recap.player.games}`;

  return <>
    <button
      type="button"
      onClick={() => { setOpen(true); void refresh(true); }}
      className={`fixed bottom-[154px] left-1/2 z-40 flex w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl ${isLive ? 'border-rose-400/25 bg-[#171318]/95' : isRecap ? 'border-amber-200/20 bg-[#171612]/95' : 'border-white/10 bg-[#15161b]/95'}`}
    >
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${isLive ? 'bg-rose-500/15 text-rose-300' : isRecap ? 'bg-amber-200/10 text-amber-100/70' : 'bg-white/[0.07] text-white/55'}`}>
        {isLive ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />Live</> : isRecap ? 'Итог' : 'Вечер'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-white">{title}</span>
        <span className="mt-0.5 block truncate text-[9px] text-white/38">{compactMeta}</span>
      </span>
      {journey.phase === 'live' ? <span className="shrink-0 text-sm font-black tabular-nums text-white"><span className="text-rose-300">{journey.score.red}</span><span className="mx-1 text-white/30">:</span><span>{journey.score.black}</span></span> : journey.phase === 'recap' ? <span className="shrink-0 text-sm font-black text-white/70">{journey.recap.score}</span> : <span className="shrink-0 text-lg text-white/25">›</span>}
    </button>

    {open && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Игровой вечер" onClick={(event) => event.stopPropagation()} className="max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">2LA Noire · один вечер</div>
            <h2 className="mt-1 truncate text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-[11px] text-white/35">{journey.phase === 'recap' ? dateTime(journey.recap.starts_at) : dateTime(journey.evening.starts_at)}{(journey.phase === 'recap' ? journey.recap.venue : journey.evening.venue) ? ` · ${journey.phase === 'recap' ? journey.recap.venue : journey.evening.venue}` : ''}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><JourneySteps phase={journey.phase} /></div>

        {journey.phase === 'upcoming' && <>
          <section className="mt-3 rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] uppercase tracking-[0.14em] text-white/30">До вечера</div><div className="mt-1 text-lg font-semibold">{responseLabel(journey.participation.response_status)}</div></div><div className="text-right"><div className="text-lg font-black">{journey.attending_count}</div><div className="text-[9px] text-white/25">уже идут</div></div></div>
            {journey.evening.default_price != null && <div className="mt-3 text-[11px] text-white/35">Стоимость: {journey.evening.default_price.toLocaleString('ru-RU')} ₽</div>}
            <div className="mt-4 grid grid-cols-2 gap-2">{responseOptions.map((option) => {
              const selected = journey.participation.response_status === option.id;
              return <button key={option.id} type="button" disabled={savingResponse} onClick={() => void respond(option.id)} className={`min-h-11 rounded-xl border px-2 text-xs font-semibold ${selected ? 'border-white/30 bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/65'} disabled:opacity-50`}>{option.label}</button>;
            })}</div>
          </section>
          <div className="mt-3 rounded-2xl bg-white/[0.03] px-3 py-3 text-[10px] leading-4 text-white/32">Когда организатор начнёт вечер, этот же экран автоматически переключится на явку, текущую десятку и счёт. Ничего искать заново не придётся.</div>
        </>}

        {journey.phase === 'live' && <>
          <section className="mt-3 rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><div className="text-[9px] uppercase tracking-[0.14em] text-rose-300/70">Красные</div><div className="mt-1 text-4xl font-black text-rose-300">{journey.score.red}</div></div><div className="text-xl text-white/20">:</div><div><div className="text-[9px] uppercase tracking-[0.14em] text-white/40">Чёрные</div><div className="mt-1 text-4xl font-black">{journey.score.black}</div></div></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-black/20 p-3 text-center"><div className="text-lg font-semibold">{journey.score.completed}</div><div className="text-[9px] text-white/30">игр завершено</div></div><div className="rounded-2xl bg-black/20 p-3 text-center"><div className="text-lg font-semibold">{journey.present_count}</div><div className="text-[9px] text-white/30">в клубе</div></div></div>
          </section>

          <section className={`mt-3 rounded-[22px] border p-4 ${journey.participation.state === 'playing' ? 'border-amber-200/15 bg-amber-200/[0.04]' : 'border-white/[0.06] bg-white/[0.025]'}`}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Твой статус сейчас</div>
            <div className="mt-1 text-base font-semibold">{journey.participation.state === 'playing' ? `🎭 Ты играешь · место ${journey.participation.seat_number}` : journey.participation.state === 'waiting' ? '☕ Ты в клубе · ждёшь следующую игру' : journey.participation.state === 'expected' ? '📍 Тебя ждут на вечере' : '👀 Ты следишь за вечером'}</div>
            {journey.latest_self_game && <button type="button" onClick={() => navigate(`/player/replay/${encodeURIComponent(journey.latest_self_game!.game_key)}`)} className="mt-3 min-h-10 w-full rounded-xl bg-white px-3 text-xs font-bold text-black">Последняя моя игра · Replay ›</button>}
          </section>

          <section className="mt-3 rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-4">
            {journey.current_game ? <><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] uppercase tracking-[0.14em] text-rose-300/60">Сейчас за столом</div><div className="mt-1 text-lg font-semibold">Игра {journey.current_game.local_number}</div><div className="mt-1 text-[10px] text-white/30">{[journey.current_game.table_name, journey.current_game.judge_name ? `ведущий ${journey.current_game.judge_name}` : null].filter(Boolean).join(' · ') || 'Состав сформирован'}</div></div><span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-semibold text-rose-300">в процессе</span></div><div className="mt-3 grid grid-cols-2 gap-1.5">{journey.current_game.players.map((player) => <div key={`${journey.current_game!.id}:${player.seat_number}`} className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 ${player.player_id && journey.participation.state === 'playing' && player.seat_number === journey.participation.seat_number ? 'bg-amber-200/[0.08]' : 'bg-black/20'}`}><span className="w-5 shrink-0 text-center text-[9px] font-mono text-white/28">{player.seat_number}</span><span className="truncate text-[11px] font-medium text-white/75">{player.nickname}</span></div>)}</div><p className="mt-3 text-[9px] leading-4 text-white/22">Роли и закрытая информация до завершения партии здесь не показываются.</p></> : <div className="py-4 text-center"><div className="text-2xl">☕</div><div className="mt-2 text-sm font-semibold">Между играми</div><div className="mt-1 text-xs text-white/30">Следующая десятка появится здесь автоматически.</div></div>}
          </section>

          {journey.recent_results.length > 0 && <section className="mt-3"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">После игры</div><div className="space-y-1.5">{journey.recent_results.map((result) => <button key={result.id} type="button" onClick={() => navigate(`/player/replay/${encodeURIComponent(result.game_key)}`)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${result.self_played ? 'border border-white/10 bg-white/[0.06]' : 'bg-white/[0.035]'}`}><div><div className="text-xs font-medium">Игра {result.local_number}{result.self_played ? ' · ты играл' : ''}</div><div className="mt-0.5 text-[9px] text-white/25">{result.self_played && result.self_won != null ? (result.self_won ? 'Твоя победа' : 'Твоё поражение') : 'Открыть Replay'}</div></div><div className="text-xs font-semibold text-white/60">{winnerText(result.winner_team)} ›</div></button>)}</div></section>}
        </>}

        {journey.phase === 'recap' && <>
          <section className="mt-3 rounded-[26px] border border-amber-200/10 bg-gradient-to-b from-amber-200/[0.05] to-white/[0.025] p-5 text-center"><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100/45">Вечер завершён</div><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div><div className="text-[9px] text-rose-300/60">КРАСНЫЕ</div><div className="text-4xl font-black text-rose-300">{journey.recap.red_wins}</div></div><div className="text-xl text-white/15">:</div><div><div className="text-[9px] text-white/35">ЧЁРНЫЕ</div><div className="text-4xl font-black">{journey.recap.black_wins}</div></div></div><div className="mt-4 grid grid-cols-3 gap-1.5"><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-black">{journey.recap.player.games}</div><div className="text-[8px] text-white/25">твоих игр</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-black">{journey.recap.player.wins}</div><div className="text-[8px] text-white/25">побед</div></div><div className="rounded-xl bg-black/20 p-2"><div className={`text-lg font-black ${journey.recap.player.elo_delta > 0 ? 'text-emerald-300' : journey.recap.player.elo_delta < 0 ? 'text-rose-300' : ''}`}>{journey.recap.player.elo_delta > 0 ? '+' : ''}{journey.recap.player.elo_delta}</div><div className="text-[8px] text-white/25">Elo</div></div></div></section>
          {journey.recap.facts.length > 0 && <div className="mt-3 space-y-1.5">{journey.recap.facts.slice(0, 4).map((fact, index) => <div key={index} className="rounded-xl bg-white/[0.035] px-3 py-2 text-[10px] leading-4 text-white/40">{fact}</div>)}</div>}
          <button type="button" onClick={() => navigate(`/player/recaps/${encodeURIComponent(journey.recap.id)}`)} className="mt-3 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-bold text-black">Открыть полный итог вечера</button>
          {journey.recap.game_ids.length > 0 && <button type="button" onClick={() => navigate(`/player/replay/${encodeURIComponent(journey.recap.game_ids[journey.recap.game_ids.length - 1])}`)} className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white/60">Replay последней партии</button>}
        </>}

        {error && <div className="mt-3 rounded-xl bg-rose-400/10 px-3 py-2 text-[10px] text-rose-200/70">{error}</div>}
        <div className="mt-4 flex items-center justify-between text-[9px] text-white/22"><span>{updatedAt ? `Обновлено ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Состояние вечера'}</span><button type="button" disabled={loading} onClick={() => void refresh()} className="min-h-9 rounded-xl bg-white/[0.05] px-3 font-semibold text-white/40 disabled:opacity-40">{loading ? 'Обновляем…' : 'Обновить'}</button></div>
      </section>
    </div>}
  </>;
}
