import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PremiumPlayerProfile from './PremiumPlayerProfile.tsx';
import PremiumProfileShowcase from './PremiumProfileShowcase.tsx';
import PlayerMusicSlots from './PlayerMusicSlots.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';
import PlayerVerifiedAwards from './PlayerVerifiedAwards.tsx';

export default function PlayerProfileHub({ data, onPlayerChange }: { data: PlayerMeResponse; onPlayerChange?: (player: PlayerMeResponse['player']) => void }) {
  const [player, setPlayer] = useState(data.player);
  const updatePlayer = (next: PlayerMeResponse['player']) => { setPlayer(next); onPlayerChange?.(next); };

  const ownTools = <>
    <PremiumProfileShowcase playerId={player.id} isSelf />
    <PlayerProfileCompletionCard />
    <PlayerVerifiedAwards />
    <PlayerProfileSettings player={player} onPlayerChange={updatePlayer} />
    <PlayerMusicSlots />
  </>;

  return <PremiumPlayerProfile playerId={player.id} mode="self" ownTools={ownTools} />;
}
