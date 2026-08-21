import React, { useEffect, useState } from 'react';
import { ClipboardCheck, ListTodo, Table2, UsersRound, WalletCards } from 'lucide-react';
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
  initialPane?: OperationsPane;
}

type OperationsPane = 'work' | 'roster' | 'tasks' | 'tables' | 'closeout';

const panes: Array<{ id: OperationsPane; label: string; icon: React.ReactNode; hint: string }> = [
  { id: 'work', label: 'Сейчас', icon: <ClipboardCheck className="h-4 w-4" />, hint: 'явка и оплата' },
  { id: 'roster', label: 'Состав', icon: <UsersRound className="h-4 w-4" />, hint: 'гости и правки' },
  { id: 'tasks', label: 'Задачи', icon: <ListTodo className="h-4 w-4" />, hint: 'что не забыть' },
  { id: 'tables', label: 'Столы', icon: <Table2 className="h-4 w-4" />, hint: 'настройки' },
  { id: 'closeout', label: 'Закрыть', icon: <WalletCards className="h-4 w-4" />, hint: 'сверка вечера' },
];

export const EveningManagementView: React.FC<EveningManagementViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
  initialPane,
}) => {
  const [pane, setPane] = useState<OperationsPane>(initialAddOpen ? 'roster' : initialPane || 'work');
  const [openRosterAdd, setOpenRosterAdd] = useState(initialAddOpen);

  useEffect(() => {
    if (initialAddOpen) { setPane('roster'); setOpenRosterAdd(true); return; }
    setPane(initialPane || 'work');
  }, [initialAddOpen, initialPane, eveningId]);

  const current = panes.find((item) => item.id === pane) || panes[0];

  return (
    <div className="space-y-4">
      <section className="rounded-[16px] border border-border-soft bg-surface-1 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ClipboardCheck className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-accent">Сам вечер</span><h2 className="truncate text-[15px] font-black text-text-primary">{current.label}</h2></div>
            <p className="mt-0.5 truncate text-[10px] text-text-secondary">
              {pane === 'work' ? 'Явка и оплата — только те, по кому нужно действие.' : null}
              {pane === 'roster' ? 'Гости, ошибочные записи и ручные правки.' : null}
              {pane === 'tasks' ? 'Задачи организатора для этого вечера.' : null}
              {pane === 'tables' ? 'Настройки стола; игроков выберешь в конкретной игре.' : null}
              {pane === 'closeout' ? 'Финальная сверка явки, денег и игр.' : null}
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Рабочие разделы вечера" className="grid grid-cols-6 gap-1.5">
        {panes.map((item, index) => {
          const active = item.id === pane;
          return <button
            key={item.id}
            type="button"
            onClick={() => setPane(item.id)}
            className={`col-span-2 flex min-h-[46px] items-center justify-center gap-1.5 rounded-[12px] border px-2 text-center transition-colors ${index > 2 ? 'col-span-3' : ''} ${active ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
          >
            {item.icon}
            <span className="text-[11px] font-black">{item.label}</span>
          </button>;
        })}
      </nav>

      {pane === 'work' ? <EveningParticipantsWorkboard
        eveningId={eveningId}
        onBack={onBack}
        onAddPlayer={() => { setOpenRosterAdd(true); setPane('roster'); }}
        onOpenPlayerCard={onOpenPlayerCard}
        onChanged={() => undefined}
      /> : null}

      {pane === 'roster' ? <EveningParticipantsViewBase
        eveningId={eveningId}
        onBack={onBack}
        onOpenPlayerCard={onOpenPlayerCard}
        initialAddOpen={initialAddOpen || openRosterAdd}
        onInitialAddHandled={() => { setOpenRosterAdd(false); onInitialAddHandled?.(); }}
      /> : null}

      {pane === 'tasks' ? <EveningOrganizerTasksPanel eveningId={eveningId} /> : null}
      {pane === 'tables' ? <EveningTablesView eveningId={eveningId} onBack={onBack} /> : null}
      {pane === 'closeout' ? <EveningCloseoutPanel eveningId={eveningId} /> : null}
    </div>
  );
};

export default EveningManagementView;
