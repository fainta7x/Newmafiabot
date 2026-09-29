import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarPlus, Lock } from 'lucide-react';
import { api, type GameEvening } from '../../lib/api.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat, noviceStartsAt, type EveningFormat } from '../../lib/eveningFormat.ts';
import { canOrganizeEveningFormat, organizeFormatsSummary, normalizeOrganizeFormats } from '../../lib/organizeFormats.ts';
import MobileSheet from '../ui/MobileSheet.tsx';
import CustomEventsPanel from './CustomEventsPanel.tsx';

/**
 * Limited cabinet «Проводит вечера» (owner decision 2026-09-29): the player sees every evening,
 * creates evenings of the kinds the owner marked and runs only his own. The server enforces the same rule.
 */
type Props = {
  playerId: string;
  formats: string[];
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onChanged: () => Promise<void> | void;
};

const field = 'w-full min-h-11 rounded-[12px] border border-white/10 bg-black/20 px-3 text-[14px] text-white outline-none placeholder:text-white/35';
const label = 'mb-1.5 block text-[12px] font-semibold text-white/60';
const moscowIso = (value: string) => `${value.length === 16 ? `${value}:00` : value}+03:00`;
const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
// Tournaments have their own flow (registration of exactly ten, judge, fee, prizes), so a host creates evenings only.
const FORMAT_ORDER: EveningFormat[] = ['NOVICE', 'CASUAL', 'RATING'];
const DEFAULT_TITLE: Record<EveningFormat, string> = { NOVICE: 'Вечер для новичков', CASUAL: 'Клубный вечер', RATING: 'Рейтинговый вечер', TOURNAMENT: 'Турнир' };
const DEFAULT_PRICE: Record<EveningFormat, number> = { NOVICE: 200, CASUAL: 100, RATING: 300, TOURNAMENT: 500 };

