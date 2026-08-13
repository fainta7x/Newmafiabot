import { useEffect, useMemo, useState } from 'react';

type Award = {
  category: string;
  label: string;
  player_id: string;
  nickname: string;
  avatar_url: string;
  votes: number;
};

type Summary = {
  id: string;
  title: string;
  starts_at: string;
  settled_at: string | null;
  venue: string | null;
  games: number;
  red_wins: number;
  black_wins: number;
  score: string;
  player: {
    games: number;
    wins: number;
    losses: number;
    win_rate: number;
    elo_before: number | null;
    elo_after: number | null;
    elo_delta: number;
    roles: string[];
  };
  best_elo_rise: null | { player_id: string; nickname: string; avatar_url: string; elo_delta: number };
  most_games: null | { player_id: string; nickname: string; avatar_url: string; games: number };
  awards: Award[];
  facts: string[];
  game_ids: string[];
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const dateText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};
const roleLabel = (role: string) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : role;

const Avatar = ({ src }: { src: string }) => <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-10 w-10 shrink-0 rounded-xl object-cover" />;

export default function PlayerEveningSummaries({
  onBack,
  initialEveningId,
  onOpenGame,
}: {
  onBack?: () => void;
  initialEveningId?: string | null;
  onOpenGame?: (gameId: string) => void;
}) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialEveningId || null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/evening-summaries', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить итоги вечеров');
        const items = Array.isArray(body?.summaries) ? body.summaries as Summary[] : [];
        if (!cancelled) {
          setSummaries(items);
          setSelectedId((current) => current || items[0]?.id || null);
        }
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить итоги вечеров'); })
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialEveningId) setSelectedId(initialEveningId);
  }, [initialEveningId]);

  const selected = useMemo(() => summaries?.find((item) => item.id === selectedId) || null, [summaries, selectedId]);

  if (!summaries && !error) return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-white"><div className="text-center"><div className="text-3xl">🎬</div><div className="mt-2 text-xs text-white/30">Собираем итоги вечеров…</div></div></main>;
  if (error) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-4 text-white"><div className="w-full max-w-[430px] rounded-3xl bg-rose-300/[0.05] p-5 text-center text-sm">{error}{onBack && <button type="button" onClick={onBack} className="mt-4 block w-full rounded-xl bg-white py-2 text-xs font-bold text-black">Назад</button>}</div></main>;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="flex items-start gap-3 px-1 pt-1">{onBack && <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/55">←</button>}<div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/40">История вечеров</div><h1 className="mt-1 text-2xl font-semibold">После финального стола</h1><p className="mt-1 text-xs leading-5 text-white/40">Счёт вечера, твоя форма, Elo и клубные номинации — в одном финальном экране.</p></div></div>

        {!summaries?.length ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-8 text-center"><div className="text-3xl">🎭</div><div className="mt-2 text-sm font-semibold">Итогов пока нет</div><p className="mt-1 text-xs text-white/30">После завершённого вечера, на котором ты был или играл, он появится здесь.</p></div> : <>
          {summaries.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{summaries.map((summary) => <button key={summary.id} type="button" onClick={() => setSelectedId(summary.id)} className={`shrink-0 rounded-2xl border px-3 py-2 text-left ${selectedId === summary.id ? 'border-white/20 bg-white text-black' : 'border-white/[0.06] bg-white/[0.035] text-white/55'}`}><div className="text-[10px] font-semibold">{dateText(summary.starts_at)}</div><div className="mt-0.5 text-[9px] opacity-60">{summary.games} игр · {summary.red_wins}:{summary.black_wins}</div></button>)}</div>}

          {selected && <>
            <section className="overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-violet-300/[0.08] via-white/[0.035] to-rose-300/[0.04] p-5 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">{dateText(selected.starts_at)}{selected.venue ? ` · ${selected.venue}` : ''}</div>
              <h2 className="mt-2 text-xl font-black">{selected.title}</h2>
              <div className="mt-5 flex items-end justify-center gap-5"><div><div className="text-[10px] text-rose-200/45">КРАСНЫЕ</div><div className="mt-1 text-5xl font-black text-rose-200">{selected.red_wins}</div></div><div className="pb-2 text-xl font-black text-white/20">:</div><div><div className="text-[10px] text-white/35">ЧЁРНЫЕ</div><div className="mt-1 text-5xl font-black">{selected.black_wins}</div></div></div>
              <div className="mt-3 text-[10px] text-white/30">{selected.games} завершённых игр</div>
            </section>

            <section className="grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"><div className="text-xl font-black">{selected.player.games}</div><div className="mt-1 text-[9px] text-white/25">твоих игр</div></div><div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"><div className="text-xl font-black">{selected.player.win_rate}%</div><div className="mt-1 text-[9px] text-white/25">побед</div></div><div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"><div className={`text-xl font-black ${selected.player.elo_delta > 0 ? 'text-emerald-300' : selected.player.elo_delta < 0 ? 'text-rose-300' : 'text-white/55'}`}>{signed(selected.player.elo_delta)}</div><div className="mt-1 text-[9px] text-white/25">Elo</div></div></section>

            {selected.player.elo_before != null && selected.player.elo_after != null && <section className="rounded-2xl border border-amber-200/10 bg-amber-200/[0.03] px-4 py-3"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[0.14em] text-amber-100/35">Твой рейтинг за вечер</div><div className="mt-1 text-sm font-semibold">{Math.round(selected.player.elo_before)} → {Math.round(selected.player.elo_after)}</div></div><div className={`text-xl font-black ${selected.player.elo_delta > 0 ? 'text-emerald-300' : selected.player.elo_delta < 0 ? 'text-rose-300' : 'text-white/45'}`}>{signed(selected.player.elo_delta)}</div></div></section>}

            {selected.facts.length > 0 && <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">Что запомнить</div><div className="mt-3 space-y-2">{selected.facts.map((fact) => <div key={fact} className="flex gap-2 text-xs leading-5 text-white/55"><span className="text-amber-200/55">✦</span><span>{fact}</span></div>)}</div></section>}

            {selected.awards.length > 0 && <section className="rounded-[24px] border border-amber-200/10 bg-amber-200/[0.025] p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-100/40">Выбор игроков</div><div className="mt-3 grid grid-cols-2 gap-2">{selected.awards.map((award) => <div key={award.category} className="rounded-2xl bg-black/20 p-3"><div className="flex items-center gap-2"><Avatar src={award.avatar_url} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{award.nickname}</div><div className="mt-0.5 text-[8px] text-white/25">{award.label}</div></div></div><div className="mt-2 text-[9px] text-white/25">{award.votes} голосов</div></div>)}</div></section>}

            <section className="grid grid-cols-2 gap-2">{selected.best_elo_rise && <div className="rounded-2xl border border-emerald-200/10 bg-emerald-200/[0.03] p-3"><div className="text-[9px] text-emerald-100/40">📈 Рост вечера</div><div className="mt-2 flex items-center gap-2"><Avatar src={selected.best_elo_rise.avatar_url} /><div className="min-w-0"><div className="truncate text-[10px] font-semibold">{selected.best_elo_rise.nickname}</div><div className="text-sm font-black text-emerald-300">{signed(selected.best_elo_rise.elo_delta)}</div></div></div></div>}{selected.most_games && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[9px] text-white/30">🎟 Больше всех игр</div><div className="mt-2 flex items-center gap-2"><Avatar src={selected.most_games.avatar_url} /><div className="min-w-0"><div className="truncate text-[10px] font-semibold">{selected.most_games.nickname}</div><div className="text-sm font-black">{selected.most_games.games}</div></div></div></div>}</section>

            {selected.player.roles.length > 0 && <div className="flex flex-wrap gap-1.5 px-1">{selected.player.roles.map((role) => <span key={role} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[9px] text-white/35">{roleLabel(role)}</span>)}</div>}

            {onOpenGame && selected.game_ids.length > 0 && <section className="rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Игры вечера</div><div className="mt-2 grid grid-cols-2 gap-1.5">{selected.game_ids.map((gameId, index) => <button key={gameId} type="button" onClick={() => onOpenGame(gameId)} className="min-h-10 rounded-xl bg-white/[0.05] text-[10px] font-semibold text-white/55">Игра {index + 1} ›</button>)}</div></section>}
          </>}
        </>}
      </div>
    </main>
  );
}
