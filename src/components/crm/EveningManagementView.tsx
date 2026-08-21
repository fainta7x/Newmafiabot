import React, { useState } from 'react';
import { Settings, Sliders } from 'lucide-react';
import { EveningTablesView } from './EveningTablesView.tsx';
import EveningOrganizerTasksPanel from './EveningOrganizerTasksPanel.tsx';
import EveningSlotPlannerCard from './EveningSlotPlannerCard.tsx';
import EveningCloseoutPanel from './EveningCloseoutPanel.tsx';

interface EveningManagementViewProps {
  eveningId: string;
  onBack: () => void;
}

export const EveningManagementView: React.FC<EveningManagementViewProps> = ({ eveningId, onBack }) => {
  const [showSlots, setShowSlots] = useState(false);

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent" />
          <div>
            <h2 className="text-[16px] font-black text-text-primary">Управление вечером</h2>
            <p className="text-[11px] text-text-secondary">Служебные действия и редкие настройки.</p>
          </div>
        </div>
      </section>

      <EveningOrganizerTasksPanel eveningId={eveningId} />

      <button
        type="button"
        onClick={() => setShowSlots((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-border-soft bg-surface-1 p-3 text-left"
      >
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent-soft text-accent"><Sliders className="h-4 w-4" /></span>
        <span className="flex-1"><strong className="block text-[12px] text-text-primary">Игровые слоты</strong><span className="text-[10px] text-text-muted">Расписание и загрузка игр</span></span>
        <span className="text-[11px] font-bold text-accent">{showSlots ? 'Скрыть' : 'Открыть'}</span>
      </button>

      {showSlots ? <EveningSlotPlannerCard eveningId={eveningId} onRefresh={() => undefined} /> : null}

      <EveningTablesView eveningId={eveningId} onBack={onBack} />

      <EveningCloseoutPanel eveningId={eveningId} />
    </div>
  );
};

export default EveningManagementView;
