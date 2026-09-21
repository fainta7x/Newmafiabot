import { Eye, EyeOff, RotateCcw, Shield } from 'lucide-react';
import type { SpeechExtensionAvailability } from './speechExtensionModel.js';
import type { ActivePlayerState } from './types.js';

type LiveGameJudgeToolbarProps = {
  activePlayers: ActivePlayerState[];
  onSelectPlayer: (slot: number) => void;
  speechExtensionAvailability: SpeechExtensionAvailability;
  onSpeechExtension: () => void;
  historyLength: number;
  onUndo: () => void;
  rolesAreVisible: boolean;
  onToggleRoles: () => void;
  viewMode: 'table' | 'list';
  onToggleView: () => void;
  requiresTableSeatVoting: boolean;
};

export default function LiveGameJudgeToolbar({
  activePlayers,
  onSelectPlayer,
  speechExtensionAvailability,
  onSpeechExtension,
  historyLength,
  onUndo,
  rolesAreVisible,
  onToggleRoles,
  viewMode,
  onToggleView,
  requiresTableSeatVoting,
}: LiveGameJudgeToolbarProps) {
  return (
    <div className="flex flex-wrap justify-between gap-2 items-center bg-slate-900/60 p-3 border border-slate-800 rounded-2xl">
      <span className="text-[10px] text-slate-300 font-black uppercase flex items-center gap-1.5">
        <Shield className="w-4 h-4 text-rose-500" />
        Панель судейства
      </span>
      <div className="flex flex-wrap justify-end gap-2">
        <select
          data-testid="live-player-actions-selector"
          aria-label="Действия игрока"
          value=""
          onChange={(event) => {
            const slot = Number(event.target.value);
            if (slot) onSelectPlayer(slot);
          }}
          className="max-w-[150px] px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-[10px] font-bold"
        >
          <option value="">Действия игрока</option>
          {activePlayers.map((player) => (
            <option key={player.slot_num} value={player.slot_num}>
              #{player.slot_num} {player.nickname || `Игрок ${player.slot_num}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="live-speech-extension"
          disabled={!speechExtensionAvailability.allowed}
          title={speechExtensionAvailability.allowed ? 'Добавить 30 секунд текущей речи ценой двух обычных фолов' : speechExtensionAvailability.reason}
          onClick={onSpeechExtension}
          className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-700 text-amber-200 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-30"
        >
          +30с за 2 фола
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!historyLength}
          className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-bold disabled:opacity-30"
        >
          <RotateCcw className="w-3 h-3 inline mr-1" />
          Отмена ({historyLength})
        </button>
        <button
          type="button"
          onClick={onToggleRoles}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold"
        >
          {rolesAreVisible
            ? <EyeOff className="w-3 h-3 inline mr-1" />
            : <Eye className="w-3 h-3 inline mr-1" />}
          {rolesAreVisible ? 'Скрыть роли' : 'Показать роли'}
        </button>
        <button
          type="button"
          onClick={onToggleView}
          disabled={requiresTableSeatVoting}
          title={requiresTableSeatVoting ? 'Во время голосования используется стол' : undefined}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {requiresTableSeatVoting ? 'Стол для голосования' : viewMode === 'table' ? 'Список' : 'Стол'}
        </button>
      </div>
    </div>
  );
}
