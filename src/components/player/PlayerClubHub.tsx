import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import { Button } from '../ui/Button.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';

type ClubView = 'players' | 'activity' | 'connections';

const NAV: Array<{ id: ClubView; label: string }> = [
  { id: 'players', label: 'Игроки' },
  { id: 'activity', label: 'Активность' },
  { id: 'connections', label: 'Связи' },
];

export default function PlayerClubHub({ data }: { data: PlayerMeResponse }) {
  const [view, setView] = useState<ClubView>('players');

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-foreground">
      <div className="mx-auto w-full max-w-[430px] space-y-4">
        <header className="px-1 pb-1 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">2LA Noire</div>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.035em]">Клуб</h1>
          <p className="mt-1.5 max-w-[330px] text-sm leading-5 text-muted-foreground">
            Игроки клуба, активность и связи за столом.
          </p>
        </header>

        <nav
          className="grid grid-cols-3 gap-1 rounded-[var(--ds-radius-lg)] border border-border bg-card p-1 shadow-[var(--ds-shadow-surface)]"
          aria-label="Разделы клуба"
        >
          {NAV.map((item) => {
            const active = view === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                size="md"
                variant="ghost"
                onClick={() => setView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-w-0 px-2 text-xs ${active ? 'bg-foreground text-background hover:bg-foreground hover:text-background' : 'text-muted-foreground'}`}
              >
                {item.label}
              </Button>
            );
          })}
        </nav>

        {view === 'players' && <PlayerClubDirectory selfId={data.player.id} />}
        {view === 'activity' && <PlayerClubActivity />}
        {view === 'connections' && <PlayerClubConnections />}
      </div>
    </main>
  );
}
