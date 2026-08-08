import React, { useEffect, useState } from 'react';
import { Plus, ArrowRight, X, Calendar, Trophy } from 'lucide-react';
import { api, GameEvening } from '../../lib/api.ts';
import { TournamentsList } from './tournaments/TournamentsList.tsx';
import { TournamentDetailView } from './tournaments/TournamentDetailView.tsx';

interface EveningsListProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onCreateEvening: (data: Partial<GameEvening>) => Promise<void>;
  initialCreateOpen?: boolean;
  onInitialCreateHandled?: () => void;
}

export const EveningsList: React.FC<EveningsListProps> = ({
  evenings,
  onOpenEvening,
  onCreateEvening,
  initialCreateOpen = false,
  onInitialCreateHandled,
}) => {
  const [subTab, setSubTab] = useState<'evenings' | 'tournaments'>('evenings');
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [format, setFormat] = useState<'NOVICE' | 'STANDARD' | 'TOURNAMENT'>('STANDARD');
  const [defaultPrice, setDefaultPrice] = useState(400);
  const [venue, setVenue] = useState('Зал #1 (Главный)');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialCreateOpen) return;
    setSubTab('evenings');
    setActiveTournamentId(null);
    setShowCreateModal(true);
    onInitialCreateHandled?.();
  }, [initialCreateOpen, onInitialCreateHandled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startsAt) return;

    setSaving(true);
    try {
      await onCreateEvening({
        title,
        starts_at: new Date(startsAt).toISOString(),
        format,
        default_price: defaultPrice,
        venue,
        notes,
        status: 'published',
      });
      setShowCreateModal(false);
      setTitle('');
      setStartsAt('');
      setNotes('');
    } catch (err: any) {
      alert(err.message || 'Ошибка создания вечера');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-tab Switcher Bar */}
      <div className="flex items-center gap-1.5 bg-surface-1 p-1 rounded-2xl border border-border-soft w-full sm:w-auto self-start text-xs font-bold">
        <button
          onClick={() => {
            setSubTab('evenings');
            setActiveTournamentId(null);
          }}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'evenings'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Игровые вечера</span>
        </button>

        <button
          onClick={() => {
            setSubTab('tournaments');
          }}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'tournaments'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Турниры</span>
        </button>
      </div>

      {subTab === 'tournaments' ? (
        activeTournamentId ? (
          <TournamentDetailView
            tournamentId={activeTournamentId}
            onBack={() => setActiveTournamentId(null)}
          />
        ) : (
          <TournamentsList onOpenTournament={(id) => setActiveTournamentId(id)} />
        )
      ) : (
        <>
          {/* Header with Create Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-1 border border-border-soft p-5 rounded-3xl">
            <div>
              <h2 className="text-xl font-black text-text-primary uppercase tracking-tight">Игровые Вечера Клуба</h2>
              <p className="text-xs text-text-secondary mt-0.5">Управление мероприятиями, записями игроков и финансовым расчётом</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={async () => {
                  try {
                    const res = await api.createNextFriday();
                    alert(`Создан вечер на следующую пятницу (${new Date(res.starts_at).toLocaleDateString('ru-RU')})!`);
                    onOpenEvening(res.id);
                  } catch (err: any) {
                    alert(err.message || 'Ошибка создания вечера на пятницу');
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Следующая пятница</span>
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-accent/20"
              >
                <Plus className="w-4 h-4" />
                <span>Новый Вечер</span>
              </button>
            </div>
          </div>

          {/* Evenings Grid / Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {evenings.map((e) => {
              const isCompleted = e.status === 'completed' || !!e.settled_at;
              const isActive = e.status === 'active';

              return (
                <div
                  key={e.id}
                  className={`bg-surface-1 border rounded-3xl p-5 space-y-4 flex flex-col justify-between transition-all hover:border-accent/40 relative overflow-hidden ${
                    isActive
                      ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                      : isCompleted
                      ? 'border-border-soft opacity-90'
                      : 'border-border-soft'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse'
                          : isCompleted
                          ? 'bg-surface-2 text-text-muted border-border-soft'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {isActive ? 'Идёт сейчас' : isCompleted ? 'Рассчитан и закрыт' : 'Запланирован'}
                      </span>

                      <span className="text-[11px] font-mono text-text-secondary font-bold uppercase">
                        {e.format}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-text-primary leading-snug">{e.title}</h3>
                      <p className="text-xs text-text-secondary mt-1">
                        📅 {new Date(e.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      {e.venue && <p className="text-[11px] text-text-secondary">📍 {e.venue}</p>}
                    </div>

                    {/* Numbers Row */}
                    <div className="grid grid-cols-3 gap-2 bg-surface-2 p-2.5 rounded-2xl border border-border-soft text-center font-mono">
                      <div>
                        <span className="text-[9px] text-text-muted uppercase font-bold block">Идут</span>
                        <span className="text-sm font-bold text-text-primary">{e.registered_count || 0}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-text-muted uppercase font-bold block">Пришло</span>
                        <span className="text-sm font-bold text-emerald-400">{e.attended_count || 0}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-text-muted uppercase font-bold block">Выручка</span>
                        <span className="text-sm font-bold text-amber-400">{e.total_revenue || 0} ₽</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenEvening(e.id)}
                    className="w-full bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <span>Управление вечера</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Create Evening Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 relative text-white">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-black uppercase tracking-tight">Запланировать новый вечер</h3>
              <p className="text-xs text-slate-400">Создание нового игрового мероприятия для клуба</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Название вечера</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Пятничный мафия-вечер (07.08.2026)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Дата и время начала</label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Формат</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="STANDARD">STANDARD (Классика)</option>
                    <option value="NOVICE">NOVICE (Для новичков)</option>
                    <option value="TOURNAMENT">TOURNAMENT (Турнир)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Цена по умолч. (₽)</label>
                  <input
                    type="number"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Локация</label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Заметки / Описание</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Сбор гостей в 19:00, старт первой игры в 19:30"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  {saving ? 'Сохранение...' : 'Запланировать вечер'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
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
