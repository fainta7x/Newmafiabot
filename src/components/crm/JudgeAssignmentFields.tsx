import React from 'react';
import type { Player } from '../../lib/api.ts';

export type JudgeIdentityMode = 'linked' | 'external';

interface JudgeAssignmentFieldsProps {
  mode: JudgeIdentityMode;
  players: Player[];
  judgePlayerId: string;
  judgeName: string;
  disabled?: boolean;
  onModeChange: (mode: JudgeIdentityMode) => void;
  onJudgePlayerIdChange: (playerId: string) => void;
  onJudgeNameChange: (name: string) => void;
}

export const JudgeAssignmentFields: React.FC<JudgeAssignmentFieldsProps> = ({
  mode, players, judgePlayerId, judgeName, disabled,
  onModeChange, onJudgePlayerIdChange, onJudgeNameChange,
}) => (
  <div className="min-w-0 space-y-2" data-testid="judge-assignment-fields">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onModeChange('linked')}
        className={`min-h-[44px] min-w-0 rounded-xl border px-3 text-xs font-bold ${mode === 'linked' ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2 text-text-secondary'} disabled:opacity-50`}
      >
        Игрок из CRM
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onModeChange('external')}
        className={`min-h-[44px] min-w-0 rounded-xl border px-3 text-xs font-bold ${mode === 'external' ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2 text-text-secondary'} disabled:opacity-50`}
      >
        Внешний / текстовый
      </button>
    </div>

    {mode === 'linked' ? (
      <label className="block min-w-0 text-[10px] font-black uppercase tracking-wide text-text-muted">
        Судья — игрок CRM
        <select
          value={judgePlayerId}
          disabled={disabled}
          onChange={(event) => onJudgePlayerIdChange(event.target.value)}
          className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary"
        >
          <option value="">Выбери игрока</option>
          {players.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
        </select>
        <span className="mt-1 block normal-case font-normal text-text-muted">Связь создаётся только выбором здесь — имя само по себе не привязывает профиль.</span>
      </label>
    ) : (
      <label className="block min-w-0 text-[10px] font-black uppercase tracking-wide text-text-muted">
        Имя внешнего судьи
        <input
          type="text"
          value={judgeName}
          disabled={disabled}
          onChange={(event) => onJudgeNameChange(event.target.value)}
          placeholder="Имя для отображения"
          className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary"
        />
        <span className="mt-1 block normal-case font-normal text-text-muted">Даже совпадающий ник останется неподвязанным, пока не выбран игрок CRM.</span>
      </label>
    )}
  </div>
);
