import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';

type ClubView = 'players' | 'activity' | 'connections';

const NAV: Array<{ value: ClubView; label: string }> = [
  { value: 'players', label: 'Игроки' },
  { value: 'activity', label: 'Активность' },
  { value: 'connections', label: 'Связи' },
];

export default function PlayerClubHub({ data }: { data: PlayerMeResponse }) {
  const [view, setView] = useState<ClubView>('players');

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-foreground">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Клуб</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground/65">Люди, жизнь клуба и связи за столом</p>
        </header>

        <SegmentedControl
          ariaLabel="Разделы клуба"
          value={view}
          items={NAV}
          onValueChange={setView}
        />

        {view === 'players' && <PlayerClubDirectory selfId={data.player.id} />}
        {view === 'activity' && <PlayerClubActivity />}
        {view === 'connections' && <PlayerClubConnections />}
      </div>
    </main>
  );
}
