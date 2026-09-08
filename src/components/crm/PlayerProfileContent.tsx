import React from 'react';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';
import PlayerProfileIntegrityPanel from './PlayerProfileIntegrityPanel.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;

/**
 * Keeps official verified awards/profile integrity separate from application achievements,
 * game statistics and rating calculations.
 */
export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => (
  <div className="space-y-3">
    <PlayerProfileIntegrityPanel player={props.player} />
    <PlayerProfileContentBase {...props} />
  </div>
);

export default PlayerProfileContent;
