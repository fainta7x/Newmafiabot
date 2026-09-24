import React, { useEffect, useState } from 'react';
import { ListTodo, MoreHorizontal, Table2, X } from 'lucide-react';
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
  onEveningChanged?: () => void;
}

type OperationsPane = 'work' | 'roster' | 'payments' | 'tasks' | 'tables' | 'closeout';
type VisiblePane = Exclude<OperationsPane, 'work'>;
type PrimaryPane = Extract<VisiblePane, 'roster' | 'payments' | 'closeout'>;
type SecondaryPane = Extract<VisiblePane, 'tasks' | 'tables'>;

// Closing the evening is part of the main flow (roster → payments → closeout);
// tasks and tables are occasional tools behind «Ещё».
const primaryPanes: Array<{ id: PrimaryPane; label: string }> = [
  { id: 'roster', label: 'Состав' },
  { id: 'payments', label: 'Оплата' },
  { id: 'closeout', label: 'Закрытие' },
];

const secondaryPanes: Array<{ id: SecondaryPane; label: string; icon: React.ReactNode }> = [
  { id: 'tasks', label: 'Задачи', icon: <ListTodo className="h-4 w-4" /> },
  { id: 'tables', label: 'Столы', icon: <Table2 className="h-4 w-4" /> },
];

const normalizePane = (pane?: OperationsPane): VisiblePane => pane && pane !== 'work' ? pane : 'roster';

export const EveningManagementView: React.FC<EveningManagementViewProps> = ({
  eveningId,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
  initialPane,
  onEveningChanged,
}) => {
  const [pane, setPane] = useState<VisiblePane>(initialAddOpen ? 'roster' : normalizePane(initialPane));
  const [openRosterAdd, setOpenRosterAdd] = useState(initialAddOpen);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (initialAddOpen) {
      setPane('roster');
      setOpenRosterAdd(true);
      setMoreOpen(false);
      return;
    }
    setPane(normalizePane(initialPane));
    setMoreOpen(false);
  }, [initialAddOpen, initialPane, eveningId]);

  const openPane = (next: VisiblePane) => {
    setPane(next);
    setMoreOpen(false);
  };

  const secondaryActive = pane === 'tasks' || pane === 'tables';

  return (
    <div className="space-y-3">
      <nav aria-label="Рабочие разделы вечера" className="rounded-[14px] border border-border-soft bg-surface-1 p-1">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
          {primaryPanes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openPane(item.id)}
              aria-current={pane === item.id ? 'page' : undefined}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[10px] px-1.5 text-[14px] font-semibold ${pane === item.id ? 'bg-white text-black' : 'text-text-secondary'}`}
            >
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-label="Ещё"
            aria-current={secondaryActive ? 'page' : undefined}
            className={`grid min-h-11 w-11 place-items-center rounded-[10px] ${secondaryActive ? 'bg-white text-black' : 'text-text-secondary'}`}
          >
            {moreOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </div>
        {moreOpen ? (
          <div className="mt-1 grid grid-cols-2 gap-1 border-t border-border-soft pt-1" data-testid="evening-secondary-panes">
            {secondaryPanes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openPane(item.id)}
                aria-current={pane === item.id ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center gap-1 rounded-[9px] px-1 text-[13px] font-semibold ${pane === item.id ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}
              >
                {item.icon}<span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </nav>

      <details className="rounded-[12px] border border-border-soft bg-surface-1">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-[13px] font-semibold text-text-secondary">Команда вечера</summary>
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
      {pane === 'closeout' ? <EveningCloseoutPanel eveningId={eveningId} onSettled={onEveningChanged} /> : null}
    </div>
  );
};

export default EveningManagementView;