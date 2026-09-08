import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PremiumPlayerProfile from './PremiumPlayerProfile.tsx';
import PlayerMusicSlots from './PlayerMusicSlots.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';
import PlayerVerifiedAwards from './PlayerVerifiedAwards.tsx';

export default function PlayerProfileHub({ data, onPlayerChange }: { data: PlayerMeResponse; onPlayerChange?: (player: PlayerMeResponse['player']) => void }) {
  const [player, setPlayer] = useState(data.player);
  const updatePlayer = (next: PlayerMeResponse['player']) => { setPlayer(next); onPlayerChange?.(next); };
  const earnedAchievements = data.achievements.categories.flatMap((category) => category.achievements.filter((achievement) => achievement.earned));

  const ownTools = <>
    <PlayerProfileCompletionCard />
    <PlayerVerifiedAwards />
    <details className="group rounded-[24px] border border-white/10 bg-white/[0.045]" open={earnedAchievements.length > 0}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold">Достижения приложения <span className="ml-auto text-white/45">{data.achievements.earned}/{data.achievements.total}</span></summary>
      <div className="border-t border-white/10 p-3">
        {earnedAchievements.length ? <div className="space-y-2">{earnedAchievements.map((achievement) => <div key={achievement.id} className="rounded-xl bg-black/20 p-3"><div className="text-sm font-semibold">{achievement.icon} {achievement.name}</div><p className="mt-1 text-sm leading-5 text-white/50">{achievement.description}</p></div>)}</div> : <div className="py-5 text-center text-sm text-white/45">Достижения появятся по мере игр.</div>}
      </div>
    </details>
    <PlayerProfileSettings player={player} onPlayerChange={updatePlayer} />
    <PlayerMusicSlots />
  </>;

  return <PremiumPlayerProfile playerId={player.id} mode="self" ownTools={ownTools} />;
}
