import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerRatingTable from './PlayerRatingTable.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';

export type PlayerRatingSection = 'rating' | 'elo' | 'ratingperiods' | 'clubworld';

const TABS: Array<{ id: PlayerRatingSection; label: string }> = [
  { id: 'rating', label: 'Таблица' },
  { id: 'elo', label: 'Динамика' },
  { id: 'ratingperiods', label: 'Периоды' },
  { id: 'clubworld', label: 'Сезоны' },
];

export default function PlayerRatingHub({
  data,
  section,
  onOpen,
}: {
  data: PlayerMeResponse;
  section: PlayerRatingSection;
  onOpen: (section: PlayerRatingSection) => void;
}) {
  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Рейтинг</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Текущее место, динамика Elo, зачётные периоды и сезоны</p>
        </header>
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1">
          {TABS.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-10 rounded-xl px-1 text-[11px] font-semibold transition ${active ? 'bg-white text-black' : 'text-white/42 active:bg-white/[0.05]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'rating' ? (
        <PlayerRatingTable playerId={data.player.id} />
      ) : section === 'elo' ? (
        <PlayerEloJourney embedded />
      ) : section === 'ratingperiods' ? (
        <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
          <div className="mx-auto w-full max-w-[430px] space-y-3">
            <PlayerRatingPeriods playerId={data.player.id} />
          </div>
        </main>
      ) : (
        <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
          <div className="mx-auto w-full max-w-[430px]">
            <PlayerSeasonsPanel />
          </div>
        </main>
      )}
    </div>
  );
}
