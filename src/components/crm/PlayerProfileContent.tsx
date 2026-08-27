import React from 'react';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;

/**
 * Game history, statistics and awards for the canonical player.
 * Identity, access and service corrections have their own single owners.
 */
export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => (
  <PlayerProfileContentBase {...props} />
);

export default PlayerProfileContent;
