import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Image as ImageIcon, Play, RefreshCw, RotateCcw, Send, Trophy, UserCheck, Users } from 'lucide-react';
import type { Tournament, TournamentGame, TournamentParticipant } from '../../../lib/api.ts';
import { countGames } from '../../../lib/russianPlural';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';
import { TournamentOfficialResults } from './TournamentOfficialResults.tsx';

/** Progress of a running (or corrected) tournament and the button that completes it, with what still blocks it. */
const CompletionPanel: React.FC<{ tournament: Tournament; games: TournamentGame[]; actionLoading: boolean; label: string; onComplete: () => void; onSendSeatMessages?: () => void }> = ({ tournament, games, actionLoading, label, onComplete, onSendSeatMessages }) => {
  const readiness = tournament.complete_readiness || { isReady: false, errors: ['Ошибка загрузки готовности'] };
  return (
    <div className="bg-surface-2 border border-border-soft rounded-2xl p-4 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-text-primary">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Прогресс турнира:</span>
          <span className="font-mono text-accent text-sm font-black">
            {games.filter((g) => g.status === 'completed').length} из {countGames(games.length)} завершено
          </span>
        </div>

        {onSendSeatMessages ? (<button
          type="button"
          onClick={onSendSeatMessages}
          disabled={actionLoading}
          className="bg-surface-3 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
        >
          <Send className="w-3.5 h-3.5 text-accent" />
          <span>Разослать места игрокам</span>
        </button>) : null}

        <button
          type="button"
          disabled={!readiness.isReady || actionLoading}
          onClick={onComplete}
          className={`font-extrabold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
            readiness.isReady
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              : 'bg-surface-3 text-text-muted cursor-not-allowed border border-border-soft/60 shadow-none'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>
      </div>

      {/* Errors List if not ready */}
      {!readiness.isReady && readiness.errors && readiness.errors.length > 0 && (
        <div className="border-t border-border-soft/60 pt-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-danger font-bold text-[11px] uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Необходимо исправить для завершения:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text-secondary leading-relaxed pl-1">
            {readiness.errors.map((err: string, idx: number) => (
              <li key={idx} className="font-sans">{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

type Props = {
  tournament: Tournament;
  tournamentId: string;
  games: TournamentGame[];
  isDraft: boolean;
  registrationFlow: boolean;
  actionLoading: boolean;
  refreshTrigger: number;
  onRefresh: () => void;
  onSeatingExport: () => void;
  onImportBlank: (gameId: string | undefined) => void;
  onEditData: () => void;
  onEditRoster: () => void;
  onRegenerateSeating: () => void;
  onSendSeatMessages: () => void;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onCorrectParticipant: (participant: TournamentParticipant) => void;
};

/** «Организация» of the tournament card: start readiness, progress and completion, correction, official results, roster. */
export const TournamentOrganizationTab: React.FC<Props> = ({
  tournament, tournamentId, games, isDraft, registrationFlow, actionLoading, refreshTrigger, onRefresh,
  onSeatingExport, onImportBlank, onEditData, onEditRoster, onRegenerateSeating, onSendSeatMessages, onStart, onComplete, onReopen, onCorrectParticipant,
}) => {
  const [showRoster, setShowRoster] = useState(false);
  return (
  <div className="space-y-5">
    <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          Управление турниром
        </h3>
      </div>
      
  {isDraft ? (
    <div className="space-y-3 pt-3 border-t border-border-soft">
      {/* Readiness Badge & Export Button */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 p-3 rounded-2xl border border-border-soft">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-secondary">Статус готовности:</span>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
              tournament.start_readiness?.ready
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-danger/10 text-danger border-danger/30'
            }`}
          >
            {tournament.start_readiness?.ready ? 'Готов к запуску' : 'Требуется исправление'}
          </span>
        </div>

        <button
          type="button"
          onClick={onSeatingExport}
          className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Рассадка для игроков (PNG)</span>
        </button>
      </div>

      {/* List of readiness errors if not ready */}
      {tournament.start_readiness && !tournament.start_readiness.ready && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl text-danger text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Для запуска турнира необходимо устранить замечания:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium pl-1">
            {tournament.start_readiness.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onImportBlank(undefined)}
          className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Загрузить бланк игры</span>
        </button>

        {!registrationFlow ? (
          <button
            type="button"
            onClick={onEditData}
            className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
          >
            <FileText className="w-3.5 h-3.5 text-accent" />
            <span>Редактировать данные</span>
          </button>
        ) : null}

        {!registrationFlow ? (
          <button
            type="button"
            onClick={onEditRoster}
            className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
          >
            <Users className="w-3.5 h-3.5 text-accent" />
            <span>Изменить состав</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onRegenerateSeating}
          disabled={actionLoading}
          className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
          <span>Перегенерировать рассадку</span>
        </button>

        <button
          type="button"
          onClick={onSendSeatMessages}
          disabled={actionLoading}
          className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
        >
          <Send className="w-3.5 h-3.5 text-accent" />
          <span>Разослать места игрокам</span>
        </button>

        <button
          type="button"
          onClick={onStart}
          disabled={actionLoading || !tournament.start_readiness?.ready}
          title={!tournament.start_readiness?.ready ? 'Исправьте ошибки перед запуском' : 'Запустить турнир'}
          className={`font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px] ml-auto ${
            tournament.start_readiness?.ready
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-surface-2 text-text-muted border border-border-soft opacity-50 cursor-not-allowed'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Запустить турнир</span>
        </button>
      </div>
    </div>
  ) : (
    <div className="space-y-3 pt-3 border-t border-border-soft">
      {/* Completion Readiness & Controls for Active Tournament */}
      {tournament.status === 'active' && (
        <CompletionPanel tournament={tournament} games={games} actionLoading={actionLoading} label="Завершить турнир" onComplete={onComplete} onSendSeatMessages={onSendSeatMessages} />
      )}

      {/* Correction Mode Section */}
      {tournament.status === 'correction' && (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2 text-amber-300 text-xs">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider text-amber-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Режим корректировки турнира</span>
            </div>
            <p className="text-text-secondary leading-relaxed">
              Турнир возвращён из завершённых для внесения исправлений. Публичные результаты временно скрыты, а результаты спорных ситуаций аннулированы. Для изменения судьи и ролей откройте протокол нужной игры для правки. После внесения правок завершите турнир повторно.
            </p>
          </div>
          <CompletionPanel tournament={tournament} games={games} actionLoading={actionLoading} label="Повторно завершить турнир" onComplete={onComplete} />
        </div>
      )}

      {tournament.status === 'completed' && (
        <div className="space-y-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-xs text-emerald-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4.5 h-4.5 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold block text-text-primary">Турнир официально завершён</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Результаты зафиксированы. Организатор может вернуть турнир на корректировку при необходимости.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onReopen}
              className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Редактировать завершённый турнир</span>
            </button>
          </div>

          <TournamentOfficialResults
            tournamentId={tournamentId}
            refreshTrigger={refreshTrigger}
            onResolve={() => onRefresh()}
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {(tournament.status === 'active' || tournament.status === 'correction') && (
          <button
            type="button"
            onClick={onEditData}
            className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
          >
            <FileText className="w-3.5 h-3.5 text-accent" />
            <span>Редактировать данные</span>
          </button>
        )}
        <button
          type="button"
          onClick={onSeatingExport}
          className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
        >
          <ImageIcon className="w-3.5 h-3.5 text-accent" />
          <span>Рассадка для игроков (PNG)</span>
        </button>
      </div>
    </div>
  )}
    </div>
    {/* Roster / Participants Accordion */}
    <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowRoster(!showRoster)}>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold text-text-primary">Состав участников ({tournament.participants?.length || 0} человек)</h3>
        </div>
        <div className="flex items-center gap-4">
          {isDraft && !registrationFlow && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditRoster(); }}
              className="text-xs text-accent hover:underline font-bold"
            >
              Изменить состав
            </button>
          )}
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="text-xs">{showRoster ? 'Скрыть' : 'Показать'}</span>
            {showRoster ? <ChevronLeft className="w-4 h-4 -rotate-90" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {showRoster && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
        {tournament.participants?.map((p) => (
          <div key={p.id} className="bg-surface-2 p-2.5 rounded-2xl border border-border-soft text-center space-y-0.5">
            <PlayerAvatar
              playerId={p.player_id || undefined}
              avatarVersion={p.avatar_updated_at}
              forceStoredLookup
              nickname={p.player_nickname || p.display_name}
              size="md"
              className="mx-auto mb-1"
            />
            <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[10px] font-bold inline-flex items-center justify-center mb-1">
              {p.participant_number}
            </span>
            <span className="text-xs font-bold text-text-primary block truncate">{p.display_name}</span>
            {p.player_nickname && p.player_nickname !== p.display_name && (
              <span className="text-[10px] text-text-muted block truncate">({p.player_nickname})</span>
            )}
            {tournament.status !== 'completed' && !registrationFlow && (
              <button
                type="button"
                onClick={() => onCorrectParticipant(p)}
                className="text-[10px] text-accent hover:underline font-bold mt-1 inline-flex items-center gap-0.5 cursor-pointer"
              >
                <UserCheck className="w-3 h-3" />
                <span>Исправить</span>
              </button>
            )}
          </div>
        ))}
      </div>
      )}
    </div>

  </div>
  );
};
