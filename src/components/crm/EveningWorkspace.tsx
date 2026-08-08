import React, { useState } from 'react';
import { Gamepad2, Sliders, Users } from 'lucide-react';
import { EveningParticipantsView } from './EveningParticipantsView.tsx';
import { EveningTablesView } from './EveningTablesView.tsx';
import { EveningGamesView } from './EveningGamesView.tsx';

interface EveningWorkspaceProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

type EveningSection = 'participants' | 'tables' | 'games';

export const EveningWorkspace: React.FC<EveningWorkspaceProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
}) => {
  const [section, setSection] = useState<EveningSection>('participants');

  const tabs: Array<{ id: EveningSection; label: string; icon: React.ReactNode }> = [
    { id: 'participants', label: 'Состав', icon: <Users className="h-4 w-4" /> },
    { id: 'tables', label: 'Столы', icon: <Sliders className="h-4 w-4" /> },
    { id: 'games', label: 'Игры', icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-1 px-1 py-1 bg-app-bg/92 backdrop-blur-xl sm:top-[60px]">
        <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
          {tabs.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-bold transition-colors ${active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'participants' ? (
        <EveningParticipantsView
          eveningId={eveningId}
          onBack={onBack}
          onOpenPlayerCard={onOpenPlayerCard}
          initialAddOpen={initialAddOpen}
          onInitialAddHandled={onInitialAddHandled}
        />
      ) : null}
      {section === 'tables' ? <EveningTablesView eveningId={eveningId} onBack={onBack} /> : null}
      {section === 'games' ? <EveningGamesView eveningId={eveningId} onBack={onBack} /> : null}
    </div>
  );
};
