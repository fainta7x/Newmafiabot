import type { PlayerMeResponse } from '../../types/player.ts';
import CanonicalPremiumPlayerProfile from './CanonicalPremiumPlayerProfile.tsx';
import PlayerLearningBlock from './PlayerLearningBlock.tsx';

/** «Прогресс»: my own profile — statistics, roles, Elo path, awards, club history and «Обучение». */
export default function PlayerProfileHub({ data, initialTab, onTabChange }: { data: PlayerMeResponse; /** A tab of the profile named by the address (`/player/profile/<tab>`). */ initialTab?: string | null; onTabChange?: (tab:string)=>void }) {
  return <CanonicalPremiumPlayerProfile playerId={data.player.id} mode="self" selfPlayerId={data.player.id} learning={<PlayerLearningBlock />} initialTab={initialTab} onTabChange={onTabChange} />;
}
