import React, { useState } from 'react';
import { Gamepad2, Sliders, Users } from 'lucide-react';
import { EveningDetailView } from './EveningDetailView';
import { EveningGamesView } from './EveningGamesView';

interface EveningWorkspaceProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}

type EveningSection = 'participants' | 'tables' | 'games';

export const EveningWorkspace: React.FC<EveningWorkspaceProps> = ({ eveningId, onBack, onOpenPlayerCard }) => {
  const [section, setSection] = useState<EveningSection>('participants');

  const tabs: Array<{ id: EveningSection; label: string; icon: React.ReactNode }> = [
    { id: 'participants', label: 'Состав', icon: <Users className="w-4 h-4" /> },
    { id: 'tables', label: 'Столы', icon: <Sliders className="w-4 h-4" /> },
    { id: 'games', label: 'Игры', icon: <Gamepad2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-3">
      <div className="sticky top-[62px] z-30 px-1">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-800 bg-slate-950/95 p-1 shadow-xl backdrop-blur-xl">
          {tabs.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`min-h-[42px] rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-black transition-all ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'games' ? (
        <EveningGamesView eveningId={eveningId} onBack={onBack} />
      ) : (
        <EveningDetailView
          eveningId={eveningId}
          onBack={onBack}
          onOpenPlayerCard={onOpenPlayerCard}
          view={section}
        />
      )}
    </div>
  );
};
