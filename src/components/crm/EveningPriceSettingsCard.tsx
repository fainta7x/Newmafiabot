import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/requestJson.ts';
import { DEFAULT_EVENING_PRICES, type EveningPrices } from '../../lib/eveningPrices.ts';
type Field = { key: keyof EveningPrices; label: string; hint?: string };
// Prices grouped by the kind of evening (owner, 2026-11-11: eight inputs in one column were unreadable).
const groups: Array<{ title: string; note?: string; fields: Field[] }> = [
  { title: 'Клубный вечер', note: 'Цена за игру и потолок за вечер зависят от того, как часто игрок ходит.', fields: [
    { key: 'casual_game', label: 'За игру' },
    { key: 'casual_cap', label: 'Максимум · ходит постоянно' },
    { key: 'sometimes_cap', label: 'Максимум · ходит иногда или другой город' },
    { key: 'stopped_game', label: 'За игру · перестал ходить' },
    { key: 'stopped_cap', label: 'Максимум · перестал ходить' },
  ] },
  { title: 'Новички', fields: [{ key: 'novice_game', label: 'За игру' }, { key: 'novice_cap', label: 'Максимум за вечер' }] },
  { title: 'Рейтинговый вечер', fields: [{ key: 'rating_entry', label: 'Вход за вечер' }] },
];
export function EveningPriceSettingsCard() {
  const [prices, setPrices] = useState<EveningPrices>({ ...DEFAULT_EVENING_PRICES });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { void requestJson('/api/evening-prices', undefined, 'Не удалось загрузить цены').then(data => { setPrices(data); setReady(true); }).catch(() => setMessage('Не удалось загрузить цены')); }, []);
  const save = async () => {
    setBusy(true); setMessage('');
    try { setPrices(await requestJson('/api/evening-prices', { method: 'PUT', body: JSON.stringify(prices) }, 'Не удалось сохранить цены')); setMessage('Сохранено. Новые цены действуют для всех незакрытых вечеров.'); }
    catch (error: any) { setMessage(error.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border border-border-soft bg-surface-1 p-4" data-testid="evening-price-settings">
    <h3 className="text-[15px] font-bold">Стоимость вечеров</h3>
    <p className="text-[13px] leading-5 text-text-secondary">Цены действуют сразу для всех незакрытых вечеров, закрытые сохраняют свои. Бесплатное участие — подарок организатора в оплатах вечера.</p>
    {groups.map((group) => <fieldset key={group.title} className="space-y-2 rounded-xl border border-border-soft bg-surface-2/40 p-3">
      <legend className="px-1 text-[13px] font-bold text-text-primary">{group.title}</legend>
      {group.note ? <p className="text-[12px] leading-4 text-text-muted">{group.note}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">{group.fields.map(({ key, label }) => <label key={key} className="min-w-0 text-[12px] text-text-secondary">{label}, ₽
        <input type="number" min={0} max={100000} step={1} disabled={!ready || busy} aria-label={`${group.title}: ${label}`} className="mobile-field mt-1 min-h-11 w-full" placeholder={key === 'novice_cap' ? 'Без ограничения' : undefined} value={prices[key] ?? ''} onChange={event => setPrices(current => ({ ...current, [key]: key === 'novice_cap' && event.target.value === '' ? null : Number(event.target.value) }))} />
      </label>)}</div>
    </fieldset>)}
    <button type="button" disabled={!ready || busy} onClick={() => void save()} className="min-h-11 w-full rounded-xl bg-accent px-3 text-[14px] font-bold text-white disabled:opacity-40">{busy ? 'Сохраняем…' : 'Сохранить цены'}</button>
    {message ? <p role="status" className="text-[13px]">{message}</p> : null}
  </section>;
}
