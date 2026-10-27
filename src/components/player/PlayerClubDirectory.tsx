import { ChevronRight, Search, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '../ui/Input.tsx';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { getJson } from '../../lib/requestJson.ts';

type DirectoryPlayer = { id: string; nickname: string; elo: number; game_level: string; avatar_url: string | null };

const gameLevelLabel = (level: string) => level === 'novice' ? 'Новичок' : level === 'tournament' ? 'Турнирный игрок' : 'Игрок клуба';

function PlayerAvatar({ player }: { player: DirectoryPlayer }) {
  if (player.avatar_url) return <img src={player.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-white/10" />;
  return <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.09] text-base font-semibold text-white/75">{player.nickname.slice(0, 1).toUpperCase()}</div>;
}

export default function PlayerClubDirectory({ selfId }: { selfId: string }) {
  const [players, setPlayers] = useState<DirectoryPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const requestSeq = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

  const loadPlayers = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setError(null);
    setPlayers(null);
    try {
      const body = await getJson<any>('/api/player/players', 'Не удалось загрузить игроков');
      if (!Array.isArray(body?.players)) throw new Error('Не удалось загрузить игроков');
      if (requestId === requestSeq.current) setPlayers(body.players);
    } catch (loadError: any) {
      if (requestId === requestSeq.current) setError(loadError?.message || 'Не удалось загрузить игроков');
    }
  }, []);

  useEffect(() => {
    void loadPlayers();
    return () => { requestSeq.current += 1; };
  }, [loadPlayers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return players || [];
    return (players || []).filter((item) => item.nickname.toLocaleLowerCase('ru-RU').includes(query));
  }, [players, search]);

  return (
    <section data-testid="club-directory" className="rounded-[28px] border border-white/10 bg-white/[0.045] p-3.5">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Игроки клуба</h2>
          <p className="mt-1 text-[12px] leading-4 text-white/45">Профили, игры и достижения клуба</p>
        </div>
        {players ? <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] tabular-nums text-white/65" aria-label={`${players.length} игроков`}>{players.length}</span> : null}
      </div>

      <div className="relative mt-4">
        <label htmlFor="club-search" className="sr-only">Найти игрока</label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/45" />
        <Input ref={searchInput} type="search" id="club-search" data-testid="club-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="!pl-12 !pr-12 [&::-webkit-search-cancel-button]:appearance-none" />
        {search && <button type="button" aria-label="Очистить поиск" onClick={() => { setSearch(''); searchInput.current?.focus(); }} className="ds-focus-ring absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-white/60"><X aria-hidden="true" className="h-4 w-4" /></button>}
      </div>

      {error ? (
        <div role="alert" data-testid="club-directory-error" className="mt-3 space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] p-4">
          <p className="text-[13px] leading-5 text-rose-100/80">{error}</p>
          <button type="button" onClick={() => void loadPlayers()} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button>
        </div>
      ) : players === null ? (
        <div className="mt-3 rounded-2xl bg-black/20 px-3 py-7 text-center text-[13px] text-white/50">Загружаем игроков…</div>
      ) : filtered.length ? (
        <div className="mt-3 space-y-2" aria-label="Список игроков">
          {search.trim() ? <p className="px-1 pb-0.5 text-[12px] text-white/45">Найдено: {filtered.length}</p> : null}
          {filtered.map((item) => {
            const isSelf = item.id === selfId;
            return (
              <button
                key={item.id}
                data-testid={`club-player-${item.id}`}
                type="button"
                aria-label={`Открыть профиль ${item.nickname}, Elo ${Math.round(Number(item.elo || 0))}`}
                onClick={() => openCanonicalPlayerProfile(item.id)}
                className={`ds-focus-ring flex min-h-[80px] w-full items-center gap-3 rounded-[20px] border p-3 text-left transition-colors active:bg-white/[0.1] ${isSelf ? 'border-white/25 bg-white/[0.085]' : 'border-white/[0.07] bg-black/20 hover:bg-white/[0.055]'}`}
              >
                <PlayerAvatar player={item} />
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 break-words text-[15px] font-semibold leading-5 text-white">{item.nickname}</span>
                  <span className="mt-1 block text-[12px] leading-4 text-white/50">{isSelf ? `Мой профиль · ${gameLevelLabel(item.game_level)}` : gameLevelLabel(item.game_level)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[17px] font-semibold tabular-nums leading-5 text-white">{Math.round(Number(item.elo || 0))}</span>
                  <span className="mt-0.5 block text-[11px] text-white/45">Elo</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center rounded-2xl bg-black/20 px-4 py-7 text-center">
          <UserRound aria-hidden="true" className="h-6 w-6 text-white/40" />
          <p className="mt-2 text-sm font-semibold text-white/75">{players.length ? 'Никого не нашли' : 'Список игроков пока пуст'}</p>
          <p className="mt-1 text-[12px] leading-4 text-white/45">{players.length ? 'Измените запрос или очистите поиск, чтобы увидеть всех игроков.' : 'Игроки появятся здесь, когда добавятся в клуб.'}</p>
        </div>
      )}
    </section>
  );
}
