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

export default function PlayerClubHub({ data, initialView = 'players', onOpenPoker }: { data: PlayerMeResponse; initialView?: ClubView; onOpenPoker?: () => void }) {
  const [view, setView] = useState<ClubView>(initialView);

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Клуб</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Игроки клуба, активность и связи за столом</p>
        </header>

        {onOpenPoker ? (
          <button
            type="button"
            data-testid="player-club-poker"
            onClick={onOpenPoker}
            className="ds-focus-ring relative flex min-h-[84px] w-full items-center overflow-hidden rounded-2xl border border-amber-200/15 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-[center_42%] text-left shadow-[0_14px_34px_rgba(0,0,0,.45)]"
          >
            <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,7,8,.94)_0%,rgba(6,7,8,.72)_58%,rgba(6,7,8,.25)_100%)]" aria-hidden="true" />
            <span className="relative flex-1 px-4 py-3">
              <span className="block text-[10px] uppercase tracking-[.22em] text-amber-200/60">Клубный досуг</span>
              <span className="mt-0.5 block text-base font-semibold text-white">Покерный стол</span>
              <span className="mt-0.5 block text-xs text-white/55">Холдем на игровые фишки, до 8 игроков</span>
            </span>
            <span className="relative mr-3 rounded-xl bg-[linear-gradient(#e3c477,#b98637)] px-3 py-2 text-xs font-bold text-[#1a1106]">Играть</span>
          </button>
        ) : null}

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
