import React, { useState } from 'react';
import { ArrowLeft, Calendar, Link2, MapPin } from 'lucide-react';
import { sendJson } from '../../../lib/requestJson.ts';
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

      <PublicTableLink tournamentId={String(tournament.id)} />
    </div>
);

/** One permanent link to the tournament table for anybody (owner, 2026-11-07): no sign-in; during the tournament the table after the played games. */
const PublicTableLink: React.FC<{ tournamentId: string }> = ({ tournamentId }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    if (busy) return;
    setBusy(true); setNote('');
    try {
      const body = await sendJson<{ path: string }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/public-link`, 'POST', {}, 'Не удалось получить ссылку');
      const url = `${window.location.origin}${body.path}`;
      try { await navigator.clipboard.writeText(url); setNote(`Ссылка скопирована: ${url}`); } catch { setNote(url); }
    } catch (error: any) { setNote(error?.message || 'Не удалось получить ссылку'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1">
      <button type="button" data-testid="tournament-public-link" disabled={busy} onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-soft bg-surface-2 px-3 text-xs font-semibold text-text-primary disabled:opacity-50">
        <Link2 className="h-4 w-4" aria-hidden="true" />Скопировать ссылку на таблицу
      </button>
      {note ? <p role="status" className="break-all text-[11px] text-text-secondary">{note}</p> : <p className="text-[11px] text-text-muted">Открывается у любого без входа; во время турнира — таблица после сыгранных игр.</p>}
    </div>
  );
};
