import React, { useEffect, useRef, useState } from 'react';
import { Plus, ArrowRight, Calendar, Trophy } from 'lucide-react';
import { api, GameEvening } from '../../lib/api.ts';
import { EVENING_FORMAT_DESCRIPTIONS, EVENING_FORMAT_LABELS, normalizeEveningFormat, type EveningFormat } from '../../lib/eveningFormat.ts';
import MobileSheet from '../ui/MobileSheet.tsx';
import { TournamentsList } from './tournaments/TournamentsList.tsx';
import { TournamentDetailView } from './tournaments/TournamentDetailView.tsx';

interface EveningsListProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onCreateEvening: (data: Partial<GameEvening>) => Promise<void>;
  initialCreateOpen?: boolean;
  onInitialCreateHandled?: () => void;
}

const toMoscowStartsAt = (value: string) => `${value.length === 16 ? `${value}:00` : value}+03:00`;
const inputClass = 'w-full min-h-11 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent';
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted';

export const EveningsList: React.FC<EveningsListProps> = ({
  evenings,
  onOpenEvening,
  onCreateEvening,
  initialCreateOpen = false,
  onInitialCreateHandled,
}) => {
  const [subTab, setSubTab] = useState<'evenings' | 'tournaments'>('evenings');
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const tournamentListScrollRef = useRef(0);

  const latestDefaultPrice = Number(evenings.find((item) => Number(item.default_price) >= 0)?.default_price ?? 500);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [format, setFormat] = useState<EveningFormat>('CASUAL');
  const [defaultPrice, setDefaultPrice] = useState(500);
  const [venue, setVenue] = useState('Суп с Котом');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingFriday, setCreatingFriday] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setTitle('');
    setStartsAt('');
    setFormat('CASUAL');
    setDefaultPrice(latestDefaultPrice);
    setVenue('Суп с Котом');
    setNotes('');
    setCreateError(null);
  };

  const openCreateModal = () => {
    setPageError(null);
    setCreateError(null);
    setDefaultPrice(latestDefaultPrice);
    setVenue('Суп с Котом');
    setFormat('CASUAL');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (saving) return;
    setShowCreateModal(false);
    setCreateError(null);
  };

  useEffect(() => {
    if (!initialCreateOpen) return;
    setSubTab('evenings');
    setActiveTournamentId(null);
    setDefaultPrice(latestDefaultPrice);
    setVenue('Суп с Котом');
    setFormat('CASUAL');
    setCreateError(null);
    setShowCreateModal(true);
    onInitialCreateHandled?.();
  }, [initialCreateOpen, latestDefaultPrice, onInitialCreateHandled]);

  const moveScroll = (top: number) => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startsAt || saving) return;

    setSaving(true);
    setCreateError(null);
    try {
      await onCreateEvening({
        title: title.trim(),
        starts_at: toMoscowStartsAt(startsAt),
        timezone: 'Europe/Moscow',
        format,
        default_price: defaultPrice,
        venue: venue.trim() || 'Суп с Котом',
        notes: notes.trim(),
        status: 'draft',
      } as Partial<GameEvening>);
      setShowCreateModal(false);
      resetCreateForm();
    } catch (err: any) {
      setCreateError(err?.message || 'Не удалось создать вечер');
    } finally {
      setSaving(false);
    }
  };

  const createNextFriday = async () => {
    if (creatingFriday) return;
    setCreatingFriday(true);
    setPageError(null);
    try {
      const result = await api.createNextFriday();
      onOpenEvening(result.id);
    } catch (err: any) {
      setPageError(err?.message || 'Не удалось создать вечер на следующую пятницу');
    } finally {
      setCreatingFriday(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex w-full items-center gap-1.5 self-start rounded-2xl border border-border-soft bg-surface-1 p-1 text-xs font-bold sm:w-auto">
        <button
          type="button"
          onClick={() => {
            const changed = subTab !== 'evenings' || activeTournamentId !== null;
            setSubTab('evenings');
            setActiveTournamentId(null);
            if (changed) moveScroll(0);
          }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 transition-all sm:flex-initial ${
            subTab === 'evenings'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Игровые вечера</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const changed = subTab !== 'tournaments';
            setSubTab('tournaments');
            setActiveTournamentId(null);
            if (changed) moveScroll(0);
          }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 transition-all sm:flex-initial ${
            subTab === 'tournaments'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Trophy className="h-4 w-4" />
          <span>Турниры</span>
        </button>
      </div>

      {subTab === 'tournaments' ? (
        activeTournamentId ? (
          <TournamentDetailView
            tournamentId={activeTournamentId}
            onBack={() => {
              setActiveTournamentId(null);
              moveScroll(tournamentListScrollRef.current);
            }}
          />
        ) : (
          <TournamentsList onOpenTournament={(id) => { tournamentListScrollRef.current = typeof window !== 'undefined' ? window.scrollY : 0; setActiveTournamentId(id); moveScroll(0); }} />
        )
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border-soft bg-surface-1 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-text-primary">Игровые вечера клуба</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Расписание, запись игроков и расчёт каждого вечера</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={creatingFriday}
                onClick={() => void createNextFriday()}
                className="flex min-h-11 items-center gap-1.5 rounded-2xl bg-success px-4 text-xs font-bold uppercase tracking-wider text-white transition-all disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>{creatingFriday ? 'Создаём…' : 'Следующая пятница'}</span>
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="flex min-h-11 items-center gap-1.5 rounded-2xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" />
                <span>Новый вечер</span>
              </button>
            </div>
          </div>

          {pageError && (
            <div className="rounded-[16px] border border-danger/20 bg-danger-soft px-3 py-3 text-[12px] text-text-primary">
              <span className="font-semibold">Не удалось создать вечер.</span> <span className="text-text-secondary">{pageError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {evenings.map((evening) => {
              const isCompleted = evening.status === 'completed' || Boolean(evening.settled_at);
              const isActive = evening.status === 'active';
              const canonicalFormat = normalizeEveningFormat(evening.format);

              return (
                <div
                  key={evening.id}
                  className={`relative flex flex-col justify-between space-y-4 overflow-hidden rounded-3xl border bg-surface-1 p-5 transition-all hover:border-accent/40 ${
                    isActive
                      ? 'border-success/50 shadow-lg shadow-success/10'
                      : 'border-border-soft'
                  } ${isCompleted ? 'opacity-90' : ''}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isActive
                          ? 'border-success/30 bg-success-soft text-success'
                          : isCompleted
                            ? 'border-border-soft bg-surface-2 text-text-muted'
                            : evening.status === 'draft'
                              ? 'border-border-soft bg-surface-2 text-text-secondary'
                              : 'border-warning/30 bg-warning-soft text-warning'
                      }`}>
                        {isActive ? 'Идёт сейчас' : isCompleted ? 'Рассчитан и закрыт' : evening.status === 'draft' ? 'Черновик' : 'Запланирован'}
                      </span>

                      <span className="text-right text-[11px] font-bold text-text-secondary">
                        {EVENING_FORMAT_LABELS[canonicalFormat]}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold leading-snug text-text-primary">{evening.title}</h3>
                      <p className="mt-1 text-xs text-text-secondary">
                        📅 {new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      {evening.venue && <p className="text-[11px] text-text-secondary">📍 {evening.venue}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border-soft bg-surface-2 p-2.5 text-center font-mono">
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-text-muted">Идут</span>
                        <span className="text-sm font-bold text-text-primary">{evening.registered_count || 0}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-text-muted">Пришло</span>
                        <span className="text-sm font-bold text-success">{evening.attended_count || 0}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-text-muted">Выручка</span>
                        <span className="text-sm font-bold text-warning">{evening.total_revenue || 0} ₽</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenEvening(evening.id)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-2 py-2.5 text-xs font-bold uppercase tracking-wider text-text-primary transition-all hover:bg-surface-hover"
                  >
                    <span>Открыть вечер</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {evenings.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border-soft bg-surface-1/60 px-5 py-10 text-center">
              <div className="text-sm font-semibold text-text-secondary">Игровых вечеров пока нет</div>
              <div className="mt-1 text-xs text-text-muted">Создай первый черновик — запись и Telegram появятся после публикации.</div>
              <button type="button" onClick={openCreateModal} className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-xs font-bold text-white">Создать вечер</button>
            </div>
          )}
        </>
      )}

      <MobileSheet
        open={showCreateModal}
        title="Новый игровой вечер"
        subtitle="Сначала создаём черновик. Публикация и Telegram-рассылка включаются отдельно."
        onClose={closeCreateModal}
        widthClass="sm:max-w-lg"
        footer={(
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" disabled={saving} onClick={closeCreateModal} className="min-h-12 rounded-[12px] border border-border-soft bg-surface-2 px-4 text-[12px] font-semibold text-text-secondary disabled:opacity-50">Отмена</button>
            <button type="submit" form="create-evening-form" disabled={saving || !title.trim() || !startsAt} className="min-h-12 rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-40">
              {saving ? 'Сохраняем…' : 'Создать черновик'}
            </button>
          </div>
        )}
      >
        <form id="create-evening-form" onSubmit={handleSubmit} className="space-y-4">
          {createError && (
            <div className="rounded-[14px] border border-danger/20 bg-danger-soft px-3 py-3 text-[11px] leading-4 text-text-secondary">{createError}</div>
          )}

          <label className="block">
            <span className={labelClass}>Название вечера</span>
            <input
              type="text"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Игровой вечер — 14 августа"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Дата и время · Москва</span>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Формат</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as EveningFormat)} className={inputClass}>
                <option value="NOVICE">Для новичков</option>
                <option value="CASUAL">Для отдыха</option>
                <option value="RATING">Рейтинговый</option>
                <option value="TOURNAMENT">Турнир</option>
              </select>
              <p className="mt-2 rounded-[12px] border border-border-soft bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
                {EVENING_FORMAT_DESCRIPTIONS[format]}
              </p>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Цена по умолчанию, ₽</span>
              <input
                type="number"
                min="0"
                value={defaultPrice}
                onChange={(event) => setDefaultPrice(parseInt(event.target.value, 10) || 0)}
                className={`${inputClass} font-mono`}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Локация</span>
              <input type="text" value={venue} onChange={(event) => setVenue(event.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Заметки / описание</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Дополнительная информация для организатора"
              className={`${inputClass} min-h-24 resize-none py-3`}
            />
          </label>
        </form>
      </MobileSheet>
    </div>
  );
};
