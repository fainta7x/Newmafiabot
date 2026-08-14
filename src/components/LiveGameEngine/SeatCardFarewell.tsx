import React from 'react';
import BaseSeatCard from './SeatCard.tsx';

type SeatCardProps = React.ComponentProps<typeof BaseSeatCard>;

const getGridPositionClass = (slot: number) => {
  const positions: Record<number, string> = {
    1: 'md:col-start-1 md:row-start-3',
    2: 'md:col-start-2 md:row-start-3',
    3: 'md:col-start-3 md:row-start-3',
    4: 'md:col-start-4 md:row-start-3',
    5: 'md:col-start-5 md:row-start-3',
    6: 'md:col-start-5 md:row-start-1',
    7: 'md:col-start-4 md:row-start-1',
    8: 'md:col-start-3 md:row-start-1',
    9: 'md:col-start-2 md:row-start-1',
    10: 'md:col-start-1 md:row-start-1',
  };
  return positions[slot] || '';
};

const readPostNightStage = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.postNightStage === 'string' ? parsed.postNightStage : null;
  } catch {
    return null;
  }
};

/**
 * Dead players normally lose the quick foul controls together with the rest of
 * the active-seat actions. A player killed at night is still under discipline
 * during the farewell speech, so keep only regular-foul +/- controls available
 * until the judge advances to the death protocol.
 */
export default function SeatCardFarewell(props: SeatCardProps) {
  const player = props.activePlayers.find((item) => item.slot_num === props.slotNum);
  const [postNightStage, setPostNightStage] = React.useState<string | null>(() => readPostNightStage());

  React.useEffect(() => {
    if (props.phase !== 'night') {
      setPostNightStage(null);
      return;
    }
    const sync = () => setPostNightStage(readPostNightStage());
    sync();
    const interval = window.setInterval(sync, 250);
    return () => window.clearInterval(interval);
  }, [props.phase]);

  const isKilledFarewellSpeaker = Boolean(
    player
      && !player.alive
      && props.phase === 'night'
      && postNightStage === 'farewell'
      && props.activeSpeakerSlot === props.slotNum,
  );

  return (
    <div className={`relative self-center w-full ${getGridPositionClass(props.slotNum)}`}>
      <BaseSeatCard {...props} />

      {isKilledFarewellSpeaker && player && (
        <div className="absolute top-1.5 right-1.5 z-40 flex items-center gap-1 rounded-lg border border-amber-500/40 bg-slate-950/95 p-1 shadow-xl">
          {player.fouls > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.handleFoulChange(props.slotNum, 'down');
              }}
              className="h-7 min-w-7 rounded-md border border-slate-700 bg-slate-900 px-1 text-xs font-black text-slate-200"
              title="Снять фол у игрока на прощальной"
            >
              −Ф
            </button>
          )}
          <span className="px-1 text-[10px] font-black text-amber-300">{player.fouls}Ф</span>
          {player.fouls < 4 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.handleFoulChange(props.slotNum, 'up');
              }}
              className="h-7 min-w-7 rounded-md border border-rose-700 bg-rose-950/90 px-1 text-xs font-black text-rose-200"
              title="Добавить фол игроку на прощальной"
            >
              +Ф
            </button>
          )}
        </div>
      )}
    </div>
  );
}
