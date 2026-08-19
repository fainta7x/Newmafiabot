import { ChevronRight, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, type BadgeVariant } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card.tsx';
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

const gameLevelVariant = (level: string): BadgeVariant => {
  if (level === 'novice') return 'warning';
  if (level === 'tournament') return 'accent';
  return 'neutral';
};

function PlayerAvatar({ player, large = false }: { player: DirectoryPlayer; large?: boolean }) {
  const sizeClass = large ? 'h-[72px] w-[72px] rounded-[20px]' : 'h-12 w-12 rounded-[14px]';

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
      className={`${sizeClass} flex shrink-0 items-center justify-center bg-secondary text-base font-bold text-muted-foreground ring-1 ring-[var(--ds-border-strong)]`}
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </div>
  );
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-border bg-secondary px-2 py-3 text-center">
      <div className="text-lg font-bold leading-none tracking-[-0.025em] text-foreground">{value}</div>
      <div className="mt-1.5 text-[10px] font-medium text-muted-foreground">{label}</div>
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
    setSelectedPlayerId(null);
    setSelected(null);
    setSelectedError(null);
    setSelectedLoading(false);
  };

  return (
    <>
      <Card data-testid="club-directory" className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle>Игроки клуба</CardTitle>
            <CardDescription className="mt-1">Профили и игровой уровень участников 2LA Noire.</CardDescription>
          </div>
          {players && (
            <Badge variant="neutral" aria-label={`${players.length} игроков`} className="shrink-0 tabular-nums">
              {players.length}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="px-3 pb-3">
          <label className="ds-focus-ring flex min-h-[var(--ds-control-md)] items-center gap-2.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border-strong)] bg-[var(--ds-background)] px-3 transition-colors focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Найти игрока</span>
            <input
              data-testid="club-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти игрока"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-foreground outline-none placeholder:text-[var(--ds-subtle-foreground)]"
            />
          </label>

          {error ? (
            <div className="mt-3 rounded-[var(--ds-radius-md)] border border-[color:var(--ds-danger)]/25 bg-[var(--ds-danger-soft)] px-3 py-4 text-sm text-[var(--ds-danger)]">
              {error}
            </div>
          ) : players === null ? (
            <div className="mt-3 flex min-h-24 items-center justify-center rounded-[var(--ds-radius-md)] border border-border bg-secondary text-sm text-muted-foreground">
              Загрузка игроков…
            </div>
          ) : filtered.length ? (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--ds-radius-md)] border border-border bg-[var(--ds-background)]">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  data-testid={`club-player-${item.id}`}
                  type="button"
                  disabled={selectedLoading}
                  onClick={() => void openPlayer(item.id)}
                  className="ds-focus-ring group flex min-h-[76px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ui-accent active:bg-ui-accent disabled:pointer-events-none disabled:opacity-45"
                >
                  <PlayerAvatar player={item} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold text-foreground">{item.nickname}</span>
                      {item.id === selfId && <Badge variant="accent" className="shrink-0">Вы</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant={gameLevelVariant(item.game_level)}>{gameLevelLabel(item.game_level)}</Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums text-foreground">{item.elo}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-subtle-foreground)]">ELO</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--ds-subtle-foreground)] transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex min-h-28 flex-col items-center justify-center rounded-[var(--ds-radius-md)] border border-dashed border-border bg-secondary px-4 text-center">
              <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-foreground">Никого не нашли</p>
              <p className="mt-1 text-xs text-muted-foreground">Попробуйте изменить запрос.</p>
            </div>
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
              <div className="mt-5 space-y-3" aria-hidden="true">
                <div className="h-20 animate-pulse rounded-[var(--ds-radius-lg)] bg-secondary" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 animate-pulse rounded-[var(--ds-radius-md)] bg-secondary" />
                  <div className="h-16 animate-pulse rounded-[var(--ds-radius-md)] bg-secondary" />
                  <div className="h-16 animate-pulse rounded-[var(--ds-radius-md)] bg-secondary" />
                </div>
              </div>
            </>
          ) : selectedError ? (
            <>
              <SheetHeader>
                <SheetTitle>Не удалось открыть профиль</SheetTitle>
                <SheetDescription>{selectedError}</SheetDescription>
              </SheetHeader>
              {selectedPlayerId && (
                <Button className="mt-5 w-full" onClick={() => void openPlayer(selectedPlayerId)}>
                  Попробовать ещё раз
                </Button>
              )}
            </>
          ) : selected ? (
            <>
              <div className="flex items-center gap-4 pr-10">
                <PlayerAvatar player={selected.player} large />
                <SheetHeader className="min-w-0 flex-1 p-0 pr-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <SheetTitle className="truncate text-xl">{selected.player.nickname}</SheetTitle>
                    {selected.player.id === selfId && <Badge variant="accent" className="shrink-0">Вы</Badge>}
                  </div>
                  <SheetDescription className="flex flex-wrap items-center gap-2">
                    <Badge variant={gameLevelVariant(selected.player.game_level)}>
                      {gameLevelLabel(selected.player.game_level)}
                    </Badge>
                    <span className="font-semibold tabular-nums text-foreground">ELO {selected.player.elo}</span>
                  </SheetDescription>
                </SheetHeader>
              </div>

              <section className="mt-5" aria-label="Статистика игрока">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Статистика</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile value={selected.stats.completedGames} label="игр" />
                  <StatTile value={selected.stats.wins} label="побед" />
                  <StatTile value={`${selected.stats.winRate}%`} label="винрейт" />
                  <StatTile value={selected.stats.firstKilled} label="ПУ" />
                  <StatTile value={selected.stats.bestMoves} label="ЛХ" />
                  <StatTile value={selected.tournament_awards.nominations} label="номинаций" />
                </div>
              </section>

              <section className="mt-5 rounded-[var(--ds-radius-lg)] border border-border bg-secondary p-4" aria-label="Турнирные результаты">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Турниры</div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-base font-bold tabular-nums text-foreground">{selected.tournament_awards.firstPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">1 место</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-foreground">{selected.tournament_awards.secondPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">2 место</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-foreground">{selected.tournament_awards.thirdPlaces}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">3 место</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-foreground">{selected.stats.tournamentGames}</div>
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
