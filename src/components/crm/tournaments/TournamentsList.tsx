import React, { useState, useEffect } from 'react';
import { Trophy, Plus, ArrowRight, Calendar, MapPin, UserCheck } from 'lucide-react';
import { api, Tournament } from '../../../lib/api.ts';
import { CreateTournamentModal } from './CreateTournamentModal.tsx';

interface TournamentsListProps {
  onOpenTournament: (id: string) => void;
}

export const TournamentsList: React.FC<TournamentsListProps> = ({ onOpenTournament }) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      const data = await api.getTournaments();
      setTournaments(data);
    } catch (err: any) {
      console.error('Error loading tournaments list:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-1 border border-border-soft p-5 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-accent/15 border border-accent/30 rounded-2xl flex items-center justify-center text-accent shrink-0">
            <Trophy className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-primary uppercase tracking-tight">Личные Турниры Клуба</h2>
            <p className="text-xs text-text-secondary mt-0.5">Формат: 10 игроков, 10 игр, полное участие каждого игрока</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-accent hover:bg-accent-hover text-white font-bold px-5 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-accent/20 shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Новый Турнир</span>
        </button>
      </div>

      {/* Tournaments Grid */}
      {loading ? (
        <div className="py-16 text-center text-text-muted text-xs">Загрузка списка турниров...</div>
      ) : tournaments.length === 0 ? (
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-10 text-center space-y-4">
          <Trophy className="w-12 h-12 text-text-muted mx-auto opacity-50" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">Турниры ещё не созданы</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Создайте первый личный турнир на 10 участников. Система автоматически сгенерирует 10 игр и случайную рассадку.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-accent hover:bg-accent-hover text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Создать Турнир</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => {
            const isActive = t.status === 'active';
            const isCompleted = t.status === 'completed';
            const completedGames = t.completed_games_count || 0;
            const totalGames = t.total_games_count || 10;

            return (
              <div
                key={t.id}
                className={`bg-surface-1 border rounded-3xl p-5 space-y-4 flex flex-col justify-between transition-all hover:border-accent/40 relative overflow-hidden ${
                  isActive
                    ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                    : isCompleted
                    ? 'border-border-soft opacity-90'
                    : 'border-border-soft'
                }`}
              >
                <div className="space-y-3">
                  {/* Status & Stage row */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse'
                          : isCompleted
                          ? 'bg-surface-2 text-text-muted border-border-soft'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {isActive ? 'Турнир идёт' : isCompleted ? 'Турнир завершён' : 'Черновик'}
                    </span>

                    {t.stage && (
                      <span className="text-[11px] font-medium text-text-secondary truncate">
                        {t.stage}
                      </span>
                    )}
                  </div>

                  {/* Title & Date */}
                  <div>
                    <h3 className="text-base font-bold text-text-primary leading-snug">{t.title}</h3>
                    <div className="space-y-1 mt-2 text-xs text-text-secondary">
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-text-muted" />
                        <span>
                          {new Date(t.date).toLocaleString('ru-RU', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </p>
                      {t.venue && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-text-muted" />
                          <span>{t.venue}</span>
                        </p>
                      )}
                      {t.chief_judge_name && (
                        <p className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-text-muted" />
                          <span>Судья: {t.chief_judge_name}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress Stats */}
                  <div className="grid grid-cols-2 gap-2 bg-surface-2 p-3 rounded-2xl border border-border-soft text-center font-mono">
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block">Участники</span>
                      <span className="text-sm font-bold text-text-primary">
                        {t.participants_count || 10} / 10
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block">Прогресс Игр</span>
                      <span className="text-sm font-bold text-accent">
                        {completedGames} / {totalGames}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Open Button */}
                <button
                  onClick={() => onOpenTournament(t.id)}
                  className="w-full bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 min-h-[44px]"
                >
                  <span>Управление турниром</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <CreateTournamentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newTournament) => {
          loadTournaments();
          onOpenTournament(newTournament.id);
        }}
      />
    </div>
  );
};
