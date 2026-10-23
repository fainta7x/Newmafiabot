import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/requestJson.ts';
import { DEFAULT_EVENING_PRICES, type EveningPrices } from '../../lib/eveningPrices.ts';
const fields: Array<{ key: keyof EveningPrices; label: string }> = [
  { key: 'casual_game', label: 'Обычный вечер · за игру' },
  { key: 'casual_cap', label: 'Обычный вечер · максимум' },
  { key: 'novice_game', label: 'Новички · за игру' },
  { key: 'novice_cap', label: 'Новички · максимум' },
  { key: 'rating_entry', label: 'Рейтинговый вечер · вход' },
];
export function EveningPriceSettingsCard() {
  const [prices, setPrices] = useState<EveningPrices>({ ...DEFAULT_EVENING_PRICES });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { void requestJson('/api/evening-prices', undefined, 'Не удалось загрузить цены').then(data => { setPrices(data); setReady(true); }).catch(() => setMessage('Не удалось загрузить цены')); }, []);
  const save = async () => {
    setBusy(true); setMessage('');
    try { setPrices(await requestJson('/api/evening-prices', { method: 'PUT', body: JSON.stringify(prices) }, 'Не удалось сохранить цены')); setMessage('Сохранено. Цены действуют для новых вечеров.'); }
    catch (error: any) { setMessage(error.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border border-border-soft bg-surface-1 p-4" data-testid="evening-price-settings">
    <h3 className="text-[15px] font-bold">Стоимость вечеров</h3>
    <p className="text-[13px] leading-5 text-text-secondary">Для вечеров, созданных после сохранения. Уже созданные вечера сохраняют свои цены. Бесплатное участие — подарок организатора в оплатах вечера.</p>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(({ key, label }) => <label key={key} className="min-w-0 text-[12px] text-text-secondary">{label}, ₽
      <input type="number" min={0} max={100000} step={1} disabled={!ready || busy} aria-label={label} className="mobile-field mt-1 min-h-11 w-full" placeholder={key === 'novice_cap' ? 'Без ограничения' : undefined} value={prices[key] ?? ''} onChange={event => setPrices(current => ({ ...current, [key]: key === 'novice_cap' && event.target.value === '' ? null : Number(event.target.value) }))} />
    </label>)}</div>
    <button type="button" disabled={!ready || busy} onClick={() => void save()} className="min-h-11 w-full rounded-xl bg-accent px-3 text-[14px] font-bold text-white disabled:opacity-40">{busy ? 'Сохраняем…' : 'Сохранить цены'}</button>
    {message ? <p role="status" className="text-[13px]">{message}</p> : null}
  </section>;
}
