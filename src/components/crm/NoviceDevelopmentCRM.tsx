import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, UserRoundCheck, X } from 'lucide-react';

type Application = {
  id: string;
  player_id: string | null;
  nickname: string | null;
  entry_route: 'NOVICE' | 'EXPERIENCED';
  status: string;
  notes: string | null;
  organizer_notes: string | null;
  evening_title: string | null;
  evening_starts_at: string | null;
  game_level: string | null;
  club_stage: string | null;
  novice_visits: number;
  created_at: string;
};

type AwaitingPlayer = {
  id: string;
  nickname: string | null;
  telegram_username: string | null;
  has_vk: boolean;
  created_at: string;
};

const statusLabel: Record<string, string> = {
  NEW: 'Новая', CONFIRMED: 'Подтверждена', ATTENDED: 'Посетил', COMPLETED: 'Этап завершён',
  CONVERTED: 'В основном клубе', CANCELLED: 'Отменена',
};

const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
  : 'Без выбранного вечера';

// Transfers now raise the level to «Клубный»; players transferred earlier may still carry `novice`,
// which admits only NOVICE evenings, so the organizer must see that step.
const levelBlocksCasual = (application: Application) => application.game_level === 'novice' && application.status === 'CONVERTED';

export function NoviceDevelopmentCRM({ onOpenPlayer }: { onOpenPlayer?: (playerId: string) => void } = {}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [operations, setOperations] = useState<any>(null);
  const [awaiting, setAwaiting] = useState<AwaitingPlayer[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/novice/applications', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить воронку');
      setApplications(Array.isArray(body.applications) ? body.applications : []);
      setOperations(body.operations || null);
      setAwaiting(Array.isArray(body.awaiting_players) ? body.awaiting_players : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить воронку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (application: Application, status: string) => {
    setBusy(application.id);
    setError('');
    try {
      const response = await fetch(`/api/novice/applications/${encodeURIComponent(application.id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось обновить заявку');
      await load();
    } catch (updateError: any) {
      setError(updateError?.message || 'Не удалось обновить заявку');
    } finally {
      setBusy(null);
    }
  };

  const convert = async (application: Application) => {
    if (!application.player_id) return;
    setBusy(application.id);
    try {
      const response = await fetch(`/api/novice/players/${encodeURIComponent(application.player_id)}/convert`, {
        method: 'POST', credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось перевести игрока');
      await load();
    } catch (updateError: any) {
      setError(updateError?.message || 'Не удалось перевести игрока');
    } finally {
      setBusy(null);
    }
  };

  const admit = async (player: AwaitingPlayer, entryRoute: 'NOVICE' | 'EXPERIENCED') => {
    setBusy(player.id);
    setError('');
    try {
      const response = await fetch(`/api/novice/players/${encodeURIComponent(player.id)}/admit`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_route: entryRoute }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить решение');
      await load();
    } catch (admitError: any) {
      setError(admitError?.message || 'Не удалось сохранить решение');
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => filter === 'all'
    ? applications
    : applications.filter((item) => !['CANCELLED', 'CONVERTED'].includes(item.status)), [applications, filter]);
  const newCount = applications.filter((item) => item.status === 'NEW').length + awaiting.length;
  const readyCount = applications.filter((item) => item.status === 'COMPLETED').length;

  return <div className="space-y-3">
    <section className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="text-[11px] text-white/45">Новые</span><strong className="mt-1 block text-xl">{newCount}</strong></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="text-[11px] text-white/45">В работе</span><strong className="mt-1 block text-xl">{visible.length}</strong></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><span className="text-[11px] text-white/45">К переводу</span><strong className="mt-1 block text-xl">{readyCount}</strong></div>
    </section>

    {operations?.next_evening ? <section className="rounded-[20px] border border-sky-300/15 bg-sky-300/[0.07] p-3">
      <strong className="text-[14px] text-sky-100">{operations.next_evening.title}</strong>
      <p className="mt-1 text-[12px] leading-5 text-white/55">Записано: {operations.next_evening.registered_count}. Проверка набора — {dateLabel(operations.thursday_check_at)}, решение — {dateLabel(operations.friday_decision_at)}.</p>
      <p className="mt-1 text-[11px] text-white/35">Автоматической отмены нет: итоговое решение принимает организатор.</p>
    </section> : null}

    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex rounded-xl bg-black/20 p-1">
        {([['active', 'Активные'], ['all', 'Все']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-10 rounded-lg px-3 text-[12px] font-semibold ${filter === id ? 'bg-white text-black' : 'text-white/55'}`}>{label}</button>)}
      </div>
      <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>

    {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-3 text-[12px] text-rose-100">{error}</div> : null}
    {!loading && !visible.length && !awaiting.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center text-sm text-white/45">Заявок пока нет</div> : null}

    {awaiting.length ? <section className="space-y-2" aria-label="Новые игроки без заявки">
      <h3 className="px-1 text-[13px] font-semibold text-amber-100">Зарегистрировались, ждут решения · {awaiting.length}</h3>
      {awaiting.map((player) => <article key={player.id} className="rounded-[20px] border border-amber-300/20 bg-amber-300/[0.06] p-3">
        <h4 className="truncate text-[15px] font-semibold">{player.nickname || 'Игрок'}</h4>
        <p className="mt-1 text-[12px] text-white/45">{player.telegram_username ? `@${player.telegram_username}` : player.has_vk ? 'VK' : 'Telegram'} · {dateLabel(player.created_at)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={busy === player.id} type="button" onClick={() => void admit(player, 'EXPERIENCED')} className="min-h-11 rounded-xl bg-emerald-300/15 text-[12px] font-semibold text-emerald-100"><UserRoundCheck className="mr-1 inline h-4 w-4" />В клуб (умеет играть)</button>
          <button disabled={busy === player.id} type="button" onClick={() => void admit(player, 'NOVICE')} className="min-h-11 rounded-xl bg-sky-300/10 text-[12px] font-semibold text-sky-100"><Check className="mr-1 inline h-4 w-4" />В школу новичков</button>
        </div>
      </article>)}
    </section> : null}

    <div className="space-y-2">
      {visible.map((application) => <article key={application.id} className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="truncate text-[15px] font-semibold">{application.nickname || 'Игрок без профиля'}</h3><p className="mt-1 text-[12px] text-white/45">{application.entry_route === 'NOVICE' ? 'Новичок в мафии' : 'Уже умеет играть'} · {application.novice_visits || 0} посещений</p></div>
          <span className="shrink-0 rounded-full bg-sky-300/10 px-2 py-1 text-[11px] text-sky-100">{statusLabel[application.status] || application.status}</span>
        </div>
        <div className="mt-3 rounded-xl bg-black/20 p-2.5 text-[12px] leading-5 text-white/60"><div>{application.evening_title || 'Первая заявка без выбранного вечера'}</div><div className="text-white/35">{dateLabel(application.evening_starts_at || application.created_at)}</div>{application.notes ? <div className="mt-1 text-white/75">«{application.notes}»</div> : null}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {application.status === 'NEW' ? <><button disabled={busy === application.id} type="button" onClick={() => void update(application, 'CONFIRMED')} className="min-h-11 rounded-xl bg-emerald-300/15 text-[12px] font-semibold text-emerald-100"><Check className="mr-1 inline h-4 w-4" />Подтвердить</button><button disabled={busy === application.id} type="button" onClick={() => void update(application, 'CANCELLED')} className="min-h-11 rounded-xl bg-rose-300/10 text-[12px] font-semibold text-rose-100"><X className="mr-1 inline h-4 w-4" />Отклонить</button></> : null}
          {application.status === 'CONFIRMED' ? <button disabled={busy === application.id} type="button" onClick={() => void update(application, 'ATTENDED')} className="col-span-2 min-h-11 rounded-xl bg-white/[0.08] text-[12px] font-semibold">Отметить первое посещение</button> : null}
          {application.status === 'ATTENDED' ? <button disabled={busy === application.id} type="button" onClick={() => void update(application, 'COMPLETED')} className="col-span-2 min-h-11 rounded-xl bg-white/[0.08] text-[12px] font-semibold">Новичковый этап пройден</button> : null}
          {application.status === 'COMPLETED' ? <button disabled={busy === application.id} type="button" onClick={() => void convert(application)} className="col-span-2 min-h-11 rounded-xl bg-emerald-300/15 text-[12px] font-semibold text-emerald-100"><UserRoundCheck className="mr-1 inline h-4 w-4" />Перевести в основной клуб · уровень «Клубный»</button> : null}
        </div>
        {levelBlocksCasual(application) ? <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-2.5 text-[12px] leading-5 text-amber-100">
          Уровень игры — «Новичок»: на обычные вечера запись закрыта. Смени уровень в карточке игрока.
          {onOpenPlayer && application.player_id ? <button type="button" onClick={() => onOpenPlayer(String(application.player_id))} className="mt-2 block min-h-10 w-full rounded-lg bg-amber-300/15 text-[12px] font-semibold">Открыть карточку игрока</button> : null}
        </div> : null}
      </article>)}
    </div>
  </div>;
}

export default NoviceDevelopmentCRM;
