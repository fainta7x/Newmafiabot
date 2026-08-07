import React, { useState } from 'react';
import { Gamepad2, Users } from 'lucide-react';
import { EveningDetailView } from './EveningDetailView';
import { EveningGamesView } from './EveningGamesView';

interface EveningWorkspaceProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}

export const EveningWorkspace: React.FC<EveningWorkspaceProps> = ({ eveningId, onBack, onOpenPlayerCard }) => {
  const [section, setSection] = useState<'management' | 'games'>('management');

  return (
    <div className="space-y-3">
      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-1.5 grid grid-cols-2 gap-1 sticky top-[62px] z-30 shadow-xl">
        <button
          type="button"
          onClick={() => setSection('management')}
          className={`min-h-[44px] rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${section === 'management' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
        >
          <Users className="w-4 h-4" />Участники и касса
        </button>
        <button
          type="button"
          onClick={() => setSection('games')}
          className={`min-h-[44px] rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${section === 'games' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
        >
          <Gamepad2 className="w-4 h-4" />Игры
        </button>
      </div>

      {section === 'management' ? (
        <EveningDetailView eveningId={eveningId} onBack={onBack} onOpenPlayerCard={onOpenPlayerCard} />
      ) : (
        <EveningGamesView eveningId={eveningId} onBack={onBack} />
      )}
    </div>
  );
};
