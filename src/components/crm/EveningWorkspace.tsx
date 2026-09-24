import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Gamepad2, Megaphone, Users } from 'lucide-react';
import EveningNextStepBanner from './EveningNextStepBanner.tsx';
import { EveningHeaderBar } from './EveningHeaderBar.tsx';
import { EveningOverviewView } from './EveningOverviewView.tsx';
import { EveningParticipantsView } from './EveningParticipantsView.tsx';
import { EveningGamesView } from './EveningGamesView.tsx';
import { EveningManagementView } from './EveningManagementView.tsx';

export type EveningSection = 'overview' | 'participants' | 'games' | 'management' | 'tables' | 'closeout';

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
  const [headerKey, setHeaderKey] = useState(0);
  const [eveningStatus, setEveningStatus] = useState<string | null>(null);
  // A running evening opens on its games, not on the announcement.
  const autoSectionFor = useRef<string | null>(null);

  useEffect(() => {
    setSection(initialAddOpen ? 'management' : initialSection);
  }, [eveningId, initialAddOpen, initialSection]);

  const openSection = (next: EveningSection) => {
    autoSectionFor.current = eveningId;
    setSection(next);
    onSectionChange?.(next);
  };

  const handleHeaderLoaded = (evening: { status: string }) => {
    setEveningStatus(evening.status);
    if (autoSectionFor.current === eveningId) return;
    autoSectionFor.current = eveningId;
    if (evening.status === 'active' && section === 'overview' && initialSection === 'overview' && !initialAddOpen) openSection('games');
  };

  const tabs: Array<{ id: EveningSection; label: string; mobileLabel: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Анонс', mobileLabel: 'Анонс', icon: <Megaphone className="h-4 w-4" /> },
    { id: 'participants', label: 'Ответы', mobileLabel: 'Ответы', icon: <Users className="h-4 w-4" /> },
    { id: 'management', label: 'Вечер', mobileLabel: 'Вечер', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'games', label: 'Игры', mobileLabel: 'Игры', icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-3">
      <EveningHeaderBar eveningId={eveningId} refreshKey={headerKey} onBack={onBack} onLoaded={handleHeaderLoaded} />
      <div className="sticky top-0 z-30 -mx-1 bg-app-bg/92 px-1 py-1 backdrop-blur-xl sm:top-[60px]">
        <div className="grid grid-cols-4 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
          {tabs.map((tab) => {
            const active = section === tab.id || (tab.id === 'management' && (section === 'tables' || section === 'closeout'));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openSection(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 text-[13px] font-semibold leading-tight transition-colors sm:flex-row sm:gap-1.5 sm:text-[14px] ${active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
              >
                {tab.icon}
                <span className="truncate sm:hidden">{tab.mobileLabel}</span><span className="hidden truncate sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section !== 'closeout' ? <EveningNextStepBanner eveningId={eveningId} status={eveningStatus} refreshKey={headerKey} onOpenCloseout={() => openSection('closeout')} /> : null}
      {section === 'overview' ? <EveningOverviewView eveningId={eveningId} onStatusChange={() => setHeaderKey((key) => key + 1)} /> : null}
      {section === 'participants' ? <EveningParticipantsView eveningId={eveningId} onBack={onBack} onOpenPlayerCard={onOpenPlayerCard} initialAddOpen={false} onInitialAddHandled={onInitialAddHandled} /> : null}
      {section === 'management' || section === 'tables' || section === 'closeout' ? <EveningManagementView eveningId={eveningId} onBack={onBack} onOpenPlayerCard={onOpenPlayerCard} initialAddOpen={initialAddOpen} onInitialAddHandled={onInitialAddHandled} initialPane={section === 'tables' || section === 'closeout' ? section : undefined} onEveningChanged={() => setHeaderKey((key) => key + 1)} /> : null}
      {section === 'games' ? <EveningGamesView eveningId={eveningId} /> : null}
    </div>
  );
};