import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';

export type OrderPayment = 'rubles' | 'tokens';
type Prices = { tokenPrices: { role: number | null; music: number | null }; balance: number };
const tokensText = (value: number) => Math.trunc(value).toLocaleString('ru-RU');

/**
 * «Рубли или жетоны» for a role or a song bought before a game (owner, 2026-11-11). Rubles are added to the evening debt, tokens are
 * debited at once at the price set in the CRM shop. Nothing is shown when the organizer switched token payment off.
 */
export default function OrderPaymentChoice({ kind, rubles, value, onChange, refreshKey }: { kind: 'role' | 'music'; rubles: number; value: OrderPayment; onChange: (next: OrderPayment) => void; refreshKey?: number }) {
  const [prices, setPrices] = useState<Prices | null>(null);
  useEffect(() => {
    let active = true;
    void getJson<Prices>('/api/player/game-order-token-prices', 'Не удалось загрузить цены', { cache: 'no-store' })
      .then((body) => { if (active) setPrices(body); }).catch(() => { /* rubles stay available */ });
    return () => { active = false; };
  }, [refreshKey]);
  const tokens = prices?.tokenPrices?.[kind] ?? null;
  useEffect(() => { if (!tokens && value === 'tokens') onChange('rubles'); }, [tokens, value, onChange]);
  if (!tokens) return null;
  const enough = Number(prices?.balance || 0) >= tokens;
  const option = (id: OrderPayment, label: string, disabled = false) => (
    <label key={id} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs ${value === id ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/65'} ${disabled ? 'opacity-50' : ''}`}>
      <input type="radio" name={`order-payment-${kind}`} checked={value === id} disabled={disabled} onChange={() => onChange(id)} />{label}
    </label>
  );
  return <fieldset data-testid={`order-payment-${kind}`} className="mt-2 grid gap-2">
    <legend className="sr-only">Чем платить</legend>
    {option('rubles', `Рублями ${rubles} ₽ — добавится к долгу за вечер`)}
    {option('tokens', `Жетонами ${tokensText(tokens)} — у вас ${tokensText(Number(prices?.balance || 0))}${enough ? '' : ', не хватает'}`, !enough)}
  </fieldset>;
}
