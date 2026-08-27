import React, { useEffect, useState } from 'react';
import { ChevronDown, ClipboardCheck, ListTodo, Table2, UsersRound, WalletCards } from 'lucide-react';
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
  const [toolsOpen, setToolsOpen] = useState(initialAddOpen || Boolean(initialPane && initialPane !== 'work'));

  useEffect(() => {
    if (initialAddOpen) { setPane('roster'); setOpenRosterAdd(true); setToolsOpen(true); return; }
    setPane(initialPane || 'work');
    setToolsOpen(Boolean(initialPane && initialPane !== 'work'));
  }, [initialAddOpen, initialPane, eveningId]);

  const current = panes.find((item) => item.id === pane) || panes[0];

  return (
    <div className="space-y-4">
      <section className="rounded-[16px] border border-border-soft bg-surface-1 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ClipboardCheck className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-accent">Сам вечер</span><h2 className="truncate text-[15px] font-black text-text-primary">{pane === 'work' ? 'Действия на месте' : current.label}</h2></div>
            <p className="mt-0.5 text-[10px] leading-4 text-text-secondary">{pane === 'work' ? 'Отметь приход и оплату. В списке остаются только люди, по которым нужно действие.' : 'Вернуться к текущим действиям можно одним нажатием.'}</p>
          </div>
        </div>
      </section>

      {pane === 'work' ? <div className="rounded-[15px] border border-accent/20 bg-accent-soft/30 px-3 py-2.5 text-[11px] leading-4 text-text-secondary">Состав, столы, задачи и финальное закрытие нужны реже — они собраны ниже и не мешают отмечать людей на входе.</div> : null}

      <section className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-1">
        <button type="button" onClick={() => setToolsOpen((value) => !value)} aria-expanded={toolsOpen} className="flex min-h-[48px] w-full items-center gap-2 px-3 text-left">
          <span className="min-w-0 flex-1"><strong className="block text-[12px] text-text-primary">Настроить и завершить вечер</strong><span className="mt-0.5 block text-[10px] text-text-muted">Состав, столы, задачи и финальная сверка</span></span>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
        </button>
      {toolsOpen ? <nav aria-label="Настройки и завершение вечера" className="grid grid-cols-6 gap-1.5 border-t border-border-soft p-2">
        {panes.filter((item) => item.id !== 'work').map((item, index) => {
          const active = item.id === pane;
          return <button
            key={item.id}
            type="button"
            onClick={() => setPane(item.id)}
            className={`col-span-3 flex min-h-[46px] items-center justify-center gap-1.5 rounded-[12px] border px-2 text-center transition-colors ${index > 1 ? 'col-span-6' : ''} ${active ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2 text-text-secondary'}`}
          >
            {item.icon}
            <span className="text-[11px] font-black">{item.label}</span>
          </button>;
        })}
      </nav> : null}
      </section>

      {pane !== 'work' ? <button type="button" onClick={() => setPane('work')} className="min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-1 px-3 text-[11px] font-bold text-text-secondary">← Вернуться к явке и оплате</button> : null}

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
