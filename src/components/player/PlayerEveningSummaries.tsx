import { countGames } from '../../lib/russianPlural';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WinOrbit } from './PlayerVisualScenes.tsx';

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
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(date);
};
const roleLabel = (role: string) => getPlayerGameRoleLabel(role) ?? role;

const Avatar = ({ src, name = '?' }: { src: string; name?: string }) => {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white/[.14] to-white/[.03] text-sm font-semibold text-white/65 ring-1 ring-white/10">{name.slice(0, 1).toUpperCase()}{src && !failed && <img src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}</span>;
};

export default function PlayerEveningSummaries({
  onBack,
  initialEveningId,
  onOpenGame,
  onEveningChange,
  embedded = false,
}: {
  onBack?: () => void;
  initialEveningId?: string | null;
  onOpenGame?: (gameId: string, eveningId: string) => void;
  onEveningChange?: (eveningId: string) => void;
  embedded?: boolean;
}) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialEveningId || null);
  const summaryRequestSeq = useRef(0);

  const loadSummaries = useCallback(async () => {
    const requestId = ++summaryRequestSeq.current;
    setSummaries(null);
    setError(null);
    try {
      const response = await fetch('/api/player/evening-summaries', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить итоги вечеров');
      if (requestId !== summaryRequestSeq.current) return;
      const items = Array.isArray(body?.summaries) ? body.summaries as Summary[] : [];
      setSummaries(items);
      setSelectedId((current) => current && items.some((item) => item.id === current)
        ? current : items[0]?.id || null);
    } catch (err: any) {
      if (requestId === summaryRequestSeq.current) setError(err?.message || 'Не удалось загрузить итоги вечеров');
    }
  }, []);

  useEffect(() => {
    void loadSummaries();
    return () => { summaryRequestSeq.current += 1; };
  }, [loadSummaries]);

  useEffect(() => {
    if (initialEveningId) setSelectedId(initialEveningId);
  }, [initialEveningId]);

  const selected = useMemo(() => summaries?.find((item) => item.id === selectedId) || null, [summaries, selectedId]);

  if (!summaries && !error) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] text-white`}><div className="text-center"><div className="text-3xl">🎬</div><div className="mt-2 text-xs text-white/30">Собираем итоги вечеров…</div></div></main>;
  if (error) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] px-4 text-white`}><div role="alert" data-testid="player-recaps-error" className="w-full max-w-[430px] rounded-3xl bg-rose-300/[0.05] p-5 text-center text-sm"><p>{error}</p><button type="button" onClick={() => void loadSummaries()} className="mt-4 min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-black">Повторить</button>{onBack && <button type="button" onClick={onBack} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 px-4 text-sm font-semibold text-white">Назад</button>}</div></main>;

  return (
    <main className={`player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 ${embedded ? 'pt-2' : 'pt-3'} text-white`}>
      <div className="player-workspace mx-auto w-full max-w-5xl space-y-3">
        {!embedded && <div className="flex items-start gap-3 px-1 pt-1">{onBack && <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/55">←</button>}<div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/40">История вечеров</div><h1 className="mt-1 text-2xl font-semibold">После финального стола</h1><p className="mt-1 text-xs leading-5 text-white/40">Счёт вечера, форма, Elo и клубные номинации — в одном финальном экране.</p></div></div>}

        {!summaries?.length ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-8 text-center"><div className="text-3xl">🎭</div><div className="mt-2 text-sm font-semibold">Итогов пока нет</div><p className="mt-1 text-xs text-white/30">Итоги появятся здесь после вечера, в котором было участие.</p></div> : <>
          {summaries.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{summaries.map((summary) => <button key={summary.id} type="button" onClick={() => { setSelectedId(summary.id); onEveningChange?.(summary.id); }} className={`shrink-0 rounded-2xl border px-3 py-2 text-left ${selectedId === summary.id ? 'border-amber-200/35 bg-amber-200/15 text-amber-100' : 'border-white/[0.06] bg-white/[0.035] text-white/55'}`}><div className="text-[11px] font-semibold">{dateText(summary.starts_at)}</div><div className="mt-0.5 text-[11px] opacity-60">{countGames(summary.games)} · {summary.red_wins}:{summary.black_wins}</div></button>)}</div>}

          {selected && <>
            <section data-testid="evening-result-art" className="relative overflow-hidden rounded-[32px] border border-amber-200/15 bg-[#111015] p-4 shadow-[0_22px_75px_rgba(0,0,0,.38)] sm:p-6">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,178,116,.17),transparent_70%)]"/>
              <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-0 text-[170px] leading-none text-amber-100/[.055]">♛</div>
              <div className="relative">
                <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-amber-200/60">2LA NOIRE · Хроника вечера</div>
                <div className="mt-2 text-xs text-white/55">{dateText(selected.starts_at)}{selected.venue ? ' · ' + selected.venue : ''}</div>
                <h2 className="mt-1 max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{selected.title}</h2>
                <div className="mt-6 grid items-center gap-4 md:grid-cols-[1fr_180px_1fr]">
                  <div className="relative overflow-hidden rounded-[24px] border border-rose-200/15 bg-gradient-to-br from-[#492733] to-[#20161c] px-4 py-5 text-center">
                    <div aria-hidden="true" className="absolute -right-2 top-0 text-[90px] leading-none text-white/[.06]">◆</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-rose-200/65">КРАСНЫЕ</div>
                    <div className="mt-3 text-[64px] font-semibold tabular-nums leading-none text-rose-100">{selected.red_wins}</div>
                    <div className="mt-3 text-[11px] text-rose-100/55">побед за вечер</div>
                  </div>
                  <div className="relative flex flex-col items-center justify-center">
                    <svg aria-hidden="true" viewBox="0 0 180 85" className="w-full max-w-[180px]"><path d="M4 43 Q90 -8 176 43 Q90 94 4 43" stroke="#e8d2a2" strokeOpacity=".22" fill="none"/><path d="M18 43 H73 M107 43 H162" stroke="#e8d2a2" strokeOpacity=".4" strokeDasharray="3 5"/><text x="90" y="52" textAnchor="middle" fill="#d8bd7f" fontSize="25" fontWeight="600">VS</text></svg>
                    <div className="text-center text-[11px] text-white/50">{countGames(selected.games)} завершено</div>
                  </div>
                  <div className="relative overflow-hidden rounded-[24px] border border-violet-200/15 bg-gradient-to-br from-[#322741] to-[#17141f] px-4 py-5 text-center">
                    <div aria-hidden="true" className="absolute -right-2 top-0 text-[90px] leading-none text-white/[.06]">♠</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-violet-200/65">ЧЁРНЫЕ</div>
                    <div className="mt-3 text-[64px] font-semibold tabular-nums leading-none text-violet-100">{selected.black_wins}</div>
                    <div className="mt-3 text-[11px] text-violet-100/55">побед за вечер</div>
                  </div>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label={'Победы команд: красные ' + selected.red_wins + ', чёрные ' + selected.black_wins}>
                  <span className="bg-gradient-to-r from-rose-500 to-rose-200" style={{width: (selected.games ? selected.red_wins / selected.games * 100 : 0) + '%'}}/>
                  <span className="bg-gradient-to-r from-violet-200 to-violet-500" style={{width: (selected.games ? selected.black_wins / selected.games * 100 : 0) + '%'}}/>
                </div>
              </div>
            </section>

            <section aria-label="Личные результаты за вечер" className="grid gap-3 overflow-hidden rounded-[28px] border border-sky-200/10 bg-gradient-to-br from-[#1b2525] via-[#14191c] to-[#101116] p-4 sm:grid-cols-[160px_1fr] sm:p-5">
              <div className="flex items-center justify-center">
                <WinOrbit percent={selected.player.win_rate} value={selected.player.win_rate + '%'} caption="ваших побед" tone="emerald"/>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[.17em] text-sky-200/60">Личный итог</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Ваш вечер за столом</h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-black/25 p-2"><div className="text-xl font-semibold tabular-nums">{selected.player.games}</div><div className="mt-1 text-[10px] text-white/45">игр</div></div>
                  <div className="rounded-xl bg-black/25 p-2"><div className="text-xl font-semibold tabular-nums text-emerald-200">{selected.player.wins}</div><div className="mt-1 text-[10px] text-white/45">побед</div></div>
                  <div className="rounded-xl bg-black/25 p-2"><div className={'text-xl font-semibold tabular-nums ' + (selected.player.elo_delta > 0 ? 'text-emerald-200' : selected.player.elo_delta < 0 ? 'text-rose-200' : 'text-white/70')}>{signed(selected.player.elo_delta)}</div><div className="mt-1 text-[10px] text-white/45">Elo</div></div>
                </div>
                {selected.player.elo_before != null && selected.player.elo_after != null && <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="flex justify-between text-[11px] text-white/55"><span>Рейтинг за вечер</span><span className="tabular-nums">{Math.round(selected.player.elo_before)} → {Math.round(selected.player.elo_after)}</span></div>
                  <div aria-hidden="true" className="mt-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-300"/><span className="h-px flex-1 bg-gradient-to-r from-sky-300/60 to-emerald-300/60"/><span className="h-2 w-2 rounded-full bg-emerald-300"/></div>
                </div>}
              </div>
            </section>

            {selected.facts.length > 0 && <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/35">Что запомнить</div><div className="mt-3 space-y-2">{selected.facts.map((fact) => <div key={fact} className="flex gap-2 text-xs leading-5 text-white/55"><span className="text-amber-200/55">✦</span><span>{fact}</span></div>)}</div></section>}

            {selected.awards.length > 0 && <section className="rounded-[24px] border border-amber-200/10 bg-amber-200/[0.025] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100/40">Выбор игроков</div><div className="mt-3 grid grid-cols-2 gap-2">{selected.awards.map((award) => <div key={`${award.category}:${award.player_id}`} className="rounded-2xl bg-black/20 p-3"><div className="flex items-center gap-2"><Avatar src={award.avatar_url} name={award.nickname} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{award.nickname}</div><div className="mt-0.5 text-[11px] text-white/25">{award.label}</div></div></div><div className="mt-2 text-[11px] text-white/25">{award.votes} голосов</div></div>)}</div></section>}

            <section className="grid grid-cols-2 gap-2">{selected.best_elo_rise && <div className="rounded-2xl border border-emerald-200/10 bg-emerald-200/[0.03] p-3"><div className="text-[11px] text-emerald-100/40">📈 Рост вечера</div><div className="mt-2 flex items-center gap-2"><Avatar src={selected.best_elo_rise.avatar_url} name={selected.best_elo_rise.nickname} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{selected.best_elo_rise.nickname}</div><div className="text-sm font-black text-emerald-300">{signed(selected.best_elo_rise.elo_delta)}</div></div></div></div>}{selected.most_games && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[11px] text-white/30">🎟 Больше всех игр</div><div className="mt-2 flex items-center gap-2"><Avatar src={selected.most_games.avatar_url} name={selected.most_games.nickname} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{selected.most_games.nickname}</div><div className="text-sm font-black">{selected.most_games.games}</div></div></div></div>}</section>

            {selected.player.roles.length > 0 && <div className="flex flex-wrap gap-1.5 px-1">{selected.player.roles.map((role) => <span key={role} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/35">{roleLabel(role)}</span>)}</div>}

            {onOpenGame && selected.game_ids.length > 0 && <section className="rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Протоколы игр вечера</div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{selected.game_ids.map((gameId, index) => <button key={gameId} type="button" onClick={() => onOpenGame(gameId, selected.id)} className="group relative flex min-h-[128px] flex-col justify-between overflow-hidden rounded-[20px] border border-violet-200/15 bg-gradient-to-br from-[#332542] via-[#17131f] to-[#101216] px-3 py-3 text-left text-xs font-semibold text-white/85 transition active:scale-[.98]"><span aria-hidden="true" className="pointer-events-none absolute -right-2 top-0 text-[86px] text-violet-100/[.075]">♠</span><span className="relative text-[10px] uppercase tracking-[.12em] text-white/55">Матч · {index+1}</span><span className="relative text-sm">Игра №{index + 1} ↗</span></button>)}</div></section>}
          </>}
        </>}
      </div>
    </main>
  );
}
