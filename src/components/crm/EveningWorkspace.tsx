import React, { useEffect, useState } from 'react';
import { Gamepad2, LayoutDashboard, Sliders, Users } from 'lucide-react';
import { EveningOverviewView } from './EveningOverviewView.tsx';
import { EveningParticipantsView } from './EveningParticipantsView.tsx';
import { EveningTablesView } from './EveningTablesView.tsx';
import { EveningGamesView } from './EveningGamesView.tsx';
import EveningJourneyBar from './EveningJourneyBar.tsx';
import EveningOrganizerTasksPanel from './EveningOrganizerTasksPanel.tsx';
import EveningSlotPlannerCard from './EveningSlotPlannerCard.tsx';

export type EveningSection = 'overview' | 'participants' | 'tables' | 'games';

interface EveningWorkspaceProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
  initialSection?: EveningSection;
  onSectionChange?: (section: EveningSection) => void;
}

export const EveningWorkspace: React.FC<EveningWorkspaceProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
  initialSection = 'overview',
  onSectionChange,
}) => {
  const [section, setSection] = useState<EveningSection>(initialAddOpen ? 'participants' : initialSection);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);

  useEffect(() => {
    setSection(initialAddOpen ? 'participants' : initialSection);
  }, [eveningId, initialAddOpen, initialSection]);

  const openSection = (next: EveningSection) => {
    setSection(next);
    onSectionChange?.(next);
  };

  const tabs: Array<{ id: EveningSection; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Обзор', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'participants', label: 'Состав', icon: <Users className="h-4 w-4" /> },
    { id: 'tables', label: 'Столы', icon: <Sliders className="h-4 w-4" /> },
    { id: 'games', label: 'Игры', icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-3">
      <EveningJourneyBar eveningId={eveningId} onOpenSection={openSection} />

      <div className="sticky top-0 z-30 -mx-1 bg-app-bg/92 px-1 py-1 backdrop-blur-xl sm:top-[60px]">
        <div className="grid grid-cols-4 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
          {tabs.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openSection(tab.id)}
                className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1 rounded-[10px] px-1 text-[10px] font-bold transition-colors sm:text-[12px] ${active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'overview' ? <EveningOrganizerTasksPanel eveningId={eveningId} /> : null}
      {section === 'overview' ? <EveningSlotPlannerCard key={`${eveningId}-${slotRefreshKey}`} eveningId={eveningId} onRefresh={() => setSlotRefreshKey((value) => value + 1)} /> : null}

      {section === 'overview' ? (
        <EveningOverviewView eveningId={eveningId} onBack={onBack} onOpenSection={openSection} />
      ) : null}
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
