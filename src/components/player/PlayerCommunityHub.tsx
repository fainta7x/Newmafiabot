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
 * with «Мини-игры» (the poker table, «Кровь на часовой башне») as the last tab (owner, 2026-10-18). Old addresses keep working: /player/rating (and its tabs), /player/club,
 * /player/seasons.
 */
export type CommunitySection = PlayerRatingSection | 'club' | 'clubworld';
type CommunityView = 'rating' | 'players' | 'connections' | 'activity' | 'games';
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
  { value: 'games', label: 'Мини-игры' },
];

// A mini-game screen exits to /player/club: this note brings the person back to the «Мини-игры» tab instead of «Игроки».
const RETURN_KEY = 'mafia_community_return';
const readReturn = (): CommunityView | null => {
  try { const value = window.sessionStorage.getItem(RETURN_KEY); window.sessionStorage.removeItem(RETURN_KEY); return value === 'games' ? 'games' : null; } catch { return null; }
};
const writeReturn = () => { try { window.sessionStorage.setItem(RETURN_KEY, 'games'); } catch { /* the tab just opens on «Игроки» */ } };

const viewFor = (section: CommunitySection): CommunityView =>
  section === 'club' ? 'players' : section === 'clubworld' ? 'activity' : 'rating';

export default function PlayerCommunityHub({
  data,
  section,
  onOpen,
  onOpenPoker,
  onOpenClocktower,
  onOpenProfileElo,
}: {
  data: PlayerMeResponse;
  section: CommunitySection;
  onOpen: (section: CommunitySection) => void;
  onOpenPoker?: () => void;
  onOpenClocktower?: () => void;
  onOpenProfileElo?: () => void;
}) {
  // «Связи» has no address of its own, so it lives in local state over /player/club.
  const [view, setView] = useState<CommunityView>(() => (section === 'club' ? readReturn() : null) || viewFor(section));
  // Old links to /player/seasons (clubworld) still land on the season.
  const [activity, setActivity] = useState<ActivityView>(() => (section === 'clubworld' ? 'season' : 'form'));
  useEffect(() => { setView((current) => ((current === 'connections' || current === 'games') && section === 'club' ? current : viewFor(section))); }, [section]);
  const choose = (next: CommunityView) => {
    setView(next);
    onOpen(next === 'rating' ? 'rating' : next === 'activity' ? 'clubworld' : 'club');
  };

  return (
    <main className="player-workspace-page min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-white" data-testid="player-community-hub">
      <div className={"player-workspace mx-auto w-full space-y-3 px-3 transition-[max-width] " + (view === "connections" ? "max-w-6xl" : "max-w-[430px]")}>
        <header className="px-1 pt-1">
          <h1 className="text-2xl font-semibold">Сообщество</h1>
        </header>

        <SegmentedControl
          className="max-w-[430px]"
          ariaLabel="Разделы сообщества"
          value={view}
          items={NAV}
          onValueChange={choose}
          itemClassName="!px-0 !text-[10px] tracking-tighter"
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
        {view === 'games' && (
          <section className="space-y-2" data-testid="player-minigames" aria-label="Мини-игры">
            <p className="px-1 text-sm leading-5 text-white/55">Клубный досуг: играем между вечерами и зовём друг друга.</p>
            <button type="button" data-testid="player-club-poker" onClick={() => { writeReturn(); onOpenPoker?.(); }} className="ds-focus-ring flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3 text-left active:bg-white/[.08]"><span><span className="block text-base font-semibold">Покер</span><span className="mt-0.5 block text-xs font-normal text-white/55">Игра на клубные жетоны или с ботами · столы и турниры</span></span><span aria-hidden="true" className="text-white/45">›</span></button>
            <button type="button" data-testid="player-club-clocktower" onClick={() => { writeReturn(); onOpenClocktower?.(); }} className="ds-focus-ring flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3 text-left active:bg-white/[.08]"><span><span className="block text-base font-semibold">Кровь на часовой башне</span><span className="mt-0.5 block text-xs font-normal text-white/55">Настольная игра · комнаты, приглашения, правила</span></span><span aria-hidden="true" className="text-white/45">›</span></button>
          </section>
        )}
      </div>
      {view === 'rating' ? (
        <div className="mt-2">
          <PlayerRatingHub embedded data={data} section={section === 'club' || section === 'clubworld' ? 'rating' : section} onOpen={onOpen} onOpenProfileElo={onOpenProfileElo} />
        </div>
      ) : null}

    </main>
  );
}
