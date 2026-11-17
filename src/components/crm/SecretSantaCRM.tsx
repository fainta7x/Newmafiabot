import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import {
  SANTA_GIFT_LIMIT_RUB, SANTA_MIN_PARTICIPANTS, santaAnnouncementText, santaEveningWhen,
  type SantaEvening, type SantaOrganizerState,
} from '../../shared/secretSanta.ts';

/** «Тайный Санта» for the organizer (owner, 2026-11-17): open the registration, see who confirmed, press the draw. */
const API = '/api/crm/santa';
type Payload = SantaOrganizerState & { evenings: SantaEvening[] };
const message = (error: unknown) => error instanceof Error ? error.message : 'Не получилось';

export default function SecretSantaCRM() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [eveningId, setEveningId] = useState('');
  const [armed, setArmed] = useState<'' | 'draw' | 'cancel'>('');
  const load = useCallback(async () => {
    try { setData(await getJson<Payload>(API, 'Не удалось загрузить')); setError(''); } catch (e) { setError(message(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (url: string, payload: unknown) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await sendJson(url, 'POST', payload, 'Не получилось'); setArmed(''); await load(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const event = data?.event || null;
  const chosen = data?.evenings.find((item) => item.id === eveningId) || null;

  return <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="secret-santa-crm">
    <p className="text-[13px] leading-5 text-text-secondary">Игроки сами записываются в приложении и подтверждают, что подготовят подарок до {SANTA_GIFT_LIMIT_RUB} ₽ и придут на вечер обмена. Когда вы проведёте жеребьёвку, каждому участнику бот напишет, кому он дарит. Пары выпадают только между записавшимися, и кто кому дарит, не видно никому, включая вас.</p>
    {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    {!data && !error ? <p className="text-[13px] text-text-secondary">Загружаем…</p> : null}

    {data && !event ? <section className="space-y-3 rounded-[16px] border border-border-soft bg-surface-1 p-3" data-testid="santa-create">
      <label className="block"><span className="mobile-label">Вечер обмена подарками</span>
        <select className="mobile-field mt-1" value={eveningId} onChange={(e) => setEveningId(e.target.value)} data-testid="santa-evening">
          <option value="">Выберите вечер</option>
          {data.evenings.map((item) => <option key={item.id} value={item.id}>{item.title} · {santaEveningWhen(item.starts_at)}</option>)}
        </select>
      </label>
      {!data.evenings.length ? <p className="text-[12px] text-text-secondary">Нет будущих вечеров. Сначала создайте вечер, на котором будет обмен.</p> : null}
      {chosen ? <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3" data-testid="santa-post-preview">
        <h2 className="text-[14px] font-bold">Пост в «Новости» с кнопкой «🎅 Участвовать»</h2>
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5">{santaAnnouncementText(chosen)}</p>
      </section> : null}
      <button type="button" disabled={!chosen || busy} onClick={() => void act(API, { evening_id: eveningId })} data-testid="santa-open" className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Открыть запись и опубликовать пост</button>
    </section> : null}

    {event ? <section className="space-y-3 rounded-[16px] border border-border-soft bg-surface-1 p-3" data-testid="santa-event">
      <div>
        <h2 className="text-[16px] font-bold">{event.status === 'open' ? 'Идёт запись' : 'Жеребьёвка проведена'}</h2>
        <p className="mt-1 text-[13px] text-text-secondary">Обмен — «{event.evening.title}», {santaEveningWhen(event.evening.starts_at)}. Подарок до {event.gift_limit} ₽.</p>
        <p className="mt-1 text-[12px] text-text-secondary">{event.posted ? 'Пост в «Новости» опубликован.' : 'Пост в «Новости» уйдёт в течение минуты.'}{event.drawn_at ? ` Жеребьёвка: ${santaEveningWhen(event.drawn_at)}.` : ''}</p>
      </div>
      <div>
        <h3 className="text-[14px] font-bold">Участники · {event.participants.length}</h3>
        {event.participants.length ? <ul className="mt-2 space-y-1.5">
          {event.participants.map((player) => <li key={player.id} className="min-h-11 rounded-[12px] bg-surface-2 px-3 py-2.5 text-[14px]" data-testid="santa-participant">
            <strong className="block break-words">{player.nickname}</strong>
            {player.bot_blocked || player.message ? <span className="mt-0.5 block text-[12px] text-text-secondary">
              {[player.bot_blocked ? 'Бот заблокирован' : '', player.message === 'queued' ? 'Бот написал' : '', player.message === 'unreachable' ? 'Бот не может написать' : ''].filter(Boolean).join(' · ')}
            </span> : null}
          </li>)}
        </ul> : <p className="mt-1 text-[13px] text-text-secondary">Пока никто не записался.</p>}
        {event.status === 'drawn' && event.participants.some((player) => player.bot_blocked || player.message === 'unreachable')
          ? <p className="mt-2 text-[12px] text-text-secondary">Кому бот не может написать, тот увидит, кому дарит, в приложении: «Сообщество → Мини-игры → Тайный Санта» или по кнопке из поста. Скажите им об этом сами.</p> : null}
      </div>
      {event.status === 'open' ? <div className="space-y-2">
        {event.participants.length < SANTA_MIN_PARTICIPANTS ? <p className="text-[12px] text-text-secondary">Для жеребьёвки нужно хотя бы {SANTA_MIN_PARTICIPANTS} участника.</p> : null}
        {armed === 'draw'
          ? <button type="button" disabled={busy} onClick={() => void act(`${API}/${encodeURIComponent(event.id)}/draw`, {})} data-testid="santa-draw-confirm" className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Точно провести? Запись закроется, всем уйдут сообщения</button>
          : <button type="button" disabled={busy || event.participants.length < SANTA_MIN_PARTICIPANTS} onClick={() => setArmed('draw')} data-testid="santa-draw" className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Провести жеребьёвку</button>}
        {armed === 'cancel'
          ? <button type="button" disabled={busy} onClick={() => void act(`${API}/${encodeURIComponent(event.id)}/cancel`, {})} data-testid="santa-cancel-confirm" className="min-h-11 w-full rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold text-danger">Точно отменить Тайного Санту?</button>
          : <button type="button" disabled={busy} onClick={() => setArmed('cancel')} data-testid="santa-cancel" className="min-h-11 w-full rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold">Отменить</button>}
        {armed ? <button type="button" onClick={() => setArmed('')} className="min-h-11 w-full rounded-[12px] px-3 text-[13px] text-text-secondary">Не надо</button> : null}
      </div> : null}
    </section> : null}
  </div>;
}
