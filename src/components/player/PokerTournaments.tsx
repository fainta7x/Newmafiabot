import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { countPlayers } from '../../lib/russianPlural.ts';
import PokerTournamentSchedule, { type PokerScheduleRow } from './PokerTournamentSchedule.tsx';

type Settings = {
  startAt: string; minPlayers: number; maxPlayers: number | null; startingStack: number; levelMinutes: number;
  rebuyUntilLevel: number; rebuyCostTokens: number; rebuyChips: number; seatsPerTable: number; prizeTokens: number[];
  lateRegUntilLevel?: number;
};
type Tournament = {
  id: string; title: string; description: string; status: 'registration' | 'running' | 'finished' | 'cancelled'; cancel_reason: string | null;
  start_at: string; settings: Settings; players: number; spots_left: number | null;
  clock: { level: number; small: number; big: number; secondsToNextLevel: number | null } | null; rebuy_open: boolean;
  late_reg_open?: boolean; schedule?: PokerScheduleRow[];
  my_entry: { status: string; rebuys: number; place: number | null; busted?: boolean } | null;
  alive: number | null; waiting_rebuy: number | null; my_table_id: string | null;
  standings: Array<{ nickname: string; place: number }>;
};

const whenLabel = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const statusLabel: Record<Tournament['status'], string> = { registration: 'Идёт запись', running: 'Идёт игра', finished: 'Завершён', cancelled: 'Отменён' };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Не получилось, попробуйте ещё раз');
  return body;
}

const prizeText = (prizes: number[]) => prizes.some((amount) => amount > 0)
  ? prizes.map((amount, index) => `${index + 1} место — ${amount.toLocaleString('ru-RU')}`).join(' · ')
  : 'без денежных призов';

