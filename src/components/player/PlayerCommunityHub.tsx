import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';
import PlayerStoriesPanel from './PlayerStoriesPanel.tsx';

/**
 * «Сообщество» (owner decision 2026-10-06): rating, players, connections and activity in one place,
 * with the poker table on top. Old addresses keep working: /player/rating (and its tabs), /player/club,
 * /player/seasons.
 */
export type CommunitySection = PlayerRatingSection | 'club' | 'clubworld';
type CommunityView = 'rating' | 'players' | 'connections' | 'activity';
type ActivityView = 'form' | 'matches' | 'season' | 'history';

// «Активность» used to be one long feed; now one part at a time (owner, 2026-10-06).
const ACTIVITY_NAV: Array<{ value: ActivityView; label: string }> = [
  { value: 'form', label: 'Форма' },
  { value: 'matches', label: 'Матчи' },
  { value: 'season', label: 'Сезон' },
  { value: 'history', label: 'Архив' },
];

const NAV: Array<{ value: CommunityView; label: string }> = [
  { value: 'rating', label: 'Рейтинг' },
  { value: 'players', label: 'Игроки' },
  { value: 'connections', label: 'Связи' },
  { value: 'activity', label: 'Активность' },
];

const viewFor = (section: CommunitySection): CommunityView =>
  section === 'club' ? 'players' : section === 'clubworld' ? 'activity' : 'rating';

export default function PlayerCommunityHub({
  data,
  section,
  onOpen,
  onOpenPoker,
  onOpenProfileElo,
}: {
  data: PlayerMeResponse;
  section: CommunitySection;
  onOpen: (section: CommunitySection) => void;
  onOpenPoker?: () => void;
  onOpenProfileElo?: () => void;
}) {
  // «Связи» has no address of its own, so it lives in local state over /player/club.
  const [view, setView] = useState<CommunityView>(() => viewFor(section));
  // Old links to /player/seasons (clubworld) still land on the season.
  const [activity, setActivity] = useState<ActivityView>(() => (section === 'clubworld' ? 'season' : 'form'));
  useEffect(() => { setView((current) => (current === 'connections' && section === 'club' ? current : viewFor(section))); }, [section]);
  const choose = (next: CommunityView) => {
    setView(next);
    onOpen(next === 'rating' ? 'rating' : next === 'activity' ? 'clubworld' : 'club');
  };

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-white" data-testid="player-community-hub">
      <div className="mx-auto w-full max-w-[430px] space-y-3 px-3">
        <header className="px-1 pt-1">
          <h1 className="text-2xl font-semibold">Сообщество</h1>
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
          ariaLabel="Разделы сообщества"
          value={view}
          items={NAV}
          onValueChange={choose}
          itemClassName="!px-0.5 !text-[11px] tracking-tight"
        />

        {view === 'players' && <PlayerClubDirectory selfId={data.player.id} />}
        {view === 'activity' && (
          <>
            <SegmentedControl ariaLabel="Разделы активности" value={activity} items={ACTIVITY_NAV} onValueChange={setActivity} itemClassName="px-1 text-[12px]" />
            {activity === 'form' && <PlayerClubActivity />}
            {activity === 'matches' && <PlayerStoriesPanel />}
            {activity === 'season' && <PlayerSeasonsPanel part="season" />}
            {activity === 'history' && <PlayerSeasonsPanel part="history" />}
          </>
        )}
        {view === 'connections' && <PlayerClubConnections />}
      </div>
      {view === 'rating' ? (
        <div className="mt-2">
          <PlayerRatingHub embedded data={data} section={section === 'club' || section === 'clubworld' ? 'rating' : section} onOpen={onOpen} onOpenProfileElo={onOpenProfileElo} />
        </div>
      ) : null}
    </main>
  );
}
