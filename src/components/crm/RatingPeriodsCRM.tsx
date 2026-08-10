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

const toDateInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export const RatingPeriodsCRM: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [periods, setPeriods] = useState<RatingPeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evenings, setEvenings] = useState<PeriodEvening[]>([]);
  const [loading, setLoading] = useState(false);
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

  const loadEvenings = async (periodId: string) => {
    try {
      const data = await apiJson<{ evenings: PeriodEvening[] }>(`/api/rating-periods/${periodId}/evenings`);
      setEvenings(data.evenings || []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить вечера периода');
    }
  };

  useEffect(() => {
    if (!expanded) return;
    void loadPeriods();
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !selectedId) {
      setEvenings([]);
      return;
    }
    void loadEvenings(selectedId);
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
      await loadEvenings(selectedId);
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить участие вечера');
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
            <div className="space-y-2 border-t border-border-soft pt-4">
              <div>
                <div className="text-[13px] font-bold text-text-primary">Вечера · {selected.title}</div>
                <div className="mt-1 text-[11px] text-text-secondary">Авто = по типу и датам. «Включить» и «Исключить» имеют приоритет и могут быть поставлены на любой вечер.</div>
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default RatingPeriodsCRM;
