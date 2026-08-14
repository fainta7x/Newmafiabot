import { useEffect, useMemo, useState } from 'react';

type DirectoryPlayer = {
  id: string;
  nickname: string;
  elo: number;
  game_level: string;
  avatar_url: string | null;
};

type PublicPlayerProfile = {
  player: DirectoryPlayer;
  stats: {
    completedGames: number;
    wins: number;
    losses: number;
    winRate: number;
    clubGames: number;
    tournamentGames: number;
    redGames: number;
    blackGames: number;
    bestMoves: number;
    firstKilled: number;
    zeroRoundVoted: number;
  };
  tournament_awards: {
    firstPlaces: number;
    secondPlaces: number;
    thirdPlaces: number;
    nominations: number;
  };
};

const gameLevelLabel = (level: string) => {
  if (level === 'novice') return 'Новичок';
  if (level === 'tournament') return 'Турнирный игрок';
  return 'Игрок клуба';
};

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3 text-center">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-[10px] text-white/35">{label}</div>
    </div>
  );
}

export default function PlayerClubDirectory({ selfId }: { selfId: string }) {
  const [players, setPlayers] = useState<DirectoryPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PublicPlayerProfile | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/players', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игроков');
        if (!cancelled) setPlayers(Array.isArray(body?.players) ? body.players : []);
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'Не удалось загрузить игроков');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return players || [];
    return (players || []).filter((item) => item.nickname.toLocaleLowerCase('ru-RU').includes(query));
  }, [players, search]);

  const openPlayer = async (playerId: string) => {
    if (selectedLoading) return;
    setSelectedLoading(true);
    setSelectedError(null);
    try {
      const response = await fetch(`/api/player/players/${encodeURIComponent(playerId)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить профиль игрока');
      setSelected(body as PublicPlayerProfile);
    } catch (loadError: any) {
      setSelectedError(loadError?.message || 'Не удалось загрузить профиль игрока');
    } finally {
      setSelectedLoading(false);
    }
  };

  if (selected) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setSelected(null); setSelectedError(null); }} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/60">← Все игроки</button>
        <header className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
          <div className="flex items-center gap-4">
            {selected.player.avatar_url ? (
              <img src={selected.player.avatar_url} alt={selected.player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">
                {selected.player.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-semibold">{selected.player.nickname}</h2>
              <p className="mt-2 text-xs text-white/35">{gameLevelLabel(selected.player.game_level)}</p>
              <div className="mt-2 text-sm text-white/55">ELO {selected.player.elo}</div>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Статистика игрока</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatCard value={selected.stats.completedGames} label="игр" />
            <StatCard value={selected.stats.wins} label="побед" />
            <StatCard value={`${selected.stats.winRate}%`} label="винрейт" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <StatCard value={selected.stats.firstKilled} label="ПУ" />
            <StatCard value={selected.stats.bestMoves} label="ЛХ" />
            <StatCard value={selected.tournament_awards.nominations} label="номинаций" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Игроки клуба</div>
          <p className="mt-1 text-xs text-white/35">Люди 2LA Noire и их игровые профили</p>
        </div>
        {players && <div className="text-[10px] text-white/25">{players.length}</div>}
      </div>

      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25" />

      {selectedError && <p className="mt-3 rounded-2xl bg-rose-400/[0.07] px-3 py-3 text-sm text-rose-100/70">{selectedError}</p>}
      {error ? (
        <p className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{error}</p>
      ) : players === null ? (
        <p className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игроков…</p>
      ) : filtered.length ? (
        <div className="mt-3 space-y-2">
          {filtered.map((item) => (
            <button key={item.id} type="button" disabled={selectedLoading} onClick={() => void openPlayer(item.id)} className="flex w-full items-center gap-3 rounded-2xl bg-black/20 p-3 text-left transition active:bg-white/[0.06] disabled:opacity-50">
              {item.avatar_url ? (
                <img src={item.avatar_url} alt={item.nickname} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/65">
                  {item.nickname.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white">{item.nickname}{item.id === selfId ? ' · вы' : ''}</div>
                <div className="mt-1 text-xs text-white/35">{gameLevelLabel(item.game_level)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-white/60">{item.elo}</div>
                <div className="text-[9px] uppercase tracking-wide text-white/25">ELO</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Игроки не найдены.</p>
      )}
    </section>
  );
}
