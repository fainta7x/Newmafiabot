import React, { useState } from 'react';
import { ClipboardCheck, UsersRound } from 'lucide-react';
import EveningParticipantsWorkboard from './EveningParticipantsWorkboard.tsx';
import EveningParticipantsViewBase from './EveningParticipantsViewBase.tsx';
import { EveningTablesView } from './EveningTablesView.tsx';
import EveningOrganizerTasksPanel from './EveningOrganizerTasksPanel.tsx';
import EveningCloseoutPanel from './EveningCloseoutPanel.tsx';

interface EveningManagementViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

export const EveningManagementView: React.FC<EveningManagementViewProps> = ({ eveningId, onBack, onOpenPlayerCard, initialAddOpen = false, onInitialAddHandled }) => {
  const [showRoster, setShowRoster] = useState(initialAddOpen);
  const [forceAddOpen, setForceAddOpen] = useState(initialAddOpen);

  const openRoster = (add = false) => {
    setShowRoster(true);
    setForceAddOpen(add);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ClipboardCheck className="h-5 w-5" /></span>
          <div><h2 className="text-[17px] font-black text-text-primary">Сам вечер</h2><p className="mt-1 text-[11px] leading-5 text-text-secondary">Отмечай, кто реально пришёл, фиксируй время и принимай оплату. Здесь же остаются задачи организатора и закрытие вечера.</p></div>
        </div>
      </section>

      <EveningParticipantsWorkboard
        eveningId={eveningId}
        onBack={onBack}
        onAddPlayer={() => openRoster(true)}
        onOpenPlayerCard={onOpenPlayerCard}
        onChanged={() => undefined}
      />

      <button type="button" onClick={() => openRoster(false)} className="flex min-h-[52px] w-full items-center gap-3 rounded-[16px] border border-border-soft bg-surface-1 px-3 text-left">
        <UsersRound className="h-5 w-5 text-accent" />
        <span><strong className="block text-[12px] text-text-primary">Полный состав и редкие правки</strong><span className="text-[10px] text-text-muted">Добавить гостя, изменить сумму или исправить данные игрока.</span></span>
      </button>

      {showRoster ? <EveningParticipantsViewBase
        eveningId={eveningId}
        onBack={onBack}
        onOpenPlayerCard={onOpenPlayerCard}
        initialAddOpen={forceAddOpen}
        onInitialAddHandled={() => {
          setForceAddOpen(false);
          onInitialAddHandled?.();
        }}
      /> : null}

      <EveningOrganizerTasksPanel eveningId={eveningId} />
      <EveningTablesView eveningId={eveningId} onBack={onBack} />
      <EveningCloseoutPanel eveningId={eveningId} />
    </div>
  );
};

export default EveningManagementView;
