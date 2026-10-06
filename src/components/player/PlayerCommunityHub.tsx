import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';

/**
 * «Сообщество» (owner decision 2026-10-06): rating, players, connections and activity in one place,
 * with the poker table on top. Old addresses keep working: /player/rating (and its tabs), /player/club,
 * /player/seasons.
 */
export type CommunitySection = PlayerRatingSection | 'club' | 'clubworld';
type CommunityView = 'rating' | 'players' | 'connections' | 'activity';

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
            className="ds-focus-ring flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-amber-200/15 bg-white/[.03] px-3 py-2 text-left"
          >
            <span className="h-8 w-8 shrink-0 rounded-xl bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">Покерный стол</span><span className="block truncate text-[11px] text-white/45">Холдем на фишки, до 8 игроков</span></span>
            <span className="rounded-xl bg-[linear-gradient(#e3c477,#b98637)] px-3 py-1.5 text-xs font-bold text-[#1a1106]">Играть</span>
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
        {view === 'activity' && <><PlayerClubActivity /><PlayerSeasonsPanel /></>}
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
