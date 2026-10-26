import type { PlayerMeResponse } from '../../types/player.ts';
import { useEffect, useState } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerMetricRatings from './PlayerMetricRatings.tsx';
import PlayerRatingTable from './PlayerRatingTable.tsx';
import PlayerTournamentResults from './PlayerTournamentResults.tsx';
import { readViewParam, writeViewParam } from '../../lib/urlViewParam';

export type PlayerRatingSection = 'rating' | 'ratingperiods' | 'ratingtournaments';

type RatingTab = 'elo' | 'season' | 'tournaments' | 'metrics';

// One tab per competition (see BUSINESS_RULES «Game formats and ratings»):
// Elo across CASUAL/RATING/TOURNAMENT games, organizer-defined seasons with
// extra points, and published tournament standings.
const TABS: Array<{ value: RatingTab; label: string }> = [
  { value: 'elo', label: 'Elo' },
  { value: 'metrics', label: 'Показатели' },
  { value: 'season', label: 'Сезон' },
  { value: 'tournaments', label: 'Турниры' },
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
  onOpenProfileElo,
  embedded = false,
}: {
  data: PlayerMeResponse;
  section: PlayerRatingSection;
  onOpen: (section: PlayerRatingSection) => void;
  /** The personal Elo history is a tab of the profile, not a second screen here. */
  onOpenProfileElo?: () => void;
  /** Inside «Сообщество»: the section already has its title. */
  embedded?: boolean;
}) {
  // «Показатели» is a view of its own inside the rating; the other three tabs keep their routes.
  const [metricsOpen, setMetricsOpen] = useState(() => readViewParam('rating', ['metrics']) === 'metrics');
  // A reload keeps «Показатели» open (its own parameter: the community hub keeps `view`).
  useEffect(() => { writeViewParam('rating', metricsOpen ? 'metrics' : null); }, [metricsOpen]);
  const tab: RatingTab = metricsOpen ? 'metrics' : tabFor(section);

  return (
    <div className="bg-[#090a0d] text-white">
      <div className={`player-workspace mx-auto w-full max-w-[430px] space-y-2 px-3 ${embedded ? 'pt-0' : 'pt-3'}`}>
        <header className={embedded ? 'px-1' : 'px-1 pb-1 pt-1'}>
          <h1 className={embedded ? 'sr-only' : 'text-2xl font-semibold'}>Рейтинг</h1>
          {embedded ? null : <p className="mt-1 text-xs leading-5 text-white/40">Elo по всем играм, кроме новичковых · рейтинги по показателям · сезон с доп. баллами · турниры</p>}
        </header>
        <SegmentedControl
          ariaLabel="Разделы рейтинга"
          value={tab}
          items={TABS}
          onValueChange={(next) => { setMetricsOpen(next === 'metrics'); if (next !== 'metrics') onOpen(sectionFor(next)); }}
          itemClassName="px-1 text-[12px]"
        />
        {/* Inside «Сообщество» the list comes first; the own Elo path lives in «Прогресс». */}
        {tab === 'elo' && onOpenProfileElo && !embedded ? (
          <button type="button" onClick={onOpenProfileElo} data-testid="rating-open-profile-elo" className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-left text-[13px] text-white/60">Моя динамика Elo, график и «что если» — в профиле ›</button>
        ) : null}
      </div>

      {tab === 'elo' ? (
        <PlayerRatingTable playerId={data.player.id} />
      ) : tab === 'metrics' ? (
        <PlayerMetricRatings />
      ) : tab === 'season' ? (
        <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
          <div className="player-workspace mx-auto w-full max-w-[430px] space-y-3">
            <PlayerRatingPeriods playerId={data.player.id} />
          </div>
        </main>
      ) : (
        <PlayerTournamentResults />
      )}
    </div>
  );
}
