import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckSquare,
  Clock3,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, OrganizerTask, Player, GameEvening } from '../../lib/api.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';

interface TasksCRMProps {
  players: Player[];
  evenings: GameEvening[];
  onOpenPlayer: (id: string) => void;
}

type FilterMode = 'all' | 'today' | 'overdue' | 'done';

const FILTERS: Array<{ id: FilterMode; label: string }> = [
  { id: 'today', label: 'На сегодня' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'all', label: 'Все активные' },
  { id: 'done', label: 'Выполненные' },
];

const fmtDue = (value?: string | null) => {
  if (!value) return 'Без срока';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без срока';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const priorityLabel = (priority: OrganizerTask['priority']) =>
  priority === 'high' ? 'Высокий' : priority === 'low' ? 'Низкий' : 'Средний';

export const TasksCRM: React.FC<TasksCRMProps> = ({ players, evenings, onOpenPlayer }) => {
  const [tasks, setTasks] = useState<OrganizerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('today');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<OrganizerTask['type']>('call');
  const [priority, setPriority] = useState<OrganizerTask['priority']>('medium');
  const [playerId, setPlayerId] = useState('');
  const [eveningId, setEveningId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizerTask | null>(null);

  useEffect(() => {
    void loadTasks();
  }, [filterMode]);

  const loadTasks = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string | boolean> = {};
      if (filterMode === 'all') params.active = true;
      if (filterMode === 'today') {
        params.today = true;
        params.active = true;
      }
      if (filterMode === 'overdue') params.overdue = true;
      if (filterMode === 'done') params.status = 'done';
      setTasks(await api.getTasks(params));
    } catch (err: any) {
      setLoadError(err.message || 'Не удалось загрузить задачи');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDone = async (task: OrganizerTask) => {
    setBusyTaskId(task.id);
    try {
      await api.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
      await loadTasks();
    } catch (err: any) {
      setLoadError(err.message || 'Не удалось изменить статус задачи');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    setBusyTaskId(deleteTarget.id);
    try {
      await api.deleteTask(deleteTarget.id);
      setDeleteTarget(null);
      await loadTasks();
    } catch (err: any) {
      setLoadError(err.message || 'Не удалось удалить задачу');
      setDeleteTarget(null);
    } finally {
      setBusyTaskId(null);
    }
  };

  const resetCreateForm = () => {
    setTitle('');
    setDescription('');
    setType('call');
    setPriority('medium');
    setPlayerId('');
    setEveningId('');
    setDueAt('');
    setFormError(null);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.createTask({
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        player_id: playerId || null,
        evening_id: eveningId || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      });
      setShowCreateModal(false);
      resetCreateForm();
      await loadTasks();
    } catch (err: any) {
      setFormError(err.message || 'Не удалось создать задачу');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-text-primary">Задачи</h2>
            <p className="mt-1 text-[12px] leading-5 text-text-secondary">Текущая работа организатора без завершённых задач в активных списках.</p>
          </div>
          <button
            type="button"
            onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
            className="min-h-[44px] shrink-0 rounded-[12px] bg-accent px-3.5 text-[13px] font-bold text-white inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden min-[360px]:inline">Новая</span>
          </button>
        </div>

        <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
          <div className="flex w-max min-w-full gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFilterMode(filter.id)}
                className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold transition ${
                  filterMode === filter.id
                    ? 'border-accent bg-accent-soft text-text-primary'
                    : 'border-border-soft bg-surface-2 text-text-secondary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loadError && (
        <div className="rounded-[16px] border border-danger/30 bg-danger-soft p-3.5 flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary">{loadError}</p>
            <button type="button" onClick={() => void loadTasks()} className="mt-2 min-h-[40px] text-[12px] font-bold text-danger inline-flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4" /> Повторить
            </button>
          </div>
        </div>
      )}

      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-3 sm:p-4">
        {loading ? (
          <div className="py-14 text-center text-[13px] text-text-secondary">Загрузка задач…</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center">
            <Check className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 text-[14px] font-semibold text-text-primary">Здесь пока нет задач</p>
            <p className="mt-1 text-[12px] text-text-secondary">
              {filterMode === 'done' ? 'Выполненные задачи появятся здесь.' : 'Можно создать новую задачу или выбрать другой фильтр.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const done = task.status === 'done';
              const busy = busyTaskId === task.id;
              return (
                <article
                  key={task.id}
                  className={`rounded-[16px] border border-border-soft bg-surface-2 p-3.5 transition ${done ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      aria-label={done ? 'Вернуть задачу в работу' : 'Отметить задачу выполненной'}
                      disabled={busy}
                      onClick={() => void handleToggleDone(task)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                    >
                      {done ? <CheckSquare className="h-6 w-6 text-success" /> : <Square className="h-6 w-6" />}
                    </button>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <h3 className={`text-[14px] font-semibold leading-5 text-text-primary break-words ${done ? 'line-through' : ''}`}>{task.title}</h3>
                      {task.description && <p className="mt-1 text-[12px] leading-5 text-text-secondary break-words">{task.description}</p>}

                      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-text-secondary">
                        {task.player_nickname && (
                          <button
                            type="button"
                            onClick={() => task.player_id && onOpenPlayer(task.player_id)}
                            className="min-h-[32px] inline-flex items-center gap-1 font-semibold text-accent"
                          >
                            <UserRound className="h-3.5 w-3.5" /> {task.player_nickname}
                          </button>
                        )}
                        {task.evening_title && <span className="inline-flex min-h-[32px] items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {task.evening_title}</span>}
                        <span className={`inline-flex min-h-[32px] items-center gap-1 ${task.due_at ? 'text-text-secondary' : 'text-text-muted'}`}>
                          <Clock3 className="h-3.5 w-3.5" /> {fmtDue(task.due_at)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="Удалить задачу"
                      disabled={busy}
                      onClick={() => setDeleteTarget(task)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft text-text-muted hover:border-danger/30 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      task.priority === 'high' ? 'bg-danger-soft text-danger' : 'bg-surface-1 text-text-muted'
                    }`}>
                      Приоритет: {priorityLabel(task.priority)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <MobileSheet
        open={showCreateModal}
        onClose={() => { if (!saving) { setShowCreateModal(false); resetCreateForm(); } }}
        title="Новая задача"
        subtitle="Срок можно не указывать — тогда задача останется без даты."
        widthClass="sm:max-w-lg"
        footer={
          <button
            form="create-task-form"
            type="submit"
            disabled={saving || !title.trim()}
            className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Создать задачу'}
          </button>
        }
      >
        <form id="create-task-form" onSubmit={handleCreateTask} className="space-y-4">
          {formError && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{formError}</div>}

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Название *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Например, позвонить игроку" className="mobile-field" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Описание</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Что нужно сделать" className="mobile-field resize-none" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Тип задачи</span>
            <select value={type} onChange={(e) => setType(e.target.value as OrganizerTask['type'])} className="mobile-field">
              <option value="call">Звонок</option>
              <option value="invite">Приглашение</option>
              <option value="reminder">Напоминание</option>
              <option value="feedback">Обратная связь</option>
              <option value="preparation">Подготовка</option>
              <option value="payment">Оплата</option>
              <option value="other">Другое</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Игрок</span>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mobile-field">
              <option value="">Без игрока</option>
              {players.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Событие</span>
            <select value={eveningId} onChange={(e) => setEveningId(e.target.value)} className="mobile-field">
              <option value="">Без события</option>
              {evenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.title}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Срок</span>
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mobile-field" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Приоритет</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as OrganizerTask['priority'])} className="mobile-field">
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </label>
        </form>
      </MobileSheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить задачу?"
        description={deleteTarget ? `«${deleteTarget.title}» будет удалена без возможности восстановления.` : ''}
        confirmLabel="Удалить"
        tone="danger"
        busy={Boolean(deleteTarget && busyTaskId === deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteTask()}
      />
    </div>
  );
};
