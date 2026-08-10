import React from 'react';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;

export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => (
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
    <PlayerTokenLedgerCard
      playerId={props.player.id}
      initialBalance={Number((props.player as any).tokens || 0)}
    />
    <PlayerProfileContentBase {...props} />
  </div>
);

export default PlayerProfileContent;
