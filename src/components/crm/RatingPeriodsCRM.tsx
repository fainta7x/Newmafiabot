import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

type RatingPeriod = {
  id: string;
  title: string;
  type: 'NOVICE' | 'RATING';
  starts_at: string;
  ends_at: string;
  status: string;
  auto_include: boolean;
  notes?: string | null;
};

type PeriodEvening = {
  id: string;
  title: string;
  starts_at: string;
  format: 'NOVICE' | 'CASUAL' | 'RATING' | 'TOURNAMENT';
  status: string;
  games_count: number;
  auto_included: boolean;
  override_included: boolean | null;
  effective_included: boolean;
};

type PeriodGame = {
  id: number;
  global_game_number: number;
  game_date: string;
  winner_team: string;
  evening_id: string;
  evening_title: string;
  starts_at: string;
  format: PeriodEvening['format'];
  auto_included: boolean;
  evening_override_included: boolean | null;
  game_override_included: boolean | null;
  effective_included: boolean;
};

type PeriodStanding = {
  place: number;
  player_id: string;
  nickname: string;
  total_points: number;
  additional_total: number;
  wins: number;
  don_wins: number;
  sheriff_wins: number;
  first_killed_count: number;
  games_played: number;
  ci_points: number;
  tie_group_id: string | null;
  ci_calculation?: {
    distance_games: number;
    threshold_b: number;
    first_killed_count: number;
    ci_rate: number;
    provisional: boolean;
  };
};

type StandingsResponse = {
  selected_games_count: number;
  completed_games_count: number;
  distance_games: number;
  ci_threshold_b: number;
  standings: PeriodStanding[];
  warnings: string[];
};

const apiJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Ошибка запроса');
  return body as T;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(value));

const formatLabels: Record<PeriodEvening['format'], string> = {
  NOVICE: 'Для новичков',
  CASUAL: 'Для отдыха',
  RATING: 'Рейтинговый',
  TOURNAMENT: 'Турнир',
};

