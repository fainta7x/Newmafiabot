import React, { useEffect, useMemo, useState } from 'react';

type RatingPeriodSummary = {
  id: string;
  title: string;
  type: string;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'completed' | string;
  notes: string | null;
};

type RatingPeriodGame = {
  game_id: number;
  game_number: number;
  evening_id: string;
  evening_title: string;
  game_date: string;
  seat_number: number;
  role: string | null;
  winner_team: 'red' | 'black' | null;
  win_point: number;
  judge_bonus: number;
  protocol_bonus: number;
  positive_points: number;
  best_move_points: number;
  game_penalty_points: number;
  disciplinary_penalty_points: number;
  penalty_points: number;
  ci_points: number;
  game_total: number;
};

type RatingPeriodStanding = {
  place: number;
  calculated_place: number;
  player_id: string;
  nickname: string;
  avatar_url: string | null;
  total_points: number;
  additional_total: number;
  positive_points: number;
  penalty_points: number;
  best_move_points: number;
  ci_points: number;
  wins: number;
  don_wins: number;
  sheriff_wins: number;
  first_killed_count: number;
  games_played: number;
  games: RatingPeriodGame[];
};

type RatingPeriodDetail = {
  period: RatingPeriodSummary;
  selected_games_count: number;
  completed_games_count: number;
  distance_games: number;
  standings: RatingPeriodStanding[];
  self_player_id: string;
  warnings: string[];
};

type PeriodListResponse = {
  active_periods: RatingPeriodSummary[];
  completed_periods: RatingPeriodSummary[];
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatRange = (start: string, end: string) => `${formatDate(start)} — ${formatDate(end)}`;

const scoreNumber = (value: number) => {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
};

const signedScore = (value: number) => `${value > 0 ? '+' : ''}${scoreNumber(value)}`;

const roleLabel = (role: string | null) => {
  const normalized = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(normalized)) return 'Мирный';
  if (['sheriff', 'шериф'].includes(normalized)) return 'Шериф';
  if (['mafia', 'мафия', 'маф', 'black', 'черный'].includes(normalized)) return 'Мафия';
  if (['don', 'дон'].includes(normalized)) return 'Дон';
  return role || 'Роль не указана';
};

