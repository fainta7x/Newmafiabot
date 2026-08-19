import { ChevronRight, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncState from '../ui/AsyncState.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card.tsx';
import { Input } from '../ui/Input.tsx';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/Sheet.tsx';

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

function PlayerAvatar({ player, large = false }: { player: DirectoryPlayer; large?: boolean }) {
  const sizeClass = large ? 'h-20 w-20 rounded-[20px]' : 'h-11 w-11 rounded-xl';

  if (player.avatar_url) {
    return (
      <img
        src={player.avatar_url}
        alt={player.nickname}
        className={`${sizeClass} shrink-0 object-cover ring-1 ring-[var(--ds-border-strong)]`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center bg-[var(--ds-primary-soft)] text-base font-semibold text-[var(--ds-primary)] ring-1 ring-[var(--ds-border)]`}
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </div>
  );
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] bg-[var(--ds-surface)] px-2 py-3 text-center">
      <div className="text-lg font-semibold leading-none text-foreground">{value}</div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export default function PlayerClubDirectory({ selfId }: { selfId: string }) {
  const [players, setPlayers] = useState<DirectoryPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicPlayerProfile | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

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
    setSelectedPlayerId(playerId);
    setSelected(null);
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

  const closePlayer = () => {
    const trigger = lastTriggerRef.current;
    setSelectedPlayerId(null);
    setSelected(null);
    setSelectedError(null);
    setSelectedLoading(false);
    if (trigger) window.requestAnimationFrame(() => trigger.focus());
  };

  return (
    <>
      <Card data-testid="club-directory" className="overflow-hidden">
        <CardHeader className="flex-row items-end justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Игроки клуба
            </CardTitle>
            <CardDescription className="mt-1">Люди 2LA Noire и их игровые профили</CardDescription>
          </div>
          {players && (
            <span aria-label={`${players.length} игроков`} className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {players.length}
            </span>
          )}
        </CardHeader>

        <CardContent>
          <div className="relative">
            <label htmlFor="club-search" className="sr-only">Найти игрока</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="club-search"
              data-testid="club-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти игрока"
              className="pl-10"
            />
          </div>

          {error ? (
            <AsyncState kind="error" title="Не удалось загрузить игроков" description={error} compact className="mt-3" />
          ) : players === null ? (
            <AsyncState kind="loading" title="Загрузка игроков…" compact className="mt-3" />
          ) : filtered.length ? (
            <div className="mt-3 space-y-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  data-testid={`club-player-${item.id}`}
                  type="button"
                  disabled={selectedLoading}
                  onClick={(event) => {
                    lastTriggerRef.current = event.currentTarget;
                    void openPlayer(item.id);
                  }}
                  className="ds-focus-ring group flex min-h-[68px] w-full items-center gap-3 rounded-[var(--ds-radius-md)] bg-[var(--ds-surface-raised)] p-3 text-left transition-colors hover:bg-[var(--ds-surface-hover)] active:bg-[var(--ds-primary-soft)] disabled:pointer-events-none disabled:opacity-45"
                >
                  <PlayerAvatar player={item} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {item.nickname}
                      {item.id === selfId && <span className="font-normal text-[var(--ds-primary)]"> · вы</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{gameLevelLabel(item.game_level)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-foreground">{item.elo}</div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">ELO</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <AsyncState
              kind="empty"
              title="Никого не нашли"
              description="Попробуйте изменить запрос."
              icon={<UserRound className="h-5 w-5" />}
              compact
              className="mt-3"
            />
          )}
        </CardContent>
      </Card>

      <Sheet
        side="bottom"
        open={selectedPlayerId !== null}
        onOpenChange={(open) => {
          if (!open) closePlayer();
        }}
      >
        <SheetContent data-testid="club-player-sheet" className="max-h-[min(82dvh,var(--tg-viewport-stable-height,82dvh))]">
          {selectedLoading ? (
            <>
              <SheetHeader>
                <SheetTitle>Профиль игрока</SheetTitle>
                <SheetDescription>Загружаем статистику…</SheetDescription>
              </SheetHeader>
              <AsyncState kind="loading" title="Загрузка профиля…" compact className="mt-5" />
            </>
          ) : selectedError ? (
            <AsyncState
              kind="error"
              title="Не удалось открыть профиль"
              description={selectedError}
              actionLabel="Попробовать ещё раз"
              onAction={selectedPlayerId ? () => void openPlayer(selectedPlayerId) : undefined}
              className="mt-2"
            />
          ) : selected ? (
            <>
              <div className="flex items-center gap-4 pr-10">
                <PlayerAvatar player={selected.player} large />
                <SheetHeader className="min-w-0 flex-1 p-0 pr-0">
                  <SheetTitle className="truncate text-2xl font-semibold">
                    {selected.player.nickname}
                    {selected.player.id === selfId && <span className="ml-1 text-sm font-normal text-[var(--ds-primary)]">· вы</span>}
                  </SheetTitle>
                  <SheetDescription>
                    {gameLevelLabel(selected.player.game_level)} · <span className="tabular-nums">ELO {selected.player.elo}</span>
                  </SheetDescription>
                </SheetHeader>
              </div>

              <section className="mt-5" aria-label="Статистика игрока">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Статистика</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile value={selected.stats.completedGames} label="игр" />
                  <StatTile value={selected.stats.wins} label="побед" />
                  <StatTile value={`${selected.stats.winRate}%`} label="винрейт" />
                  <StatTile value={selected.stats.firstKilled} label="ПУ" />
                  <StatTile value={selected.stats.bestMoves} label="ЛХ" />
                  <StatTile value={selected.tournament_awards.nominations} label="номинаций" />
                </div>
              </section>

              <section className="mt-5 rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] p-4" aria-label="Турнирные результаты">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Турниры</div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-base font-semibold tabular-nums text-foreground">{selected.tournament_awards.firstPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">1 место</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold tabular-nums text-foreground">{selected.tournament_awards.secondPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">2 место</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold tabular-nums text-foreground">{selected.tournament_awards.thirdPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">3 место</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold tabular-nums text-foreground">{selected.stats.tournamentGames}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">игр</div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
