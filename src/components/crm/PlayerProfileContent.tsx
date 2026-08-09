import React from 'react';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;

export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => (
  <div className="min-w-0 space-y-4 overflow-x-hidden">
    <PlayerTokenLedgerCard
      playerId={props.player.id}
      initialBalance={Number((props.player as any).tokens || 0)}
    />
    <PlayerProfileContentBase {...props} />
  </div>
);

export default PlayerProfileContent;
