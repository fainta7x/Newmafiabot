import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';
import PlayerClubSection from './PlayerClubSection.tsx';

type ClubView = 'players' | 'life';

export default function PlayerClubHub({ data }: { data: PlayerMeResponse }) {
  const [view, setView] = useState<ClubView>('players');

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
          <h1 className="mt-1 text-2xl font-semibold">Клуб</h1>
          <p className="mt-1 text-sm text-white/45">Игроки, связи и то, чем живёт 2LA Noire</p>
        </header>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
          {([
            ['players', 'Игроки'],
            ['life', 'Жизнь клуба'],
          ] as Array<[ClubView, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition ${view === id ? 'bg-white text-black' : 'text-white/45'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'players' ? (
          <PlayerClubDirectory selfId={data.player.id} />
        ) : (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.025] p-3">
            <PlayerClubSection games={data.games.all} />
          </section>
        )}
      </div>
    </main>
  );
}
