import React, { useState } from 'react';
import type { GameEvening } from '../../lib/api.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { PlayerRolesAdminCRM } from './PlayerRolesAdminCRM.tsx';
import { PlayersCRM } from './PlayersCRM.tsx';
import { RatingPeriodsCRM } from './RatingPeriodsCRM.tsx';

type PlayerHubTab = 'profiles' | 'access' | 'rating';

interface PlayersHubCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
  onCrmChanged?: () => void;
}

export const PlayersHubCRM: React.FC<PlayersHubCRMProps> = ({
  evenings,
  onOpenEvening,
  selectedPlayerId,
  onClosePlayerCard,
  onCrmChanged,
}) => {
  const [tab, setTab] = useState<PlayerHubTab>('profiles');

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <SegmentedControl
        ariaLabel="Раздел игроков"
        value={tab}
        items={[
          { value: 'profiles', label: 'Игроки' },
          { value: 'access', label: 'Доступы' },
          { value: 'rating', label: 'Рейтинг' },
        ]}
        onValueChange={(value) => setTab(value)}
      />

      {tab === 'profiles' ? (
        <PlayersCRM
          evenings={evenings}
          onOpenEvening={onOpenEvening}
          selectedPlayerId={selectedPlayerId}
          onClosePlayerCard={onClosePlayerCard}
          onCrmChanged={onCrmChanged}
        />
      ) : null}

      {tab === 'access' ? <PlayerRolesAdminCRM /> : null}
      {tab === 'rating' ? <RatingPeriodsCRM /> : null}
    </div>
  );
};

export default PlayersHubCRM;
