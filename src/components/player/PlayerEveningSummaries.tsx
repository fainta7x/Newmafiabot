import { getPlayerGameWinnerLabel } from '../../lib/playerGameResultLabels.ts';
import { round2 } from '../../shared/numbers.ts';
import { countGames } from '../../lib/russianPlural';
import { RoleMark, TeamResultGraphic } from './PlayerGameGraphics.tsx';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';

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
  game_links?: Array<{ id: string; game_number: number | null; winner_team?: 'red' | 'black'; personal?: { role: string | null; won: boolean } | null }>;
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${round2(value)}`;
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
      const body = await getJson('/api/player/evening-summaries', 'Не удалось загрузить итоги вечеров');
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
  const gameLinks = selected?.game_ids.map(id => selected.game_links?.find(game => game.id === id) || { id, game_number: null }) || [];

  if (!summaries && !error) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] text-white`}><div className="text-center"><div className="text-3xl">🎬</div><div className="mt-2 text-xs text-white/30">Собираем итоги вечеров…</div></div></main>;
  if (error) return <main className={`grid ${embedded ? 'min-h-[46vh]' : 'min-h-screen'} place-items-center bg-[#090a0d] px-4 text-white`}><div role="alert" data-testid="player-recaps-error" className="w-full max-w-[430px] rounded-3xl bg-rose-300/[0.05] p-5 text-center text-sm"><p>{error}</p><button type="button" onClick={() => void loadSummaries()} className="mt-4 min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-black">Повторить</button>{onBack && <button type="button" onClick={onBack} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 px-4 text-sm font-semibold text-white">Назад</button>}</div></main>;

  return (
    <main className={`player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 ${embedded ? 'pt-2' : 'pt-3'} text-white`}>
      <div className="player-workspace mx-auto w-full max-w-5xl space-y-3">
        {!embedded && <div className="flex items-start gap-3 px-1 pt-1">{onBack && <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/55">←</button>}<div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/40">История вечеров</div><h1 className="mt-1 text-2xl font-semibold">После финального стола</h1><p className="mt-1 text-xs leading-5 text-white/40">Счёт вечера, форма, Elo и клубные номинации — в одном финальном экране.</p></div></div>}

        {!summaries?.length ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-8 text-center"><div className="text-3xl">🎭</div><div className="mt-2 text-sm font-semibold">Итогов пока нет</div><p className="mt-1 text-xs text-white/30">Итоги появятся здесь после вечера, в котором было участие.</p></div> : <>
          {summaries.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{summaries.map((summary) => <button key={summary.id} type="button" onClick={() => { setSelectedId(summary.id); onEveningChange?.(summary.id); }} className={`min-h-11 shrink-0 rounded-2xl border px-3 py-2 text-left ${selectedId === summary.id ? 'border-amber-200/35 bg-amber-200/15 text-amber-100' : 'border-white/[0.06] bg-white/[0.035] text-white/55'}`}><div className="text-[11px] font-semibold">{dateText(summary.starts_at)}</div><div className="mt-0.5 text-[11px] opacity-60">{countGames(summary.games)} · {summary.red_wins}:{summary.black_wins}</div></button>)}</div>}

          {selected && <>
            <section data-testid="evening-result-art" className="overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(244,63,94,.09),transparent_40%,rgba(139,92,246,.08))] p-3">
              <header>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-white/40">2LA Noire · Итоговый бланк вечера</p>
                <p className="text-xs text-white/55">{dateText(selected.starts_at)}{selected.venue ? ' · ' + selected.venue : ''}</p>
                <h2 className="mt-1 text-xl font-semibold">{selected.title}</h2>
              </header>
              <TeamResultGraphic red={selected.red_wins} black={selected.black_wins} />
              <p className="text-center text-xs text-white/50">{countGames(selected.games)} завершено</p>
              <div aria-label="Личные результаты за вечер" className="mt-3 border-t border-white/10 pt-3">
                <h3 className="text-sm font-semibold">Мой результат</h3>
                <dl className="mt-2 grid grid-cols-3 gap-3">
                  <div><dt className="text-xs text-white/55">Игры</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{selected.player.games}</dd></div>
                  <div><dt className="text-xs text-white/55">Победы</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{selected.player.wins}<span className="ml-1 text-xs font-normal text-white/55">{selected.player.games ? `${selected.player.win_rate}%` : '—'}</span></dd></div>
                  <div><dt className="text-xs text-white/55">Изменение Elo</dt><dd className={'mt-1 text-xl font-semibold tabular-nums ' + (selected.player.elo_delta > 0 ? 'text-emerald-200' : selected.player.elo_delta < 0 ? 'text-rose-200' : 'text-white/70')}>{signed(selected.player.elo_delta)}</dd></div>
                </dl>
                {selected.player.elo_before != null && selected.player.elo_after != null && <p className="mt-2 text-xs text-white/55">Elo за вечер: {Math.round(selected.player.elo_before)} → {Math.round(selected.player.elo_after)}</p>}
                {selected.player.roles.length > 0 && <div className="mt-2 flex flex-wrap gap-4">{selected.player.roles.map(role => <div key={role} className="flex items-center gap-2"><RoleMark role={role} /><span className="text-xs text-white/70">{roleLabel(role)}</span></div>)}</div>}
              </div>
              {onOpenGame && selected.game_ids.length > 0 && <div className="mt-4 border-t border-white/10 pt-3">
                <h3 className="text-sm font-semibold">Протоколы игр вечера</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{gameLinks.map(game => <button key={game.id} type="button" onClick={() => onOpenGame(game.id, selected.id)} className="ds-focus-ring flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white/[.05] px-3 py-3 text-left text-sm text-white/85"><span className="min-w-0"><strong className="block text-sm">{game.game_number ? `Игра №${game.game_number}` : 'Открыть игру'}</strong>{game.winner_team && <span className="mt-1 block text-xs text-white/60">{getPlayerGameWinnerLabel(game.winner_team)?.replace(/^[🔴⚫]\s*/u, '')}</span>}{game.personal ? <span className="mt-1 block text-xs text-white/75">{game.personal.role ? roleLabel(game.personal.role) : 'Роль не указана'} · {game.personal.won ? 'Победа' : 'Поражение'}</span> : game.personal === null ? <span className="mt-1 block text-xs text-white/50">Не участвовал</span> : null}</span><span aria-hidden="true" className="shrink-0 text-white/45">›</span></button>)}</div>
              </div>}

            {(selected.facts.length > 0 || selected.awards.length > 0 || selected.best_elo_rise || selected.most_games) && <section aria-label="Памятные моменты вечера" className="mt-3 divide-y divide-white/10 border-t border-white/10">
              {selected.awards.length > 0 && <div className="py-4">
                <h3 className="text-sm font-semibold">Выбор игроков</h3>
                <div className="mt-2 divide-y divide-white/[.07]">{selected.awards.map((award) => <div key={award.category + ':' + award.player_id} className="flex min-w-0 items-center gap-3 py-2.5">
                  <Avatar src={award.avatar_url} name={award.nickname}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{award.nickname}</p><p className="mt-0.5 text-xs text-white/55">{award.label}</p></div><p className="shrink-0 text-xs text-white/65">{award.votes} голосов</p>
                </div>)}</div>
              </div>}
              {(selected.best_elo_rise || selected.most_games) && <div aria-label="Герои вечера" className="space-y-3 py-4">
                {selected.best_elo_rise && <div className="flex items-center gap-3"><Avatar src={selected.best_elo_rise.avatar_url} name={selected.best_elo_rise.nickname}/><div className="min-w-0 flex-1"><p className="text-xs text-white/55">Рост вечера</p><p className="break-words text-sm font-semibold">{selected.best_elo_rise.nickname}</p></div><span className="shrink-0 text-sm font-semibold text-emerald-200">{signed(selected.best_elo_rise.elo_delta)} Elo</span></div>}
                {selected.most_games && <div className="flex items-center gap-3"><Avatar src={selected.most_games.avatar_url} name={selected.most_games.nickname}/><div className="min-w-0 flex-1"><p className="text-xs text-white/55">Больше всех игр</p><p className="break-words text-sm font-semibold">{selected.most_games.nickname}</p></div><span className="shrink-0 text-sm font-semibold">{selected.most_games.games} игр</span></div>}
              </div>}
              {selected.facts.length > 0 && <details className="py-1"><summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold">Что запомнить<span className="text-white/45">{selected.facts.length} ▾</span></summary><ul className="list-disc space-y-2 pb-3 pl-4 text-sm leading-5 text-white/65">{selected.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></details>}
            </section>}
            </section>
          </>}
        </>}
      </div>
    </main>
  );
}
