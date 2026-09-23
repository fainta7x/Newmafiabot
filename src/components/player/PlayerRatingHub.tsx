import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerRatingTable from './PlayerRatingTable.tsx';
import PlayerTournamentResults from './PlayerTournamentResults.tsx';

export type PlayerRatingSection = 'rating' | 'elo' | 'ratingperiods' | 'ratingtournaments';

type RatingTab = 'elo' | 'season' | 'tournaments';

// One tab per competition (see BUSINESS_RULES «Game formats and ratings»):
// Elo across CASUAL/RATING/TOURNAMENT games, organizer-defined seasons with
// extra points, and published tournament standings.
const TABS: Array<{ value: RatingTab; label: string }> = [
  { value: 'elo', label: 'Elo' },
  { value: 'season', label: 'Сезон' },
  { value: 'tournaments', label: 'Турниры' },
];

const ELO_VIEWS: Array<{ value: 'rating' | 'elo'; label: string }> = [
  { value: 'rating', label: 'Таблица' },
  { value: 'elo', label: 'Моя динамика' },
];

const tabFor = (section: PlayerRatingSection): RatingTab => (
  section === 'ratingperiods' ? 'season' : section === 'ratingtournaments' ? 'tournaments' : 'elo'
);

const sectionFor = (tab: RatingTab): PlayerRatingSection => (
  tab === 'season' ? 'ratingperiods' : tab === 'tournaments' ? 'ratingtournaments' : 'rating'
);

export default function PlayerRatingHub({
  data,
  section,
  onOpen,
}: {
  data: PlayerMeResponse;
  section: PlayerRatingSection;
  onOpen: (section: PlayerRatingSection) => void;
}) {
  const tab = tabFor(section);

  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-2 px-3 pt-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Рейтинг</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Elo по всем играм, кроме новичковых · сезон с доп. баллами · турниры</p>
        </header>
        <SegmentedControl
          ariaLabel="Разделы рейтинга"
          value={tab}
          items={TABS}
          onValueChange={(next) => onOpen(sectionFor(next))}
          itemClassName="px-1 text-[12px]"
        />
        {tab === 'elo' ? (
          <SegmentedControl
            ariaLabel="Вид Elo"
            value={section === 'elo' ? 'elo' : 'rating'}
            items={ELO_VIEWS}
            onValueChange={onOpen}
            itemClassName="px-1 text-[11px]"
          />
        ) : null}
      </div>

      {section === 'elo' ? (
        <PlayerEloJourney embedded />
      ) : tab === 'elo' ? (
        <PlayerRatingTable playerId={data.player.id} />
      ) : tab === 'season' ? (
        <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
          <div className="mx-auto w-full max-w-[430px] space-y-3">
            <PlayerRatingPeriods playerId={data.player.id} />
          </div>
        </main>
      ) : (
        <PlayerTournamentResults />
      )}
    </div>
  );
}