export function EventHostCabinet({ playerId, formats, evenings, onOpenEvening, onChanged }: Props) {
  const marks = normalizeOrganizeFormats(formats);
  const host = { organize_formats: marks.join(',') };
  const allowedFormats = FORMAT_ORDER.filter((format) => canOrganizeEveningFormat(host, format));
  const canCreateCustom = marks.includes('CUSTOM');
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<EveningFormat>(allowedFormats[0] || 'CASUAL');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venue, setVenue] = useState('Суп с Котом');
  const [price, setPrice] = useState(DEFAULT_PRICE[allowedFormats[0] || 'CASUAL']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isMine = (evening: GameEvening) => String((evening as any).organizer_player_id || '') === playerId;
  // Upcoming evenings, plus own evenings that are not closed yet — however old, so they can be finished.
  const upcoming = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    return evenings
      .filter((evening) => evening.status !== 'cancelled' && (
        new Date(evening.starts_at).getTime() >= dayAgo
        || (String((evening as any).organizer_player_id || '') === playerId && evening.status !== 'completed' && !(evening as any).settled_at)
      ))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [evenings, playerId]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !startsAt) return;
    setSaving(true);
    setError('');
    try {
      const start = moscowIso(startsAt);
      const fixedPrice = format === 'CASUAL' ? 100 : format === 'NOVICE' ? 200 : price;
      const created = await api.createEvening({
        title: title.trim() || `${DEFAULT_TITLE[format]} — ${new Date(start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}`,
        starts_at: start,
        timezone: 'Europe/Moscow',
        format,
        status: 'draft',
        default_price: fixedPrice,
        venue: venue.trim() || 'Суп с Котом',
      });
      const slots = await fetch(`/api/evenings/${encodeURIComponent(created.id)}/slots`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_slots: 6, slot_duration_minutes: 60, price_per_game: fixedPrice, starts_at: start }),
      });
      // The evening exists either way: open it instead of letting a retry create a second draft.
      setOpen(false);
      setTitle('');
      setStartsAt('');
      await onChanged();
      if (!slots.ok) window.alert('Вечер создан, но игры не настроились. Настройте игры в карточке вечера.');
      onOpenEvening(created.id);
    } catch (createError: any) {
      setError(createError?.message || 'Не удалось создать вечер');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="event-host-cabinet">
      {canCreateCustom ? <CustomEventsPanel /> : null}
      <section className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
        <h2 className="text-[16px] font-bold text-white">Мои вечера</h2>
        <p className="mt-1 text-[12px] leading-5 text-white/55">
          Создавайте вечера и проводите их: приход, оплата, столы и игры, анонс, закрытие. {organizeFormatsSummary(marks)}.
        </p>
        <button type="button" onClick={() => { setError(''); setOpen(true); }} disabled={!allowedFormats.length}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-[14px] font-semibold text-[#090a0d] disabled:opacity-40">
          <CalendarPlus className="h-4 w-4" /> Создать вечер
        </button>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03]">
        <h3 className="px-3.5 pt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">Ближайшие вечера</h3>
        {upcoming.length ? upcoming.map((evening) => {
          const mine = isMine(evening);
          const fmt = normalizeEveningFormat(evening.format);
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[14px] font-semibold text-white">{evening.title}</strong>
                <span className="mt-0.5 block text-[12px] text-white/50">{displayMoscow(evening.starts_at)} · {EVENING_FORMAT_LABELS[fmt]}{evening.status === 'draft' ? ' · черновик' : ''}</span>
                <span className="mt-0.5 block text-[12px] text-white/40">
                  {mine ? 'Проводите вы' : (evening as any).organizer_nickname ? `Проводит ${(evening as any).organizer_nickname}` : 'Организатор не назначен'}
                  {' · '}записано {evening.registered_count || 0}
                </span>
              </span>
              {mine ? <ArrowRight className="h-4 w-4 shrink-0 text-white/40" /> : <Lock className="h-4 w-4 shrink-0 text-white/25" aria-label="Только просмотр" />}
            </>
          );
          return mine ? (
            <button key={evening.id} type="button" data-testid={`event-host-evening-${evening.id}`} onClick={() => onOpenEvening(evening.id)}
              className="flex min-h-[72px] w-full items-center gap-3 border-t border-white/[0.07] px-3.5 py-3 text-left active:bg-white/[0.04]">{content}</button>
          ) : (
            <div key={evening.id} data-testid={`event-host-evening-${evening.id}`} className="flex min-h-[72px] items-center gap-3 border-t border-white/[0.07] px-3.5 py-3 opacity-80">{content}</div>
          );
        }) : <p className="px-3.5 py-4 text-[13px] text-white/50">Ближайших вечеров пока нет.</p>}
      </section>

      <MobileSheet open={open} onClose={() => setOpen(false)} title="Новый вечер">
        <form onSubmit={create} className="space-y-3">
          <label className="block"><span className={label}>Какой вечер</span>
            <select value={format} onChange={(event) => {
              const next = event.target.value as EveningFormat;
              setFormat(next);
              setPrice(DEFAULT_PRICE[next]);
              if (next === 'NOVICE') setStartsAt((current) => noviceStartsAt(current));
            }} className={field}>
              {allowedFormats.map((item) => <option key={item} value={item}>{EVENING_FORMAT_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="block"><span className={label}>Первая игра · Москва</span>
            <input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={`${field} font-mono`} />
          </label>
          <label className="block"><span className={label}>Название (можно оставить пустым)</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className={field} placeholder="Например, «Пятничная мафия»" />
          </label>
          <label className="block"><span className={label}>Где</span>
            <input value={venue} onChange={(event) => setVenue(event.target.value)} className={field} />
          </label>
          {format === 'RATING' || format === 'TOURNAMENT' ? (
            <label className="block"><span className={label}>Цена за игру, ₽</span>
              <input type="number" min={0} step={50} value={price} onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))} className={field} />
            </label>
          ) : (
            <p className="rounded-[12px] bg-black/20 px-3 py-2 text-[12px] text-white/55">
              {format === 'CASUAL' ? 'Клубный вечер: 100 ₽ за игру, не больше 400 ₽ за вечер.' : 'Вечер для новичков: первые два вечера бесплатно, дальше 200 ₽ за игру.'}
            </p>
          )}
          <p className="text-[12px] leading-4 text-white/45">Вечер создастся черновиком на 6 игр по часу. Игры, анонс и остальное — в карточке вечера.</p>
          {error ? <p className="rounded-[12px] bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{error}</p> : null}
          <button type="submit" disabled={saving || !startsAt} className="min-h-12 w-full rounded-[12px] bg-white text-[14px] font-bold text-[#090a0d] disabled:opacity-40">
            {saving ? 'Создаём…' : 'Создать вечер'}
          </button>
        </form>
      </MobileSheet>
    </div>
  );
}

export default EventHostCabinet;
