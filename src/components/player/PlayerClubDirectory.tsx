import { ChevronRight, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AsyncState from '../ui/AsyncState.tsx';
import { Badge, type BadgeVariant } from '../ui/Badge.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card.tsx';
import { Input } from '../ui/Input.tsx';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type DirectoryPlayer = { id: string; nickname: string; elo: number; game_level: string; avatar_url: string | null };

const gameLevelLabel = (level: string) => level === 'novice' ? 'Новичок' : level === 'tournament' ? 'Турнирный игрок' : 'Игрок клуба';
const gameLevelVariant = (level: string): BadgeVariant => level === 'novice' ? 'warning' : level === 'tournament' ? 'accent' : 'neutral';

function PlayerAvatar({ player }: { player: DirectoryPlayer }) {
  if (player.avatar_url) return <img src={player.avatar_url} alt={player.nickname} className="h-12 w-12 shrink-0 rounded-[14px] object-cover ring-1 ring-[var(--ds-border-strong)]" />;
  return <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-secondary text-base font-bold text-muted-foreground ring-1 ring-[var(--ds-border-strong)]">{player.nickname.slice(0, 1).toUpperCase()}</div>;
}

export default function PlayerClubDirectory({ selfId }: { selfId: string }) {
  const [players, setPlayers] = useState<DirectoryPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/players', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игроков');
        if (!cancelled) setPlayers(Array.isArray(body?.players) ? body.players : []);
      } catch (loadError: any) { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить игроков'); }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return players || [];
    return (players || []).filter((item) => item.nickname.toLocaleLowerCase('ru-RU').includes(query));
  }, [players, search]);

  return <Card data-testid="club-directory" className="overflow-hidden">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
      <div className="min-w-0"><CardTitle>Игроки клуба</CardTitle><CardDescription className="mt-1">Откройте единый профиль: игры, роли, Elo и достижения.</CardDescription></div>
      {players ? <Badge variant="neutral" aria-label={`${players.length} игроков`} className="shrink-0 tabular-nums">{players.length}</Badge> : null}
    </CardHeader>
    <CardContent className="px-3 pb-3">
      <div className="relative"><label htmlFor="club-search" className="sr-only">Найти игрока</label><Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="club-search" data-testid="club-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="pl-10" /></div>
      {error ? <AsyncState kind="error" title="Не удалось загрузить игроков" description={error} compact className="mt-3" /> : players === null ? <AsyncState kind="loading" title="Загрузка игроков…" compact className="mt-3" /> : filtered.length ? (
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--ds-radius-md)] border border-border bg-[var(--ds-background)]">
          {filtered.map((item) => <button key={item.id} data-testid={`club-player-${item.id}`} type="button" onClick={() => openCanonicalPlayerProfile(item.id)} className="ds-focus-ring group flex min-h-[76px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ui-accent active:bg-ui-accent">
            <PlayerAvatar player={item} />
            <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-bold text-foreground">{item.nickname}</span>{item.id === selfId ? <Badge variant="accent" className="shrink-0">Вы</Badge> : null}</div><div className="mt-1.5"><Badge variant={gameLevelVariant(item.game_level)}>{gameLevelLabel(item.game_level)}</Badge></div></div>
            <div className="flex shrink-0 items-center gap-2"><div className="text-right"><div className="text-sm font-bold tabular-nums text-foreground">{item.elo}</div><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-subtle-foreground)]">ELO</div></div><ChevronRight className="h-4 w-4 text-[var(--ds-subtle-foreground)] transition-transform group-active:translate-x-0.5" aria-hidden="true" /></div>
          </button>)}
        </div>
      ) : <AsyncState kind="empty" title="Никого не нашли" description="Попробуйте изменить запрос." icon={<UserRound className="h-5 w-5" />} compact className="mt-3" />}
    </CardContent>
  </Card>;
}
