import type { PlayerMeResponse } from '../../types/player.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';
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
  return (
    <div className="bg-[#090a0d] text-white" data-testid="player-evenings-hub">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Вечера</h1>
        </header>
        <SegmentedControl ariaLabel="Разделы вечеров" value={section} items={TABS} onValueChange={(next) => onOpen(next)} itemClassName="!px-1 text-[13px]" />
      </div>

      {section === 'events' ? (
        <PlayerEventsCalendar embedded initialEventId={target} onEventChange={(eventId) => onOpen('events', eventId)} />
      ) : section === 'recaps' ? (
        <PlayerEveningSummaries initialEveningId={target} embedded />
      ) : (
        <div className="player-games-v2">
          <PlayerHistoryStatsView data={data} initialGameKey={target} onGameChange={(gameKey) => onOpen('games', gameKey)} />
        </div>
      )}
    </div>
  );
}
