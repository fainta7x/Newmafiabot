import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type Item = { collection_id: string; status: 'invited' | 'pledged' | 'declined' | 'paid'; pledged_amount: number; paid_amount: number; collection_status: string; honoree_nickname: string; owed: number };
type Gifts = { items: Item[]; payee: string | null; amounts: number[]; min_amount: number };

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

/** The player's own part of a birthday gift collection: pick or change the amount, decline, and see the debt. Never shows totals or other players. */
export default function PlayerGiftCollectionCard({ onChanged }: { onChanged?: () => void }) {
  const [gifts, setGifts] = useState<Gifts | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setGifts(await getJson<Gifts>('/api/player/gift-collections', 'Не удалось загрузить сбор')); setError(''); } catch (e: any) { setError(e?.message || 'Не удалось загрузить сбор'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choose = async (id: string, body: { amount?: number; decline?: boolean }) => {
    setBusy(true); setError('');
    try { await sendJson(`/api/player/gift-collections/${encodeURIComponent(id)}`, 'PUT', body, 'Не удалось сохранить'); setCustom(''); await load(); onChanged?.(); }
    catch (e: any) { setError(e?.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };

  const items = (gifts?.items || []).filter((i) => i.collection_status === 'open' || i.status === 'pledged');
  if (!items.length) return error ? <p role="alert" className="px-1 text-xs text-white/50">{error}</p> : null;
  return (
    <section className="space-y-3" data-testid="player-gift-collection">
      {items.map((item) => {
        const locked = item.status === 'paid';
        return (
          <div key={item.collection_id} className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">Сбор на подарок</div>
            <h2 className="mt-1 text-base font-semibold">День рождения: {item.honoree_nickname}</h2>
            {locked ? <p className="mt-2 text-sm text-white/70">Перевод {rub(item.paid_amount)} получен — спасибо! Жетоны клуба в подарок уже начислены.</p> : <>
              <p className="mt-2 text-sm text-white/70">
                {item.status === 'pledged' ? <>Вы вносите <b>{rub(item.pledged_amount)}</b>. {gifts?.payee ? `Переведите на ${gifts.payee}.` : 'Организатор пришлёт реквизиты.'}</>
                  : item.status === 'declined' ? 'Вы не участвуете в этом сборе. Передумали — выберите сумму.' : `Сколько готовы внести? От ${gifts?.min_amount} ₽. 1 ₽ — это 1 подарочный жетон от клуба.`}
              </p>
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {(gifts?.amounts || []).map((a) => <button key={a} type="button" disabled={busy} onClick={() => void choose(item.collection_id, { amount: a })}
                  className={`min-h-11 rounded-xl border text-xs font-semibold ${item.pledged_amount === a && item.status === 'pledged' ? 'border-white bg-white text-black' : 'border-white/15 text-white'}`}>{a}</button>)}
              </div>
              <div className="mt-2 flex gap-2">
                <input inputMode="numeric" aria-label="Своя сумма" placeholder={`Своя сумма, от ${gifts?.min_amount} ₽`} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-transparent px-3 text-sm text-white" />
                <button type="button" disabled={busy || !custom || Number(custom) < (gifts?.min_amount || 100)} onClick={() => void choose(item.collection_id, { amount: Number(custom) })}
                  className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-30">Внести</button>
              </div>
              {item.status !== 'declined' && <button type="button" disabled={busy} onClick={() => void choose(item.collection_id, { decline: true })} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/60">Не участвую</button>}
            </>}
          </div>
        );
      })}
      {error && <p role="alert" className="px-1 text-xs text-amber-200">{error}</p>}
    </section>
  );
}
