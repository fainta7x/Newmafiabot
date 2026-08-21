import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Gamepad2, Megaphone, Users } from 'lucide-react';
import { EveningOverviewView } from './EveningOverviewView.tsx';
import { EveningParticipantsView } from './EveningParticipantsView.tsx';
import { EveningGamesView } from './EveningGamesView.tsx';
import { EveningManagementView } from './EveningManagementView.tsx';

export type EveningSection = 'overview' | 'participants' | 'games' | 'management' | 'tables';

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
  const [section, setSection] = useState<EveningSection>(initialAddOpen ? 'management' : initialSection);

  useEffect(() => {
    setSection(initialAddOpen ? 'management' : initialSection);
  }, [eveningId, initialAddOpen, initialSection]);

  const openSection = (next: EveningSection) => {
    setSection(next);
    onSectionChange?.(next);
  };

  const tabs: Array<{ id: EveningSection; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Вечер', icon: <Megaphone className="h-4 w-4" /> },
    { id: 'participants', label: 'Кого пригласил', icon: <Users className="h-4 w-4" /> },
    { id: 'management', label: 'Сам вечер', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'games', label: 'Игры', icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-1 bg-app-bg/92 px-1 py-1 backdrop-blur-xl sm:top-[60px]">
        <div className="grid grid-cols-4 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
          {tabs.map((tab) => {
            const active = section === tab.id || (tab.id === 'management' && section === 'tables');
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

      {section === 'overview' ? <EveningOverviewView eveningId={eveningId} onBack={onBack} onOpenSection={openSection} /> : null}
      {section === 'participants' ? <EveningParticipantsView eveningId={eveningId} onBack={onBack} onOpenPlayerCard={onOpenPlayerCard} initialAddOpen={false} onInitialAddHandled={onInitialAddHandled} /> : null}
      {section === 'management' || section === 'tables' ? <EveningManagementView eveningId={eveningId} onBack={onBack} onOpenPlayerCard={onOpenPlayerCard} initialAddOpen={initialAddOpen} onInitialAddHandled={onInitialAddHandled} /> : null}
      {section === 'games' ? <EveningGamesView eveningId={eveningId} onBack={onBack} /> : null}
    </div>
  );
};
