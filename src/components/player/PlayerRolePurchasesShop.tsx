import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';
import PlayerGameRolePurchase from './PlayerGameRolePurchase.tsx';

type AvailableGame = { gameId: number; eveningId: string; eveningTitle: string; number: number };

/** Ruble purchases, separate from the existing token-based shop goods. */
export default function PlayerRolePurchasesShop() {
  const [games, setGames] = useState<AvailableGame[]>([]);
  const [selected, setSelected] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getJson<{ games: AvailableGame[] }>('/api/player/role-purchase-games', 'Не удалось загрузить игры', { cache: 'no-store' })
      .then((body) => {
        if (!active) return;
        const next = Array.isArray(body.games) ? body.games : [];
        setGames(next);
        setSelected((value) => value && next.some((game) => String(game.gameId) === value) ? value : (next[0] ? String(next[0].gameId) : ''));
        setError('');
      })
      .catch((cause: any) => { if (active) setError(cause?.message || 'Не удалось загрузить игры'); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  return <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Покупки перед игрой</h2>
    <p className="mt-2 text-xs leading-5 text-white/55">
      Покупка роли · 150 ₽. Оплата добавляется в долг за вечер, жетоны не списываются.
    </p>
    {loaded && games.length > 0 && <>
      <label className="mt-3 block text-xs text-white/65">Выберите игру
        <select value={selected} onChange={(event) => setSelected(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-sm text-white">
          {games.map((game) => <option key={game.gameId} value={game.gameId}>
            {game.eveningTitle} · Игра №{game.number || game.gameId}
          </option>)}
        </select>
      </label>
      {selected && <PlayerGameRolePurchase key={selected} gameId={Number(selected)} canPurchase futureGames={[]} />}
    </>}
    {!loaded && <p className="mt-3 text-xs text-white/45">Загружаем созданные игры…</p>}
    {loaded && !games.length && !error && <p className="mt-3 text-xs text-white/45">
      Для вас пока нет созданных игр, на которые можно купить роль.
    </p>}
    {error && <p role="alert" className="mt-3 text-xs text-amber-100">{error}</p>}
  </section>;
}
