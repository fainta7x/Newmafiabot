import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import { SANTA_MIN_PARTICIPANTS, SANTA_NAME, SANTA_PROMISE, SHMURDYAK_NAME, santaEveningWhen, type SantaEvening, type SantaPlayerState } from '../../shared/secretSanta.ts';
import './dailyWord.css';
import './drawingTelephone.css';

/** «Тайный Санта» (owner, 2026-11-17); rules in docs/BUSINESS_RULES.md. */
const API = '/api/player/santa';
const exchange = (evening: SantaEvening | null) => evening ? `на вечере «${evening.title}», ${santaEveningWhen(evening.starts_at)}` : 'на клубном вечере, дату сообщим';
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось загрузить';

export default function PlayerSecretSanta({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<SantaPlayerState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [promise, setPromise] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const load = useCallback(async () => { try { setState(await getJson<SantaPlayerState>(API, 'Не удалось загрузить')); setError(''); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (path: string, payload: unknown) => {
    if (busy) return;
    setBusy(true); setError('');
    try { setState(await sendJson<SantaPlayerState>(`${API}/${path}`, 'POST', payload, 'Не получилось')); setLeaving(false); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const event = state?.event || null;
  return <main className="dw-page" data-testid="secret-santa"><div className="dw-content">
    <button type="button" className="dw-back" onClick={onExit}>← Мини-игры</button>
    <header><div className="dw-eyebrow">2LA Noire · обмен подарками</div><h1>🎅 {SANTA_NAME}</h1>
      {event ? <p>Подарок до {event.gift_limit} ₽. Обмен — {exchange(event.evening)}.</p> : null}
    </header>
    {error ? <div className="dw-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Повторить загрузку</button></div> : null}
    {!state && !error ? <p>Загружаем…</p> : null}
    {state && !event ? <section className="dw-card" data-testid="santa-none"><h2>Сейчас Тайного Санты нет</h2><p>Когда организатор откроет запись, здесь можно будет участвовать, а в «Новостях» появится пост.</p></section> : null}
    {event?.recipient ? <section className="dw-card" data-testid="santa-recipient">
      <div className="dw-eyebrow">Ты даришь подарок</div>
      <h2>{event.recipient.nickname}</h2>
      <p>Подарок до {event.gift_limit} ₽, вручение — {exchange(event.evening)}. Никому не говори, кто тебе выпал 🤫</p>
    </section> : null}
    {event?.shmurdyak ? <section className="dw-card" data-testid="santa-shmurdyak">
      <div className="dw-eyebrow">😈 {SHMURDYAK_NAME}</div>
      <h2>{event.shmurdyak.nickname}</h2>
      <p>Он будет на вечере, но в Санте не участвует — ему нужен антиподарок, без лимита.</p>
    </section> : null}
    {event && event.status === 'drawn' && !event.recipient ? <section className="dw-card" data-testid="santa-closed"><h2>Жеребьёвка уже прошла</h2><p>Запись закрыта: пары выпали только между теми, кто записался.</p></section> : null}
    {event && event.status === 'open' && event.joined ? <section className="dw-card" data-testid="santa-joined">
      <h2>Ты участвуешь ✅</h2>
      <p>Когда организатор проведёт жеребьёвку, бот напишет тебе, кому ты даришь подарок. Это же появится здесь.</p>
      {leaving
        ? <div className="tp-actions"><button type="button" className="tp-primary" onClick={() => setLeaving(false)} disabled={busy}>Остаюсь</button><button type="button" className="tp-quiet" data-testid="santa-leave-confirm" onClick={() => void act('leave', undefined)} disabled={busy}>Да, выйти</button></div>
        : <button type="button" className="tp-quiet" data-testid="santa-leave" onClick={() => setLeaving(true)}>Не смогу участвовать</button>}
    </section> : null}
    {event && event.status === 'open' && !event.joined ? <section className="dw-card" data-testid="santa-join">
      <h2>Записаться</h2>
      <label className="tp-promise"><input type="checkbox" checked={promise} onChange={(e) => setPromise(e.target.checked)} data-testid="santa-promise" /><span>{SANTA_PROMISE}</span></label>
      <button type="button" className="tp-primary" data-testid="santa-join-button" disabled={!promise || busy} onClick={() => void act('join', { confirm: true })}>🎅 Участвую</button>
    </section> : null}
    {event ? <section className="dw-card" data-testid="santa-participants">
      <h2>Участники · {event.participants.length}</h2>
      {event.participants.length
        ? <p>{event.participants.map((player) => player.nickname).join(', ')}</p>
        : <p>Пока никто не записался.</p>}
      {event.status === 'open' && event.participants.length < SANTA_MIN_PARTICIPANTS ? <p className="dw-hint">Для жеребьёвки нужно хотя бы {SANTA_MIN_PARTICIPANTS} участника.</p> : null}
    </section> : null}
    <details className="dw-rules"><summary>Как это работает</summary>
      <p>Записываешься и подтверждаешь, что подготовишь подарок до 1000 ₽ и придёшь на вечер обмена. Выйти можно до жеребьёвки. Дату обмена организатор сообщит отдельно.</p>
      <p>Когда запись закроется, организатор проводит жеребьёвку: каждому выпадает один человек из записавшихся — не ты сам и не тот, кому выпал ты. Бот пишет в личку, кому ты даришь. Кто кому дарит, не видит никто, даже организатор.</p>
      <p>А ещё каждому санте выпадает «шмурдяк» — человек, который ответил «Иду» на вечер обмена, но в Санте не участвует. Ему нужен антиподарок, без лимита.</p>
      <p>Бот напомнит каждый понедельник и за сутки до вечера обмена.</p>
    </details>
  </div></main>;
}
