import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.ts';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;
type GameLevel = 'novice' | 'club' | 'tournament';

const GAME_LEVEL_HINTS: Record<GameLevel, string> = {
  novice: 'Получает приглашения только на новичковые вечера',
  club: 'Получает приглашения на новичковые и обычные вечера',
  tournament: 'Получает приглашения на обычные и турнирные вечера',
};

export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => {
  const initialLevel = ((props.player as any).game_level || 'club') as GameLevel;
  const [gameLevel, setGameLevel] = useState<GameLevel>(initialLevel);
  const [levelSaving, setLevelSaving] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);

  useEffect(() => {
    setGameLevel((((props.player as any).game_level || 'club') as GameLevel));
    setLevelError(null);
  }, [props.player.id, (props.player as any).game_level]);

  const changeGameLevel = async (next: GameLevel) => {
    if (levelSaving || next === gameLevel) return;
    const previous = gameLevel;
    setGameLevel(next);
    setLevelSaving(true);
    setLevelError(null);
    try {
      await api.updatePlayer(props.player.id, { game_level: next } as any);
    } catch (error: any) {
      setGameLevel(previous);
      setLevelError(error?.message || 'Не удалось сохранить уровень игрока');
    } finally {
      setLevelSaving(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Telegram</span>
          <strong className="mt-0.5 block truncate text-[13px] text-text-primary">
            {props.player.telegram_user_id ? 'Профиль привязан' : 'Профиль не привязан'}
          </strong>
        </div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${props.player.telegram_user_id ? 'bg-success' : 'bg-text-muted'}`} />
      </div>

      <div className="rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Уровень игры</span>
            <span className="mt-0.5 block text-[11px] text-text-secondary">{GAME_LEVEL_HINTS[gameLevel]}</span>
          </div>
          <select
            value={gameLevel}
            disabled={levelSaving}
            onChange={(event) => void changeGameLevel(event.target.value as GameLevel)}
            className="mobile-field min-h-[44px] sm:w-[190px]"
          >
            <option value="novice">Новичок</option>
            <option value="club">Игрок клуба</option>
            <option value="tournament">Турнирный игрок</option>
          </select>
        </div>
        {levelSaving ? <p className="mt-2 text-[11px] text-text-muted">Сохраняем…</p> : null}
        {levelError ? <p className="mt-2 text-[11px] text-danger">{levelError}</p> : null}
      </div>

      <PlayerTokenLedgerCard
        playerId={props.player.id}
        initialBalance={Number((props.player as any).tokens || 0)}
      />
      <PlayerProfileContentBase {...props} />
    </div>
  );
};

export default PlayerProfileContent;