/** «Покерные турниры»: registration for the club's poker MTTs and, for the organizer, creating one. */
export default function PokerTournaments({ onOpenTable, onTokenBalanceChange }: { onOpenTable?: (tableId: string) => void; onTokenBalanceChange?: (balance: number) => void } = {}) {
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [canOrganize, setCanOrganize] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await call('/api/player/poker/tournaments');
      setItems(body.tournaments || []);
      setCanOrganize(Boolean(body.can_organize));
    } catch { setItems((current) => current ?? []); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (id: string, method: 'POST' | 'DELETE', path = 'register') => {
    setBusy(id); setError(null);
    try {
      const body = await call(`/api/player/poker/tournaments/${encodeURIComponent(id)}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      // A re-buy spends the wallet: the cabinet's balance has to follow at once.
      if (Number.isFinite(Number(body?.token_balance))) onTokenBalanceChange?.(Number(body.token_balance));
      await load();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не получилось'); }
    finally { setBusy(null); }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const checked = (name: string) => data.get(name) !== null;
    const startLocal = text('start');
    setError(null);
    if (!startLocal) return setError('Укажите дату и время начала');
    const prizes = text('prizes').split(/[\s,;]+/).filter(Boolean).map(Number);
    const payload: Record<string, unknown> = {
      title: text('title'), startAt: new Date(startLocal).toISOString(), minPlayers: text('min') || undefined,
      maxPlayers: text('max') || undefined, startingStack: text('stack') || undefined, levelMinutes: text('level') || undefined,
      rebuyUntilLevel: text('rebuyLevel') || undefined, rebuyCostTokens: text('rebuyCost') || undefined, lateRegUntilLevel: text('lateReg') || undefined,
      rebuyChips: text('rebuyChips') || undefined, seatsPerTable: text('seats') || undefined, prizeTokens: prizes,
      announce: { club_group: checked('announceGroup'), telegram_channel: checked('announceChannel'), vk: checked('announceVk'), bot_dm: checked('announceDm') },
    };
    setBusy('new');
    try { await call('/api/player/poker/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); setCreating(false); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не получилось'); }
    finally { setBusy(null); }
  };

  if (items === null || (!items.length && !canOrganize)) return null;
  const field = 'mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-amber-200/40';

  return (
    <section data-testid="poker-tournaments" className="space-y-3 rounded-3xl border border-amber-200/15 bg-amber-200/[.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[.22em] text-amber-200/50">Турниры</div>
          <h2 className="mt-1 font-semibold">Покерные турниры</h2>
        </div>
        {canOrganize ? <button type="button" onClick={() => setCreating((value) => !value)} className="min-h-11 shrink-0 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 text-xs font-bold text-amber-100">{creating ? 'Закрыть' : '+ Турнир'}</button> : null}
      </div>

      {creating ? (
        <form onSubmit={(event) => void create(event)} className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-3" data-testid="poker-tournament-form">
          <label className="block text-xs text-white/60">Название<input name="title" required maxLength={120} defaultValue="Покерный турбо-турнир" className={field} /></label>
          <label className="block text-xs text-white/60">Начало<input name="start" type="datetime-local" required className={field} /></label>
          <label className="block text-xs text-white/60">Призы жетонами по местам (через пробел: 1 место, 2 место…)<input name="prizes" inputMode="numeric" placeholder="3000 1500 500" className={field} /></label>
          <fieldset className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3" data-testid="poker-tournament-announce">
            <legend className="px-1 text-xs font-semibold text-white/70">Объявить о турнире</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-white/80"><input name="announceGroup" type="checkbox" defaultChecked className="size-5" />В группе клуба в Telegram</label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-white/80"><input name="announceChannel" type="checkbox" className="size-5" />В открытом канале в Telegram</label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-white/80"><input name="announceVk" type="checkbox" defaultChecked className="size-5" />В сообществе во ВКонтакте</label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-white/80"><input name="announceDm" type="checkbox" className="size-5" />Личным сообщением каждому игроку клуба</label>
          </fieldset>
          <details className="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="min-h-11 cursor-pointer py-2.5 text-xs font-semibold text-white/70">Настройки турнира (турбо по умолчанию)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-white/60">Минимум игроков<input name="min" type="number" min={2} placeholder="4" className={field} /></label>
              <label className="text-xs text-white/60">Максимум (пусто — без лимита)<input name="max" type="number" min={2} className={field} /></label>
              <label className="text-xs text-white/60">Стартовый стек<input name="stack" type="number" min={100} placeholder="1000" className={field} /></label>
              <label className="text-xs text-white/60">Уровень, минут<input name="level" type="number" min={1} max={60} placeholder="6" className={field} /></label>
              <label className="text-xs text-white/60">Мест за столом<input name="seats" type="number" min={2} max={8} placeholder="6" className={field} /></label>
              <label className="text-xs text-white/60">Докупка до уровня<input name="rebuyLevel" type="number" min={0} placeholder="6" className={field} /></label>
              <label className="text-xs text-white/60">Цена докупки, жетоны<input name="rebuyCost" type="number" min={0} placeholder="1000" className={field} /></label>
              <label className="col-span-2 text-xs text-white/60">Поздняя запись в идущий турнир до уровня (0 — нет)<input name="lateReg" type="number" min={0} placeholder="6" className={field} /></label>
              <label className="text-xs text-white/60">Фишек за докупку<input name="rebuyChips" type="number" min={100} placeholder="1000" className={field} /></label>
            </div>
          </details>
          <button type="submit" disabled={busy === 'new'} className="min-h-12 w-full rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] disabled:opacity-60">Создать турнир</button>
        </form>
      ) : null}

      {error ? <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}

      {items.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-white/40">Турниров пока нет</p> : items.map((item) => {
        const mine = item.my_entry && item.my_entry.status !== 'cancelled';
        const s = item.settings;
        return (
          <article key={item.id} data-testid={`poker-tournament-${item.id}`} className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="block break-words text-sm">{item.title}</strong>
                <span className="text-[11px] text-white/45">{whenLabel(item.start_at)}</span>
              </div>
              <span className="shrink-0 rounded-full bg-white/[.07] px-2 py-1 text-[10px] font-bold text-amber-100">{statusLabel[item.status]}</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-white/55">
              {countPlayers(item.players)}{s.maxPlayers ? ` из ${s.maxPlayers}` : ''}{item.status === 'registration' ? `, нужно не меньше ${s.minPlayers}` : ''}
              {' · '}стек {s.startingStack.toLocaleString('ru-RU')} · уровень {s.levelMinutes} мин · за столом до {s.seatsPerTable}
              {' · '}{s.rebuyUntilLevel > 0 ? `докупка до уровня ${s.rebuyUntilLevel} за ${s.rebuyCostTokens.toLocaleString('ru-RU')} жетонов` : 'без докупки'}
              {(s.lateRegUntilLevel ?? 0) > 0 ? ` · поздняя запись до уровня ${s.lateRegUntilLevel}` : ''}
              {' · '}призы: {prizeText(s.prizeTokens)}
            </p>
            {item.status === 'running' && item.clock ? <p className="mt-1 text-[11px] text-amber-100/80">Блайнды {item.clock.small}/{item.clock.big}, уровень {item.clock.level}</p> : null}
            {item.status === 'cancelled' && item.cancel_reason ? <p className="mt-1 text-[11px] text-white/45">Отменён: {item.cancel_reason}</p> : null}
            {item.status === 'running' ? (
              <div className="mt-2 space-y-2 text-[11px] text-white/70">
                <p>В игре {item.alive ?? item.players}{item.waiting_rebuy ? `, ждут докупки: ${item.waiting_rebuy}` : ''}</p>
                {item.my_entry?.place ? <p className="font-bold text-rose-200">Я выбыл: {item.my_entry.place} место</p> : null}
                {item.my_entry?.busted && item.rebuy_open ? (
                  <button type="button" disabled={busy === item.id} onClick={() => void act(item.id, 'POST', 'rebuy')} className="min-h-11 w-full rounded-xl border border-amber-200/30 bg-amber-200/10 text-xs font-black text-amber-100">
                    {item.settings.rebuyCostTokens > 0 ? `Фишки закончились: докупить за ${item.settings.rebuyCostTokens.toLocaleString('ru-RU')} жетонов` : 'Фишки закончились: докупить бесплатно'}
                  </button>
                ) : item.my_entry?.busted ? <p className="text-white/50">Фишки закончились, докупка закрыта: место появится после окончания докупки</p> : null}
                {item.late_reg_open && !mine ? (
                  <button type="button" data-testid="poker-tournament-late-reg" disabled={busy === item.id} onClick={() => void act(item.id, 'POST')} className="min-h-11 w-full rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] text-xs font-black text-black disabled:opacity-60">
                    Войти в турнир бесплатно (запись до конца {s.lateRegUntilLevel}-го уровня)
                  </button>
                ) : null}
                {item.my_table_id && onOpenTable ? <button type="button" onClick={() => onOpenTable(item.my_table_id!)} className="min-h-11 w-full rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] text-xs font-black text-black">К моему столу</button> : null}
              </div>
            ) : null}
            {(item.status === 'registration' || item.status === 'running') && item.schedule?.length ? (
              <details className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2" data-testid="poker-tournament-schedule-toggle">
                <summary className="min-h-11 cursor-pointer py-2.5 text-xs font-semibold text-white/70">Уровни и время</summary>
                <div className="mt-1"><PokerTournamentSchedule rows={item.schedule} current={item.clock?.level ?? null} started={item.status === 'running'} /></div>
              </details>
            ) : null}
            {item.status === 'finished' && item.standings.length ? (
              <ol className="mt-2 space-y-0.5 text-[11px] text-white/70">
                {item.standings.slice(0, 10).map((entry) => <li key={entry.place}><b className="text-amber-100">{entry.place}.</b> {entry.nickname}</li>)}
              </ol>
            ) : null}
            {item.status === 'registration' ? (
              <div className="mt-3 flex gap-2">
                {mine ? (
                  <>
                    <span className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400/10 text-xs font-bold text-emerald-300">Запись есть</span>
                    <button type="button" disabled={busy === item.id} onClick={() => void act(item.id, 'DELETE')} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs text-white/60">Отписаться</button>
                  </>
                ) : item.spots_left === 0 ? <span className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-white/[.06] text-xs text-white/45">Мест нет</span>
                  : <button type="button" disabled={busy === item.id} onClick={() => void act(item.id, 'POST')} className="min-h-11 flex-1 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] text-xs font-black text-black disabled:opacity-60">Записаться бесплатно</button>}
                {canOrganize ? <button type="button" disabled={busy === item.id} onClick={() => void act(item.id, 'POST', 'cancel')} className="min-h-11 rounded-xl border border-red-300/20 px-3 text-xs text-red-200">Отменить</button> : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
