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
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ClipboardCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">Сам вечер</div>
            <h2 className="mt-0.5 text-[17px] font-black text-text-primary">{current.label}</h2>
            <p className="mt-1 text-[11px] leading-5 text-text-secondary">
              {pane === 'work' ? 'Отмечай приход и оплату. Вверху — только люди, по которым нужно действие.' : null}
              {pane === 'roster' ? 'Добавь внезапного гостя, убери ошибочную запись или исправь данные участника.' : null}
              {pane === 'tasks' ? 'Задачи организатора только для этого вечера.' : null}
              {pane === 'tables' ? 'Настройки стола. Игроков выбираешь уже при запуске конкретной игры.' : null}
              {pane === 'closeout' ? 'Финальная явка, долги и незавершённые игры перед закрытием вечера.' : null}
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Рабочие разделы вечера" className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
        <div className="flex w-max min-w-full gap-1.5">
          {panes.map((item) => {
            const active = item.id === pane;
            return <button
              key={item.id}
              type="button"
              onClick={() => setPane(item.id)}
              className={`flex min-h-[48px] min-w-[104px] items-center gap-2 rounded-[13px] border px-3 text-left transition-colors ${active ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
            >
              {item.icon}
              <span><strong className="block text-[11px] font-black">{item.label}</strong><span className={`block text-[8px] ${active ? 'text-white/75' : 'text-text-muted'}`}>{item.hint}</span></span>
            </button>;
          })}
        </div>
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
