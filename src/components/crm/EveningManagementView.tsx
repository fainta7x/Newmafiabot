import React, { useEffect, useState } from 'react';
import { CircleDollarSign, ListTodo, Table2, UsersRound, WalletCards } from 'lucide-react';
import EveningActiveRosterView from './EveningActiveRosterView.tsx';
import EveningStaffCard from './EveningStaffCard.tsx';
import EveningPaymentsPanel from './EveningPaymentsPanel.tsx';
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

type OperationsPane = 'work' | 'roster' | 'payments' | 'tasks' | 'tables' | 'closeout';
type VisiblePane = Exclude<OperationsPane, 'work'>;

const panes: Array<{ id: VisiblePane; label: string; icon: React.ReactNode }> = [
  { id: 'roster', label: 'Состав', icon: <UsersRound className="h-4 w-4" /> },
  { id: 'payments', label: 'Оплата', icon: <CircleDollarSign className="h-4 w-4" /> },
  { id: 'tasks', label: 'Задачи', icon: <ListTodo className="h-4 w-4" /> },
  { id: 'tables', label: 'Столы', icon: <Table2 className="h-4 w-4" /> },
  { id: 'closeout', label: 'Закрыть', icon: <WalletCards className="h-4 w-4" /> },
];

const normalizePane = (pane?: OperationsPane): VisiblePane => pane && pane !== 'work' ? pane : 'roster';

export const EveningManagementView: React.FC<EveningManagementViewProps> = ({
  eveningId,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
  initialPane,
}) => {
  const [pane, setPane] = useState<VisiblePane>(initialAddOpen ? 'roster' : normalizePane(initialPane));
  const [openRosterAdd, setOpenRosterAdd] = useState(initialAddOpen);

  useEffect(() => {
    if (initialAddOpen) {
      setPane('roster');
      setOpenRosterAdd(true);
      return;
    }
    setPane(normalizePane(initialPane));
  }, [initialAddOpen, initialPane, eveningId]);

  return (
    <div className="space-y-3">
      <nav aria-label="Рабочие разделы вечера" className="grid grid-cols-5 gap-1">
        {panes.map((item) => {
          const active = item.id === pane;
          return <button
            key={item.id}
            type="button"
            onClick={() => setPane(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[11px] border px-1 text-center transition-colors sm:min-h-[46px] sm:flex-row sm:gap-1.5 sm:px-2 ${active ? 'border-white/20 bg-white text-black' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
          >
            {item.icon}
            <span className="max-w-full truncate text-[9px] font-black sm:text-[11px]">{item.label}</span>
          </button>;
        })}
      </nav>

      <details className="rounded-[12px] border border-border-soft bg-surface-1">
        <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-[12px] font-semibold text-text-secondary">Команда вечера</summary>
        <EveningStaffCard eveningId={eveningId} />
      </details>

      {pane === 'roster' ? <EveningActiveRosterView
        eveningId={eveningId}
        initialAddOpen={initialAddOpen || openRosterAdd}
        onInitialAddHandled={() => { setOpenRosterAdd(false); onInitialAddHandled?.(); }}
        onOpenPlayerCard={onOpenPlayerCard}
      /> : null}

      {pane === 'payments' ? <EveningPaymentsPanel eveningId={eveningId} /> : null}
      {pane === 'tasks' ? <EveningOrganizerTasksPanel eveningId={eveningId} /> : null}
      {pane === 'tables' ? <EveningTablesView eveningId={eveningId} onBack={() => setPane('roster')} /> : null}
      {pane === 'closeout' ? <EveningCloseoutPanel eveningId={eveningId} /> : null}
    </div>
  );
};

export default EveningManagementView;