import React from 'react';
import { ArrowLeft, Calendar, MapPin } from 'lucide-react';
import type { Tournament, TournamentGame } from '../../../lib/api.ts';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';

type Props = { tournament: Tournament; games: TournamentGame[]; actionLoading: boolean; onBack: () => void; onCancel: () => void };

/** Title, status, date, venue and judge of the tournament card; a tournament without played games can be cancelled here. */
export const TournamentCardHeader: React.FC<Props> = ({ tournament, games, actionLoading, onBack, onCancel }) => (
    <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-hover px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад</span>
          </button>
          
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
              tournament.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : tournament.status === 'correction'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse'
                : tournament.status === 'completed'
                ? 'bg-surface-2 text-text-muted border-border-soft'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            {tournament.status === 'active'
              ? 'Турнир идёт'
              : tournament.status === 'correction'
              ? 'Режим корректировки'
              : tournament.status === 'completed'
              ? 'Завершён'
              : (tournament.status as string) === 'cancelled'
              ? 'Отменён'
              : 'Черновик'}
          </span>
          {(tournament.status === 'draft' || tournament.status === 'active') && !games.some((g: any) => g.status === 'active' || g.status === 'completed') && (
            <button
              type="button"
              data-testid="cancel-tournament-button"
              onClick={onCancel}
              disabled={actionLoading}
              className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg border border-rose-500/30 cursor-pointer"
            >
              Отменить турнир
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="text-xl font-black text-text-primary tracking-tight">{tournament.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-text-muted" />
            {new Date(tournament.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })}
          </span>
          {tournament.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-text-muted" />
              {tournament.venue}
            </span>
          )}
          {tournament.stage && <span className="text-accent font-semibold">{tournament.stage}</span>}
          {tournament.chief_judge_name && (
            <span className="text-text-muted flex items-center gap-1.5">
              <PlayerAvatar nickname={tournament.chief_judge_name} size="xs" />
              Главный судья: {tournament.chief_judge_name}
            </span>
          )}
        </div>
        {tournament.notes && (
          <p className="text-xs text-text-muted italic pt-1">{tournament.notes}</p>
        )}
      </div>

      
    </div>
);
