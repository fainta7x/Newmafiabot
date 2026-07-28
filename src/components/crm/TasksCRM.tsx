import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  CheckSquare,
  Square,
  Trash2,
} from 'lucide-react';
import { api, OrganizerTask, Player, GameEvening } from '../../lib/api.ts';

interface TasksCRMProps {
  players: Player[];
  evenings: GameEvening[];
  onOpenPlayer: (id: string) => void;
}

export const TasksCRM: React.FC<TasksCRMProps> = ({ players, evenings, onOpenPlayer }) => {
  const [tasks, setTasks] = useState<OrganizerTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterMode, setFilterMode] = useState<'all' | 'today' | 'overdue' | 'done'>('today');

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<any>('call');
  const [priority, setPriority] = useState<any>('medium');
  const [playerId, setPlayerId] = useState<string>('');
  const [eveningId, setEveningId] = useState<string>('');
  const [dueAt, setDueAt] = useState<string>('');

  useEffect(() => {
    loadTasks();
  }, [filterMode]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (filterMode === 'today') params.today = true;
      if (filterMode === 'overdue') params.overdue = true;
      if (filterMode === 'done') params.status = 'done';

      const data = await api.getTasks(params);
      setTasks(data);
    } catch (err: any) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDone = async (task: OrganizerTask) => {
    try {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      await api.updateTask(task.id, { status: newStatus });
      loadTasks();
    } catch (err: any) {
      alert('Ошибка изменения статуса задачи');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Удалить эту задачу?')) return;
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      alert('Ошибка удаления');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      await api.createTask({
        title,
        description,
        type,
        priority,
        player_id: playerId || null,
        evening_id: eveningId || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : new Date().toISOString(),
      });
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setPlayerId('');
      setEveningId('');
      loadTasks();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания задачи');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Задачи Организатора</h2>
            <p className="text-xs text-slate-400 mt-0.5">Контроль звонков, напоминаний, сбора взносов и обратной связи</p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Новая Задача</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          <button
            onClick={() => setFilterMode('today')}
            className={`px-3.5 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              filterMode === 'today' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Задачи на Сегодня
          </button>
          <button
            onClick={() => setFilterMode('overdue')}
            className={`px-3.5 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              filterMode === 'overdue' ? 'bg-rose-600 text-white font-black' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Просроченные
          </button>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3.5 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              filterMode === 'all' ? 'bg-slate-700 text-white font-black' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Все активные
          </button>
          <button
            onClick={() => setFilterMode('done')}
            className={`px-3.5 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              filterMode === 'done' ? 'bg-emerald-600 text-white font-black' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Выполненные
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">Загрузка задач...</div>
        ) : tasks.length > 0 ? (
          tasks.map((t) => {
            const isDone = t.status === 'done';

            return (
              <div
                key={t.id}
                className={`p-4 bg-slate-950 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                  isDone ? 'border-slate-850 opacity-60' : 'border-slate-800 hover:border-amber-500/40'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={() => handleToggleDone(t)}
                    className="text-slate-400 hover:text-emerald-400 cursor-pointer shrink-0 mt-0.5"
                  >
                    {isDone ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5" />}
                  </button>

                  <div className="space-y-1 min-w-0">
                    <span className={`text-sm font-bold block ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                      {t.title}
                    </span>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      {t.player_nickname && (
                        <span
                          onClick={() => t.player_id && onOpenPlayer(t.player_id)}
                          className="text-rose-400 font-bold hover:underline cursor-pointer"
                        >
                          👤 {t.player_nickname}
                        </span>
                      )}

                      {t.evening_title && <span>📅 {t.evening_title}</span>}

                      {t.due_at && (
                        <span className="font-mono text-slate-500">
                          ⏱ {new Date(t.due_at).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    t.priority === 'high' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {t.priority}
                  </span>

                  <button
                    onClick={() => handleDeleteTask(t.id)}
                    className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs">В этом списке нет задач 👍</div>
        )}
      </div>

      {/* Modal: Create Task */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">Создать задачу организатора</h3>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Заголовок задачи *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Позвонить игроку / Подготовить столы"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Тип задачи</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="call">Звонок</option>
                    <option value="invite">Приглашение</option>
                    <option value="reminder">Напоминание</option>
                    <option value="feedback">Обратная связь</option>
                    <option value="preparation">Подготовка</option>
                    <option value="payment">Оплата</option>
                    <option value="other">Другое</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Связанный вечер</label>
                  <select
                    value={eveningId}
                    onChange={(e) => setEveningId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Без вечера --</option>
                    {evenings.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Приоритет</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Срок (Дата)</label>
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Связать с игроком</label>
                <select
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Не привязывать к игроку</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
