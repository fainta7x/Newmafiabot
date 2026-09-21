// Presentation-only list mode; LiveGameEngine remains the owner of player-action state.
import type { ActivePlayerState } from './types.js';

type LiveGamePlayerListProps = {
  activePlayers: ActivePlayerState[];
  onSelectPlayer: (slot: number) => void;
};

export default function LiveGamePlayerList({
  activePlayers,
  onSelectPlayer,
}: LiveGamePlayerListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {activePlayers.map((player) => (
        <button
          key={player.slot_num}
          type="button"
          onClick={() => onSelectPlayer(player.slot_num)}
          className={`p-3 rounded-xl border text-left ${player.alive ? 'bg-slate-900/50 border-slate-800' : 'bg-rose-950/20 border-rose-950 opacity-70'}`}
        >
          <div className="flex justify-between items-center">
            <strong className="text-sm text-white">#{player.slot_num} {player.nickname}</strong>
            <span className="text-[10px] text-slate-500">
              {player.alive ? 'Жив' : player.eliminated_phase}
            </span>
          </div>
          <div className="mt-2 text-[9px] font-bold text-slate-500">Открыть действия игрока</div>
        </button>
      ))}
    </div>
  );
}
