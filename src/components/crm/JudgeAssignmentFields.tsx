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
        Судья клуба
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onModeChange('external')}
        className={`min-h-[44px] min-w-0 rounded-xl border px-3 text-xs font-bold ${mode === 'external' ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2 text-text-secondary'} disabled:opacity-50`}
      >
        Гость (не из клуба)
      </button>
    </div>

    {mode === 'linked' ? (
      <label className="block min-w-0 text-[10px] font-black uppercase tracking-wide text-text-muted">
        Судья — игрок клуба
        <select
          value={judgePlayerId}
          disabled={disabled}
          onChange={(event) => onJudgePlayerIdChange(event.target.value)}
          className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary"
        >
          <option value="">Выбери игрока</option>
          {players.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
        </select>
        <span className="mt-1 block normal-case font-normal text-text-muted">Игра попадёт в его статистику судейства, ачивки и жетоны.</span>
      </label>
    ) : (
      <label className="block min-w-0 text-[10px] font-black uppercase tracking-wide text-text-muted">
        Имя судьи-гостя
        <input
          type="text"
          value={judgeName}
          disabled={disabled}
          onChange={(event) => onJudgeNameChange(event.target.value)}
          placeholder="Имя для отображения"
          className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary"
        />
        <span className="mt-1 block normal-case font-normal text-text-muted">Только для судьи не из клуба: ему игра не засчитывается. Если судья есть в клубе — выбери его во вкладке «Судья клуба».</span>
      </label>
    )}
  </div>
);
