import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';

type ClubView = 'players' | 'activity' | 'connections';

const NAV: Array<{ value: ClubView; label: string }> = [
  { value: 'players', label: 'Игроки' },
  { value: 'activity', label: 'Активность' },
  { value: 'connections', label: 'Связи' },
];

export default function PlayerClubHub({ data, initialView = 'players' }: { data: PlayerMeResponse; initialView?: ClubView }) {
  const [view, setView] = useState<ClubView>(initialView);

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Клуб</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Игроки клуба, активность и связи за столом</p>
        </header>

        <SegmentedControl
          ariaLabel="Разделы клуба"
          value={view}
          items={NAV}
          onValueChange={setView}
        />

        {view === 'players' && <PlayerClubDirectory selfId={data.player.id} />}
        {view === 'activity' && <><PlayerClubActivity /><PlayerSeasonsPanel /></>}
        {view === 'connections' && <PlayerClubConnections />}
      </div>
    </main>
  );
}
