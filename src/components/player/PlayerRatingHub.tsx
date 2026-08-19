import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerRatingTable from './PlayerRatingTable.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';

export type PlayerRatingSection = 'rating' | 'elo' | 'ratingperiods' | 'clubworld';

const TABS: Array<{ value: PlayerRatingSection; label: string }> = [
  { value: 'rating', label: 'Таблица' },
  { value: 'elo', label: 'Динамика' },
  { value: 'ratingperiods', label: 'Периоды' },
  { value: 'clubworld', label: 'Сезоны' },
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
        <SegmentedControl
          ariaLabel="Разделы рейтинга"
          value={section}
          items={TABS}
          onValueChange={onOpen}
          itemClassName="px-1 text-[11px]"
        />
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
