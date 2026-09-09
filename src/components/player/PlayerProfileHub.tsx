import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import CanonicalPremiumPlayerProfile from './CanonicalPremiumPlayerProfile.tsx';
import PlayerMusicSlots from './PlayerMusicSlots.tsx';
import PlayerNotificationSettings from './PlayerNotificationSettings.tsx';
import PlayerProfilePrivacySettings from './PlayerProfilePrivacySettings.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';

export default function PlayerProfileHub({ data, onPlayerChange }: { data: PlayerMeResponse; onPlayerChange?: (player: PlayerMeResponse['player']) => void }) {
  const [player, setPlayer] = useState(data.player);
  const updatePlayer = (next: PlayerMeResponse['player']) => { setPlayer(next); onPlayerChange?.(next); };

  const ownerSettings = <div className="space-y-4">
    <PlayerProfileSettings player={player} onPlayerChange={updatePlayer} />
    <PlayerNotificationSettings />
    <PlayerProfilePrivacySettings />
    <details className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
      <summary className="cursor-pointer font-semibold">Музыка</summary>
      <div className="mt-4"><PlayerMusicSlots /></div>
    </details>
  </div>;

  return <CanonicalPremiumPlayerProfile playerId={player.id} mode="self" selfPlayerId={player.id} ownerSettings={ownerSettings} />;
}
