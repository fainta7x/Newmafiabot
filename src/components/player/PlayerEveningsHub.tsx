import type { PlayerMeResponse } from '../../types/player.ts';
import { playerPathForSection } from '../../lib/appNavigation.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';
import PlayerEveningLiveOverview from './PlayerEveningLiveOverview.tsx';
import PlayerHistoryStatsView from './PlayerHistoryStatsView.tsx';

/**
 * «Вечера» (owner decision 2026-10-06): the calendar and the games in one evening-centred place.
 * «Скоро» — upcoming evenings and sign-up, «Прошедшие» — results of past evenings, «Мои игры» — my games.
 * Each tab keeps its old address (/player/events, /player/recaps, /player/games).
 */
export type PlayerEveningsSection = 'events' | 'recaps' | 'games';

const TABS: Array<{ value: PlayerEveningsSection; label: string }> = [
  { value: 'events', label: 'Скоро' },
  { value: 'recaps', label: 'Прошедшие' },
  { value: 'games', label: 'Мои игры' },
];

export default function PlayerEveningsHub({
  data,
  section,
  target = null,
  onOpen,
}: {
  data: PlayerMeResponse;
  section: PlayerEveningsSection;
  target?: string | null;
  onOpen: (section: PlayerEveningsSection, target?: string | null) => void;
}) {
  const openProtocol = (gameKey: string, returnSection: 'events' | 'recaps', eveningId: string) => {
    // Preserve the exact evening as the return destination for browser and Telegram Back.
    const returnPath = playerPathForSection(returnSection, eveningId);
    window.history.replaceState(window.history.state, '', returnPath);
    onOpen('games', gameKey);
    window.history.replaceState({ ...window.history.state, gameReturn: returnPath }, '', window.location.pathname);
  };

  return (
    <div className="bg-[#090a0d] text-white" data-testid="player-evenings-hub">
      <div className="player-workspace mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Вечера</h1>
        </header>
        <SegmentedControl ariaLabel="Разделы вечеров" value={section} items={TABS} onValueChange={(next) => onOpen(next)} itemClassName="!px-1 text-[13px]" />
      </div>

      {section === 'events' && !target ? <PlayerEveningLiveOverview onOpenGame={(gameKey, eveningId) => openProtocol(gameKey, 'events', eveningId)} onOpenEvening={(id) => onOpen('events', id)} /> : null}

      {section === 'events' ? (
        <PlayerEventsCalendar embedded initialEventId={target} onEventChange={(eventId) => onOpen('events', eventId)} onOpenGame={(gameKey, eveningId) => openProtocol(gameKey, 'events', eveningId)} />
      ) : section === 'recaps' ? (
        <PlayerEveningSummaries initialEveningId={target} onOpenGame={(gameKey, eveningId) => openProtocol(gameKey, 'recaps', eveningId)} embedded />
      ) : (
        <div className="player-games-v2">
          <PlayerHistoryStatsView data={data} initialGameKey={target} onGameChange={(gameKey) => onOpen('games', gameKey)} />
        </div>
      )}
    </div>
  );
}