const periodTypeLabel = (type: string) => String(type).toUpperCase() === 'NOVICE' ? 'Новички' : 'Рейтинговый';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] ${value > 0 ? 'bg-emerald-400/10 text-emerald-200/80' : 'bg-rose-400/10 text-rose-200/80'}`}>
      {label} {signedScore(value)}
    </span>
  );
}

export default function PlayerRatingPeriods({
  playerId,
  onOpenGame,
}: {
  playerId: string;
  onOpenGame?: (gameKey: string) => void;
}) {
  const [periods, setPeriods] = useState<PeriodListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RatingPeriodDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/rating-periods', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить рейтинговые периоды');
        const next: PeriodListResponse = {
          active_periods: Array.isArray(body?.active_periods) ? body.active_periods : [],
          completed_periods: Array.isArray(body?.completed_periods) ? body.completed_periods : [],
        };
        if (cancelled) return;
        setPeriods(next);
        const firstPeriod = next.active_periods[0] || next.completed_periods[0] || null;
        setSelectedPeriodId((current) => current || firstPeriod?.id || null);
      } catch (error: any) {
        if (!cancelled) setListError(error?.message || 'Не удалось загрузить рейтинговые периоды');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setSelectedPlayerId(null);
    void (async () => {
      try {
        const response = await fetch(`/api/player/rating-periods/${encodeURIComponent(selectedPeriodId)}`, { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить таблицу периода');
        if (!cancelled) setDetail(body as RatingPeriodDetail);
      } catch (error: any) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(error?.message || 'Не удалось загрузить таблицу периода');
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPeriodId]);

  const selfStanding = useMemo(
    () => detail?.standings.find((item) => item.player_id === playerId) || null,
    [detail, playerId],
  );
  const selectedPlayer = useMemo(
    () => detail?.standings.find((item) => item.player_id === selectedPlayerId) || null,
    [detail, selectedPlayerId],
  );

  if (listError) {
    return <Section title="Рейтинговые периоды"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{listError}</p></Section>;
  }

  if (!periods) {
    return <Section title="Рейтинговые периоды"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка периодов…</p></Section>;
  }

  const hasPeriods = periods.active_periods.length > 0 || periods.completed_periods.length > 0;
  if (!hasPeriods) {
    return <Section title="Рейтинговые периоды"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Рейтинговых периодов пока нет.</p></Section>;
  }

  return (
    <>
      {periods.active_periods.length > 0 && (
        <Section title="Текущий период">
          {periods.active_periods.length > 1 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {periods.active_periods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setSelectedPeriodId(period.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium ${selectedPeriodId === period.id ? 'bg-white text-black' : 'bg-black/20 text-white/55'}`}
                >
                  {periodTypeLabel(period.type)}
                </button>
              ))}
            </div>
          )}
          {periods.active_periods.map((period) => period.id === selectedPeriodId ? (
            <div key={period.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">{period.title}</div>
                  <div className="mt-1 text-xs text-white/40">{formatRange(period.starts_at, period.ends_at)}</div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-200/80">идёт сейчас</span>
              </div>
              {period.notes && <p className="mt-3 text-sm leading-5 text-white/45">{period.notes}</p>}
            </div>
          ) : null)}
          {selectedPeriodId && !periods.active_periods.some((period) => period.id === selectedPeriodId) && (
            <button type="button" onClick={() => setSelectedPeriodId(periods.active_periods[0].id)} className="text-sm text-white/55">← Вернуться к текущему периоду</button>
          )}
        </Section>
      )}

      {detailLoading && <Section title="Таблица периода"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Считаем таблицу…</p></Section>}
      {detailError && <Section title="Таблица периода"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{detailError}</p></Section>}

      {detail && !detailLoading && (
        <>
          {!periods.active_periods.some((period) => period.id === detail.period.id) && (
            <Section title="Архивный период">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-lg font-semibold text-white">{detail.period.title}</div><div className="mt-1 text-xs text-white/40">{formatRange(detail.period.starts_at, detail.period.ends_at)}</div></div>
                <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-white/50">завершён</span>
              </div>
            </Section>
          )}

          {selectedPlayer ? (
            <Section title="Результат игрока">
              <button type="button" onClick={() => setSelectedPlayerId(null)} className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/60">← Таблица периода</button>
              <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                {selectedPlayer.avatar_url ? <img src={selectedPlayer.avatar_url} alt={selectedPlayer.nickname} className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/60">{selectedPlayer.nickname.slice(0, 1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1"><div className="truncate font-medium text-white">{selectedPlayer.nickname}{selectedPlayer.player_id === playerId ? ' · вы' : ''}</div><div className="mt-1 text-xs text-white/40">{selectedPlayer.games_played} игр · {selectedPlayer.wins} побед</div></div>
                <div className="shrink-0 text-right"><div className="text-xl font-semibold text-white">{scoreNumber(selectedPlayer.total_points)}</div><div className="text-[10px] uppercase tracking-[0.12em] text-white/30">баллов</div></div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold">#{selectedPlayer.place}</div><div className="mt-1 text-[10px] text-white/35">место</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold">{signedScore(selectedPlayer.additional_total)}</div><div className="mt-1 text-[10px] text-white/35">доп. баллы</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold">{scoreNumber(selectedPlayer.best_move_points)}</div><div className="mt-1 text-[10px] text-white/35">ЛХ</div></div></div>

              <div className="mt-4 space-y-2">
                {selectedPlayer.games.map((game) => {
                  const penalties = -Math.abs(Number(game.penalty_points || 0));
                  return (
                    <div key={game.game_id} className="rounded-2xl bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><div className="truncate text-sm font-medium text-white">{game.evening_title}</div><div className="mt-1 text-xs text-white/35">{formatDate(game.game_date)} · Игра №{game.game_number} · место {game.seat_number}</div><div className="mt-1 text-xs text-white/45">{roleLabel(game.role)}</div></div>
                        <div className={`shrink-0 text-lg font-semibold ${game.game_total > 0 ? 'text-emerald-300' : game.game_total < 0 ? 'text-rose-300' : 'text-white/65'}`}>{signedScore(game.game_total)}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <ScoreBadge label="победа" value={game.win_point} />
                        <ScoreBadge label="судья" value={game.judge_bonus} />
                        <ScoreBadge label="протокол" value={game.protocol_bonus} />
                        <ScoreBadge label="ЛХ" value={game.best_move_points} />
                        <ScoreBadge label="CI" value={game.ci_points} />
                        <ScoreBadge label="штрафы" value={penalties} />
                      </div>
                      {onOpenGame && (
                        <button type="button" onClick={() => onOpenGame(`club:${game.game_id}`)} className="mt-3 text-xs font-medium text-white/45">Открыть протокол игры ›</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : (
            <>
              <Section title="Мой результат">
                {selfStanding ? (
                  <>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="rounded-xl bg-black/20 p-2"><div className="text-xl font-semibold">#{selfStanding.place}</div><div className="mt-1 text-[9px] text-white/35">место</div></div>
                      <div className="rounded-xl bg-black/20 p-2"><div className="text-xl font-semibold">{scoreNumber(selfStanding.total_points)}</div><div className="mt-1 text-[9px] text-white/35">баллов</div></div>
                      <div className="rounded-xl bg-black/20 p-2"><div className="text-xl font-semibold">{selfStanding.games_played}</div><div className="mt-1 text-[9px] text-white/35">игр</div></div>
                      <div className="rounded-xl bg-black/20 p-2"><div className="text-xl font-semibold">{selfStanding.wins}</div><div className="mt-1 text-[9px] text-white/35">побед</div></div>
                    </div>
                    <button type="button" onClick={() => setSelectedPlayerId(selfStanding.player_id)} className="mt-3 w-full rounded-2xl bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white/65">Посмотреть мои игры и начисления</button>
                  </>
                ) : (
                  <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">В этом периоде у вас пока нет зачётных игр.</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-white/30"><span>Завершённых игр: {detail.completed_games_count}</span><span>В таблице: {detail.standings.length}</span></div>
                {detail.warnings.length > 0 && <div className="mt-2 text-[10px] text-white/25">{detail.warnings.length} игр не вошли в расчёт из-за неполного протокола.</div>}
              </Section>

              <Section title="Таблица периода">
                {detail.standings.length ? (
                  <div className="space-y-2">{detail.standings.map((item) => {
                    const isSelf = item.player_id === playerId;
                    return (
                      <button key={item.player_id} type="button" onClick={() => setSelectedPlayerId(item.player_id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${isSelf ? 'border-white/20 bg-white/[0.08]' : 'border-transparent bg-black/20'}`}>
                        <div className="w-7 shrink-0 text-center text-sm font-semibold text-white/45">{item.place}</div>
                        {item.avatar_url ? <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/60">{item.nickname.slice(0, 1).toUpperCase()}</div>}
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{item.nickname}{isSelf ? ' · вы' : ''}</div><div className="mt-1 text-[10px] text-white/35">{item.games_played} игр · {item.wins} побед · доп. {signedScore(item.additional_total)}</div></div>
                        <div className="shrink-0 text-right"><div className="text-base font-semibold text-white">{scoreNumber(item.total_points)}</div><div className="text-[9px] text-white/30">баллов ›</div></div>
                      </button>
                    );
                  })}</div>
                ) : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">В периоде пока нет завершённых зачётных игр.</p>}
              </Section>
            </>
          )}
        </>
      )}

      {periods.completed_periods.length > 0 && selectedPlayerId === null && (
        <Section title="Прошлые периоды">
          <div className="space-y-2">{periods.completed_periods.map((period) => (
            <button key={period.id} type="button" onClick={() => setSelectedPeriodId(period.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedPeriodId === period.id ? 'border-white/20 bg-white/[0.08]' : 'border-transparent bg-black/20'}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{period.title}</div><div className="mt-1 text-xs text-white/35">{formatRange(period.starts_at, period.ends_at)}</div></div><div className="shrink-0 text-[10px] text-white/35">{periodTypeLabel(period.type)} ›</div></div>
            </button>
          ))}</div>
        </Section>
      )}
    </>
  );
}
