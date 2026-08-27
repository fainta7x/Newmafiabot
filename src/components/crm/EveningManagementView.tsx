import React, { useEffect, useState } from 'react';
import { ListTodo, Table2, UsersRound, WalletCards } from 'lucide-react';
import EveningActiveRosterView from './EveningActiveRosterView.tsx';
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
type VisiblePane = Exclude<OperationsPane, 'work'>;

const panes: Array<{ id: VisiblePane; label: string; icon: React.ReactNode }> = [
  { id: 'roster', label: 'Состав', icon: <UsersRound className="h-4 w-4" /> },
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

  const current = panes.find((item) => item.id === pane) || panes[0];

  return (
    <div className="space-y-4">
      <section className="rounded-[16px] border border-border-soft bg-surface-1 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><UsersRound className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-accent">Сам вечер</span><h2 className="truncate text-[15px] font-black text-text-primary">{current.label}</h2></div>
            <p className="mt-0.5 truncate text-[10px] text-text-secondary">
              {pane === 'roster' ? 'Только подтверждённые участники и фактическая явка.' : null}
              {pane === 'tasks' ? 'Задачи организатора для этого вечера.' : null}
              {pane === 'tables' ? 'Настройки стола; игроков выбираешь в конкретной игре.' : null}
              {pane === 'closeout' ? 'Финальная сверка явки, денег и игр.' : null}
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Рабочие разделы вечера" className="grid grid-cols-2 gap-1.5">
        {panes.map((item) => {
          const active = item.id === pane;
          return <button
            key={item.id}
            type="button"
            onClick={() => setPane(item.id)}
            className={`flex min-h-[46px] items-center justify-center gap-1.5 rounded-[12px] border px-2 text-center transition-colors ${active ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
          >
            {item.icon}
            <span className="text-[11px] font-black">{item.label}</span>
          </button>;
        })}
      </nav>

      {pane === 'roster' ? <EveningActiveRosterView
        eveningId={eveningId}
        initialAddOpen={initialAddOpen || openRosterAdd}
        onInitialAddHandled={() => { setOpenRosterAdd(false); onInitialAddHandled?.(); }}
        onOpenPlayerCard={onOpenPlayerCard}
      /> : null}

      {pane === 'tasks' ? <EveningOrganizerTasksPanel eveningId={eveningId} /> : null}
      {pane === 'tables' ? <EveningTablesView eveningId={eveningId} onBack={() => setPane('roster')} /> : null}
      {pane === 'closeout' ? <EveningCloseoutPanel eveningId={eveningId} /> : null}
    </div>
  );
};

export default EveningManagementView;
