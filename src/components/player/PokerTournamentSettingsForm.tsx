import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DEFAULT_TURBO_SETTINGS, TURBO_BLIND_LEVELS, pokerTournamentPrizes, pokerTournamentSchedule } from '../../shared/pokerTournament.ts';
import PokerTournamentSchedule from './PokerTournamentSchedule.tsx';

export type PokerTournamentDraft = {
  title: string; start: string; min: string; max: string; stack: string; level: string; seats: string;
  rebuyLevel: string; rebuyCost: string; rebuyChips: string; lateReg: string; guarantee: string; shares: string;
};

export const NEW_TOURNAMENT_DRAFT: PokerTournamentDraft = {
  title: 'Покерный турбо-турнир', start: '', min: '', max: '', stack: '', level: '', seats: '',
  rebuyLevel: '', rebuyCost: '', rebuyChips: '', lateReg: '', guarantee: '2000', shares: '65 25 10',
};

/** `datetime-local` wants the phone's local time without a zone. */
export const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const bb = (value: number) => String(value).replace('.', ',');
const number = (raw: string, fallback: number, min: number, max: number) => {
  const value = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

/**
 * The settings of a poker tournament with the table of levels under them: every number the organizer changes moves the
 * table at once (owner, 2026-10-11: «интерактивная таблица, которая сама подстраивается и показывает тайминги»).
 * Used both to create a tournament and to edit one before it starts.
 */
export default function PokerTournamentSettingsForm({ initial, submitLabel, busy, onSubmit, onCancel, children }: {
  initial: PokerTournamentDraft; submitLabel: string; busy: boolean;
  onSubmit: (payload: Record<string, unknown>, form: HTMLFormElement) => void; onCancel?: () => void; children?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (name: keyof PokerTournamentDraft) => (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [name]: event.target.value }));
  const field = 'mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-amber-200/40';
  const levels = TURBO_BLIND_LEVELS.length;

  const plan = useMemo(() => {
    const levelMinutes = number(draft.level, DEFAULT_TURBO_SETTINGS.levelMinutes, 1, 60);
    const startingStack = number(draft.stack, DEFAULT_TURBO_SETTINGS.startingStack, 100, 1_000_000);
    const rebuyUntilLevel = number(draft.rebuyLevel, DEFAULT_TURBO_SETTINGS.rebuyUntilLevel, 0, levels);
    const lateRegUntilLevel = number(draft.lateReg, DEFAULT_TURBO_SETTINGS.lateRegUntilLevel, 0, levels);
    const parsedStart = draft.start ? new Date(draft.start).getTime() : NaN;
    const startMs = Number.isFinite(parsedStart) ? parsedStart : null;
    const rows = pokerTournamentSchedule({ levels: TURBO_BLIND_LEVELS, levelMinutes, startingStack, rebuyUntilLevel, lateRegUntilLevel }, startMs);
    return { rows, levelMinutes, rebuyUntilLevel, lateRegUntilLevel, startMs, total: levels * levelMinutes };
  }, [draft.level, draft.stack, draft.rebuyLevel, draft.lateReg, draft.start, levels]);

  const shares = useMemo(() => {
    const values = draft.shares.split(/[\s,;]+/).filter(Boolean).map(Number);
    const sum = values.reduce((total, value) => total + value, 0);
    return { values, sum, valid: values.length > 0 && values.length <= 10 && values.every((value) => Number.isInteger(value) && value >= 0) && sum === 100 };
  }, [draft.shares]);
  const prizes = useMemo(() => {
    const guaranteeTokens = number(draft.guarantee, 0, 0, 10_000_000);
    const rebuyCostTokens = number(draft.rebuyCost, DEFAULT_TURBO_SETTINGS.rebuyCostTokens, 0, 1_000_000);
    return { rebuyCostTokens, now: shares.valid ? pokerTournamentPrizes({ prizeTokens: [], guaranteeTokens, prizeSharesPct: shares.values, rebuyCostTokens }, 0, shares.values.length) : null };
  }, [draft.guarantee, draft.rebuyCost, shares]);

  const endOf = (level: number) => (plan.startMs !== null ? ` (до ${clock(plan.startMs + level * plan.levelMinutes * 60_000)} МСК)` : '');
  const thin = (level: number) => (level > 0 ? plan.rows[level - 1]?.startingStackBb ?? 99 : 99) < 10;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.start) return onSubmit({}, event.currentTarget);
    const text = (value: string) => value.trim() || undefined;
    onSubmit({
      title: draft.title.trim(), startAt: new Date(draft.start).toISOString(), minPlayers: text(draft.min), maxPlayers: draft.max.trim(),
      startingStack: text(draft.stack), levelMinutes: text(draft.level), rebuyUntilLevel: text(draft.rebuyLevel), rebuyCostTokens: text(draft.rebuyCost),
      lateRegUntilLevel: text(draft.lateReg), rebuyChips: text(draft.rebuyChips), seatsPerTable: text(draft.seats),
      guaranteeTokens: draft.guarantee.trim() || '0', prizeSharesPct: shares.values,
    }, event.currentTarget);
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-3" data-testid="poker-tournament-form">
      <label className="block text-xs text-white/60">Название<input name="title" required maxLength={120} value={draft.title} onChange={set('title')} className={field} /></label>
      <label className="block text-xs text-white/60">Начало<input name="start" type="datetime-local" required value={draft.start} onChange={set('start')} className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/60">Гарантия клуба, жетоны<input name="guarantee" type="number" min={0} value={draft.guarantee} onChange={set('guarantee')} className={field} /></label>
        <label className="text-xs text-white/60">Доли фонда по местам, % (в сумме 100)<input name="shares" inputMode="numeric" value={draft.shares} onChange={set('shares')} className={field} /></label>
      </div>
      {!shares.valid ? <p role="alert" className="text-[11px] text-amber-200">Доли дают {Number.isFinite(shares.sum) ? shares.sum : 0}%, нужно ровно 100%. Например: 65 25 10.</p> : null}
      {children}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-xs font-semibold text-white/70">Настройки турнира (пусто — турбо по умолчанию)</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-white/60">Минимум игроков<input name="min" type="number" min={2} placeholder="4" value={draft.min} onChange={set('min')} className={field} /></label>
          <label className="text-xs text-white/60">Максимум (пусто — без лимита)<input name="max" type="number" min={2} value={draft.max} onChange={set('max')} className={field} /></label>
          <label className="text-xs text-white/60">Стартовый стек<input name="stack" type="number" min={100} placeholder="1000" value={draft.stack} onChange={set('stack')} className={field} /></label>
          <label className="text-xs text-white/60">Уровень, минут<input name="level" type="number" min={1} max={60} placeholder="6" value={draft.level} onChange={set('level')} className={field} /></label>
          <label className="text-xs text-white/60">Мест за столом<input name="seats" type="number" min={2} max={8} placeholder="6" value={draft.seats} onChange={set('seats')} className={field} /></label>
          <label className="text-xs text-white/60">Докупка до уровня<input name="rebuyLevel" type="number" min={0} max={levels} placeholder="6" value={draft.rebuyLevel} onChange={set('rebuyLevel')} className={field} /></label>
          <label className="text-xs text-white/60">Цена докупки, жетоны<input name="rebuyCost" type="number" min={0} placeholder="200" value={draft.rebuyCost} onChange={set('rebuyCost')} className={field} /></label>
          <label className="text-xs text-white/60">Фишек за докупку<input name="rebuyChips" type="number" min={100} placeholder="1000" value={draft.rebuyChips} onChange={set('rebuyChips')} className={field} /></label>
          <label className="col-span-2 text-xs text-white/60">Поздняя запись в идущий турнир до уровня (0 — нет)<input name="lateReg" type="number" min={0} max={levels} placeholder="6" value={draft.lateReg} onChange={set('lateReg')} className={field} /></label>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200/15 bg-amber-200/[.04] p-3" data-testid="poker-tournament-draft-schedule">
        <div className="mb-2 text-xs font-semibold text-amber-100/80">Как пройдёт турнир</div>
        <ul className="mb-2 space-y-1 text-[11px] leading-5 text-white/65">
          <li>Блайнды растут по {levels} уровням, всего {plan.total} мин{plan.startMs !== null ? ` — последний уровень закончится в ${clock(plan.startMs + plan.total * 60_000)} МСК` : ''}.</li>
          {plan.lateRegUntilLevel > 0 ? <li>Войти в идущий турнир можно до конца {plan.lateRegUntilLevel}-го уровня{endOf(plan.lateRegUntilLevel)}.</li> : <li>Войти в идущий турнир нельзя.</li>}
          {plan.rebuyUntilLevel > 0 ? <li>Докупиться можно до конца {plan.rebuyUntilLevel}-го уровня{endOf(plan.rebuyUntilLevel)}.</li> : <li>Докупки нет.</li>}
          {prizes.now ? <li data-testid="poker-tournament-draft-prizes">Призовой фонд: гарантия {draft.guarantee.trim() || '0'} жетонов плюс все докупки{plan.rebuyUntilLevel > 0 && prizes.rebuyCostTokens > 0 ? ` (каждая добавляет ${prizes.rebuyCostTokens})` : ''}. Сейчас по местам: {prizes.now.payouts.map((value, index) => `${index + 1} — ${value.toLocaleString('ru-RU')}`).join(', ')}.</li> : null}
          {thin(plan.rebuyUntilLevel) ? <li className="text-amber-200">К концу докупки стек равен меньше 10 ББ ({bb(plan.rows[plan.rebuyUntilLevel - 1].startingStackBb)}): докупаться почти бессмысленно.</li> : null}
          {thin(plan.lateRegUntilLevel) ? <li className="text-amber-200">К концу поздней записи стек равен меньше 10 ББ ({bb(plan.rows[plan.lateRegUntilLevel - 1].startingStackBb)}): новичок войдёт почти без игры.</li> : null}
        </ul>
        <PokerTournamentSchedule rows={plan.rows} />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy || !shares.valid} className="min-h-12 flex-1 rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] disabled:opacity-60">{submitLabel}</button>
        {onCancel ? <button type="button" onClick={onCancel} className="min-h-12 rounded-2xl border border-white/10 px-4 text-sm text-white/60">Отмена</button> : null}
      </div>
    </form>
  );
}
