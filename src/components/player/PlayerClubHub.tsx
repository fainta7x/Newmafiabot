import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
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
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-2">
          <h1 className="text-2xl font-semibold">Клуб</h1>
          <p className="mt-1 text-sm text-white/45">Люди, жизнь клуба и связи за столом</p>
        </header>

        <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1" aria-label="Разделы клуба">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`min-h-11 rounded-xl px-2 text-[11px] font-semibold transition ${view === item.id ? 'bg-white text-black' : 'text-white/45'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {view === 'players' && <PlayerClubDirectory selfId={data.player.id} />}
        {view === 'activity' && <PlayerClubActivity />}
        {view === 'connections' && <PlayerClubConnections />}
      </div>
    </main>
  );
}