const points = (value: number) => Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export const RatingPeriodsCRM: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [periods, setPeriods] = useState<RatingPeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evenings, setEvenings] = useState<PeriodEvening[]>([]);
  const [games, setGames] = useState<PeriodGame[]>([]);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [showGames, setShowGames] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'NOVICE' | 'RATING'>('RATING');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const selected = useMemo(() => periods.find((item) => item.id === selectedId) || null, [periods, selectedId]);

  const loadPeriods = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<RatingPeriod[]>('/api/rating-periods');
      setPeriods(data);
      if (selectedId && !data.some((item) => item.id === selectedId)) setSelectedId(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить периоды');
    } finally {
      setLoading(false);
    }
  };

  const loadSelected = async (periodId: string) => {
    setDetailsLoading(true);
    setError(null);
    try {
      const [eveningData, gameData, standingsData] = await Promise.all([
        apiJson<{ evenings: PeriodEvening[] }>(`/api/rating-periods/${periodId}/evenings`),
        apiJson<{ games: PeriodGame[] }>(`/api/rating-periods/${periodId}/games`),
        apiJson<StandingsResponse>(`/api/rating-periods/${periodId}/standings`),
      ]);
      setEvenings(eveningData.evenings || []);
      setGames(gameData.games || []);
      setStandings(standingsData);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить расчёт периода');
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (!expanded) return;
    void loadPeriods();
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !selectedId) {
      setEvenings([]);
      setGames([]);
      setStandings(null);
      return;
    }
    void loadSelected(selectedId);
  }, [expanded, selectedId]);

  const createPeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiJson<RatingPeriod>('/api/rating-periods', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          type,
          starts_at: `${startsAt}T00:00:00+03:00`,
          ends_at: `${endsAt}T23:59:59+03:00`,
          auto_include: true,
          status: 'active',
        }),
      });
      setTitle('');
      setStartsAt('');
      setEndsAt('');
      await loadPeriods();
      setSelectedId(created.id);
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать период');
    } finally {
      setCreating(false);
    }
  };

  const setEveningOverride = async (eveningId: string, included: boolean | null) => {
    if (!selectedId) return;
    setError(null);
    try {
      await apiJson(`/api/rating-periods/${selectedId}/evenings/${eveningId}`, {
        method: 'PUT',
        body: JSON.stringify({ included }),
      });
      await loadSelected(selectedId);
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить участие вечера');
    }
  };

  const setGameOverride = async (gameId: number, included: boolean | null) => {
    if (!selectedId) return;
    setError(null);
    try {
      await apiJson(`/api/rating-periods/${selectedId}/games/${gameId}`, {
        method: 'PUT',
        body: JSON.stringify({ included }),
      });
      await loadSelected(selectedId);
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить участие игры');
    }
  };

  const deletePeriod = async (period: RatingPeriod) => {
    if (!confirm(`Удалить рейтинговый период «${period.title}»? Игры и вечера удалены не будут.`)) return;
    try {
      await apiJson(`/api/rating-periods/${period.id}`, { method: 'DELETE' });
      if (selectedId === period.id) setSelectedId(null);
      await loadPeriods();
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить период');
    }
  };

  return (
    <section className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-[68px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-accent">
          <CalendarRange className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[14px] font-bold text-text-primary">Рейтинговые периоды</strong>
          <span className="mt-0.5 block text-[12px] text-text-secondary">Гибкие дистанции новичков и основного рейтинга</span>
        </span>
        {expanded ? <ChevronUp className="h-5 w-5 text-text-muted" /> : <ChevronDown className="h-5 w-5 text-text-muted" />}
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border-soft p-4">
          <form onSubmit={createPeriod} className="space-y-3 rounded-[16px] bg-surface-2 p-3">
            <div className="text-[13px] font-bold text-text-primary">Новый период</div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: Основной рейтинг · Осень"
              className="min-h-11 w-full rounded-[12px] border border-border-soft bg-app-bg px-3 text-[13px] text-text-primary outline-none focus:border-accent"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select value={type} onChange={(event) => setType(event.target.value as 'NOVICE' | 'RATING')} className="min-h-11 rounded-[12px] border border-border-soft bg-app-bg px-3 text-[13px] text-text-primary">
                <option value="RATING">Основной рейтинг</option>
                <option value="NOVICE">Рейтинг новичков</option>
              </select>
              <input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="min-h-11 rounded-[12px] border border-border-soft bg-app-bg px-3 text-[13px] text-text-primary" />
              <input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="min-h-11 rounded-[12px] border border-border-soft bg-app-bg px-3 text-[13px] text-text-primary" />
            </div>
            <button type="submit" disabled={creating || !title.trim() || !startsAt || !endsAt} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> {creating ? 'Создаём…' : 'Создать период'}
            </button>
          </form>

          {error ? <div className="rounded-[12px] border border-danger/20 bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div> : null}
          {loading ? <div className="text-[12px] text-text-secondary">Загрузка…</div> : null}

          <div className="space-y-2">
            {periods.map((period) => (
              <div key={period.id} className={`rounded-[14px] border p-3 ${selectedId === period.id ? 'border-accent bg-accent-soft' : 'border-border-soft bg-surface-2'}`}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setSelectedId(period.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13px] font-bold text-text-primary">{period.title}</div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      {period.type === 'NOVICE' ? 'Новички' : 'Основной'} · {formatDate(period.starts_at)} — {formatDate(period.ends_at)}
                    </div>
                  </button>
                  <button type="button" onClick={() => void deletePeriod(period)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-text-muted hover:bg-danger-soft hover:text-danger" aria-label="Удалить период">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {!loading && !periods.length ? <div className="rounded-[14px] bg-surface-2 px-3 py-4 text-[12px] text-text-secondary">Периодов пока нет.</div> : null}
          </div>

          {selected ? (
            <div className="space-y-4 border-t border-border-soft pt-4">
              <div>
                <div className="text-[15px] font-black text-text-primary">{selected.title}</div>
                <div className="mt-1 text-[11px] text-text-secondary">Таблица пересчитывается сразу после изменения состава зачётных игр.</div>
              </div>

              {detailsLoading ? <div className="text-[12px] text-text-secondary">Пересчитываем период…</div> : null}

              {standings ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[14px] bg-surface-2 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">Дистанция CI</div>
                      <div className="mt-1 text-[18px] font-black text-text-primary">{standings.distance_games}</div>
                    </div>
                    <div className="rounded-[14px] bg-surface-2 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">Выбрано игр</div>
                      <div className="mt-1 text-[18px] font-black text-text-primary">{standings.selected_games_count}</div>
                    </div>
                    <div className="rounded-[14px] bg-surface-2 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">Порог B</div>
                      <div className="mt-1 text-[18px] font-black text-text-primary">{standings.ci_threshold_b}</div>
                    </div>
                  </div>

                  {standings.warnings?.map((warning) => (
                    <div key={warning} className="rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">{warning}</div>
                  ))}

                  <div className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-2">
                    <div className="grid grid-cols-[34px_minmax(0,1fr)_50px_62px] gap-2 border-b border-border-soft px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                      <span>#</span><span>Игрок</span><span className="text-center">Игры</span><span className="text-right">Баллы</span>
                    </div>
                    {standings.standings.length ? standings.standings.map((row) => (
                      <div key={row.player_id} className="border-b border-border-soft/70 px-3 py-2.5 last:border-b-0">
                        <div className="grid grid-cols-[34px_minmax(0,1fr)_50px_62px] items-center gap-2">
                          <span className="text-[13px] font-black text-text-muted">{row.place}</span>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-text-primary">{row.nickname}</div>
                            <div className="mt-0.5 truncate text-[10px] text-text-muted">
                              доп. {points(row.additional_total)} · побед {row.wins} · CI {points(row.ci_points)}
                            </div>
                          </div>
                          <span className="text-center text-[12px] font-semibold text-text-secondary">{row.games_played}</span>
                          <span className="text-right text-[14px] font-black text-text-primary">{points(row.total_points)}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="px-3 py-5 text-center text-[12px] text-text-secondary">Завершённых игр в зачёте пока нет.</div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 border-t border-border-soft pt-4">
                <div>
                  <div className="text-[13px] font-bold text-text-primary">Вечера</div>
                  <div className="mt-1 text-[11px] text-text-secondary">Авто = по типу и датам. Ручное решение имеет приоритет.</div>
                </div>
                {evenings.map((evening) => (
                  <div key={evening.id} className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-text-primary">{evening.title}</div>
                        <div className="mt-1 text-[11px] text-text-secondary">{formatDate(evening.starts_at)} · {formatLabels[evening.format]} · игр: {Number(evening.games_count || 0)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${evening.effective_included ? 'bg-success-soft text-success' : 'bg-surface-3 text-text-muted'}`}>
                        {evening.effective_included ? 'В зачёте' : 'Не в зачёте'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      <button type="button" onClick={() => void setEveningOverride(evening.id, null)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${evening.override_included === null ? 'border-accent bg-accent-soft text-accent' : 'border-border-soft text-text-secondary'}`}>Авто</button>
                      <button type="button" onClick={() => void setEveningOverride(evening.id, true)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${evening.override_included === true ? 'border-success/40 bg-success-soft text-success' : 'border-border-soft text-text-secondary'}`}>Включить</button>
                      <button type="button" onClick={() => void setEveningOverride(evening.id, false)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${evening.override_included === false ? 'border-danger/40 bg-danger-soft text-danger' : 'border-border-soft text-text-secondary'}`}>Исключить</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border-soft pt-4">
                <button type="button" onClick={() => setShowGames((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-[12px] bg-surface-2 px-3 text-left text-[13px] font-bold text-text-primary">
                  <span>Отдельные игры · {games.length}</span>
                  {showGames ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                </button>
                {showGames ? (
                  <div className="mt-2 space-y-2">
                    {games.map((game) => (
                      <div key={game.id} className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-bold text-text-primary">Игра №{game.global_game_number} · {game.evening_title}</div>
                            <div className="mt-1 text-[10px] text-text-secondary">{formatDate(game.starts_at)} · {formatLabels[game.format]}</div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${game.effective_included ? 'bg-success-soft text-success' : 'bg-surface-3 text-text-muted'}`}>
                            {game.effective_included ? 'В зачёте' : 'Нет'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <button type="button" onClick={() => void setGameOverride(game.id, null)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${game.game_override_included === null ? 'border-accent bg-accent-soft text-accent' : 'border-border-soft text-text-secondary'}`}>По вечеру</button>
                          <button type="button" onClick={() => void setGameOverride(game.id, true)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${game.game_override_included === true ? 'border-success/40 bg-success-soft text-success' : 'border-border-soft text-text-secondary'}`}>Включить</button>
                          <button type="button" onClick={() => void setGameOverride(game.id, false)} className={`min-h-9 rounded-[10px] border px-2 text-[11px] font-bold ${game.game_override_included === false ? 'border-danger/40 bg-danger-soft text-danger' : 'border-border-soft text-text-secondary'}`}>Исключить</button>
                        </div>
                      </div>
                    ))}
                    {!games.length ? <div className="rounded-[12px] bg-surface-2 px-3 py-4 text-[12px] text-text-secondary">Клубных игр пока нет.</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default RatingPeriodsCRM;
