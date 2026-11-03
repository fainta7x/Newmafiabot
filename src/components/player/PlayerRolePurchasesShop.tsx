import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';
import PlayerGameRolePurchase from './PlayerGameRolePurchase.tsx';
import PlayerGameMusicOrder from './PlayerGameMusicOrder.tsx';
import PlayerGameSeatSwapOrder from './PlayerGameSeatSwapOrder.tsx';

type AvailableGame = { gameId: number; eveningId: string; eveningTitle: string; number: number; format: string; canRoleOrSwap: boolean; ownSeat: number; seats: Array<{seat_number:number;player_id:string|null;nickname:string}> };

/** Ruble purchases, separate from the existing token-based shop goods. */
export default function PlayerRolePurchasesShop() {
  const [games, setGames] = useState<AvailableGame[]>([]);
  const chosenGame = games.find((game) => String(game.gameId) === selected);
  const [selected, setSelected] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getJson<{ games: AvailableGame[] }>('/api/player/game-purchase-options', 'Не удалось загрузить игры', { cache: 'no-store' })
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
      Платные услуги игры: покупка роли 150 ₽, музыка 50 ₽ и обмен местами 50 ₽. Стоимость добавляется в долг за вечер — жетоны не списываются.
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
      {chosenGame && <>
        {chosenGame.canRoleOrSwap && <PlayerGameRolePurchase key={`role-${selected}`} gameId={Number(selected)} canPurchase futureGames={[]} />}
        <PlayerGameMusicOrder key={`music-${selected}`} gameId={Number(selected)} canOrder />
        {chosenGame.canRoleOrSwap && <PlayerGameSeatSwapOrder key={`seat-${selected}`} gameId={Number(selected)} ownSeat={chosenGame.ownSeat} seats={chosenGame.seats} canOrder />}
      </>}
    </>}
    {!loaded && <p className="mt-3 text-xs text-white/45">Загружаем созданные игры…</p>}
    {loaded && !games.length && !error && <p className="mt-3 text-xs text-white/45">
      Для вас пока нет созданных игр, на которые можно оформить покупку.
    </p>}
    {error && <p role="alert" className="mt-3 text-xs text-amber-100">{error}</p>}
  </section>;
}
