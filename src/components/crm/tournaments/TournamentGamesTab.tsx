import React from 'react';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Edit2, FileCheck, FileSpreadsheet, Image as ImageIcon, Play, Users, X } from 'lucide-react';
import type { Tournament, TournamentGame, TournamentGameSeat } from '../../../lib/api.ts';
import { isRoleOptionDisabled } from '../../../lib/tournamentRoleValidation.ts';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';
import { TournamentGameSetup } from './TournamentGameSetup.tsx';
import type { tournamentGameEditRights } from './tournamentGameEditRights.ts';

const ROLES_LIST = [
  { id: 'citizen', label: 'Мирный', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'sheriff', label: 'Шериф', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold' },
  { id: 'mafia', label: 'Мафия', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  { id: 'don', label: 'Дон', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30 font-bold' },
];

type Feedback = { type: 'success' | 'error'; text: string } | null;

type Props = {
  tournament: Tournament;
  tournamentId: string;
  games: TournamentGame[];
  selectedGameIdx: number;
  setSelectedGameIdx: (index: number) => void;
  currentGame: TournamentGame | undefined;
  seats: TournamentGameSeat[];
  rights: ReturnType<typeof tournamentGameEditRights>;
  actionLoading: boolean;
  editingJudge: boolean;
  setEditingJudge: (value: boolean) => void;
  judgeInput: string;
  setJudgeInput: (value: string) => void;
  handleSaveJudge: () => void;
  handleCorrectGame: (gameId: string) => Promise<unknown> | void;
  handleResetGameToPlanned: () => void;
  handleDropLastGame: () => void;
  handleAssignRole: (seatNumber: number, role: string | null) => void;
  setFeedbackMsg: (message: Feedback) => void;
  loadDetail: () => void;
  onOpenProtocol: (gameId: string) => void;
  onLiveGame: (gameId: string) => void;
  onImportBlank: (gameId: string) => void;
  onExportResult: (game: TournamentGame) => void;
  onFixRoles: (gameId: string) => void;
  onOpenSwap: () => void;
};

/** «Игры» of the tournament card: the game switcher, the selected game's actions, its setup or its seats with roles. */
export const TournamentGamesTab: React.FC<Props> = ({
  tournament, tournamentId, games, selectedGameIdx, setSelectedGameIdx, currentGame, seats, rights, actionLoading,
  editingJudge, setEditingJudge, judgeInput, setJudgeInput, handleSaveJudge, handleCorrectGame, handleResetGameToPlanned, handleDropLastGame, handleAssignRole,
  setFeedbackMsg, loadDetail, onOpenProtocol, onLiveGame, onImportBlank, onExportResult, onFixRoles, onOpenSwap,
}) => {
  const { activeGameInTournament, isAnotherGameActive, roleCounts, isCorrection, canEditCurrentGameJudgeAndRoles, canEditJudgeInline, canSwapSeatsCurrentGame, canCorrectCurrentGame } = rights;
  return (
  <div className="space-y-5">
    {/* Selected Game Selector & Navigator */}
<div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
  {/* Game Tabs / Nav */}
  <div className="flex items-center justify-between gap-2 bg-surface-2 p-1.5 rounded-2xl border border-border-soft">
    <button
      onClick={() => setSelectedGameIdx(Math.max(0, selectedGameIdx - 1))}
      disabled={selectedGameIdx === 0}
      className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 cursor-pointer"
    >
      <ChevronLeft className="w-5 h-5" />
    </button>

    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1">
      {games.map((g, idx) => {
        const isSel = idx === selectedGameIdx;
        const isDone = g.status === 'completed';
        const isRun = g.status === 'active';
        return (
          <button
            key={g.id}
            ref={isSel ? (node) => { node?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); } : undefined}
            onClick={() => setSelectedGameIdx(idx)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              isSel
                ? 'bg-accent text-white shadow-sm'
                : isRun
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : isDone
                ? 'bg-surface-1 text-text-muted border border-border-soft'
                : 'bg-surface-1 text-text-secondary hover:text-text-primary'
            }`}
          >
            Игра {g.game_number}
          </button>
        );
      })}
    </div>

    <button
      onClick={() => setSelectedGameIdx(Math.min(games.length - 1, selectedGameIdx + 1))}
      disabled={selectedGameIdx === games.length - 1}
      className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 cursor-pointer"
    >
      <ChevronRight className="w-5 h-5" />
    </button>
  </div>

  {/* Current Game Details Header */}
  {currentGame && (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2 p-4 rounded-2xl border border-border-soft">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-text-primary whitespace-nowrap">Игра №{currentGame.game_number}</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                currentGame.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : currentGame.status === 'completed'
                  ? 'bg-surface-1 text-text-muted border border-border-soft'
                  : 'bg-surface-1 text-text-secondary border border-border-soft'
              }`}
            >
              {currentGame.status === 'active' ? 'Идёт сейчас' : currentGame.status === 'completed' ? 'Завершено' : 'Запланировано'}
            </span>
          </div>

          {/* Judge info */}
          <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
            <span>Судья:</span>
            {!editingJudge && (currentGame.judge_name || tournament.chief_judge_name) && (
              <PlayerAvatar nickname={currentGame.judge_name || tournament.chief_judge_name} size="xs" />
            )}
            {editingJudge && canEditJudgeInline ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={judgeInput}
                  onChange={(e) => setJudgeInput(e.target.value)}
                  className="bg-surface-1 border border-border-soft rounded px-2 py-0.5 text-xs text-text-primary"
                  placeholder="Имя судьи"
                />
                <button onClick={handleSaveJudge} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditingJudge(false)} className="p-1 text-text-muted hover:bg-surface-hover rounded cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : canEditJudgeInline ? (
              <button
                onClick={() => {
                  setJudgeInput(currentGame.judge_name || tournament.chief_judge_name || '');
                  setEditingJudge(true);
                }}
                className="font-semibold text-text-primary hover:text-accent flex items-center gap-1 cursor-pointer"
              >
                <span>{currentGame.judge_name || tournament.chief_judge_name || 'Назначить судью'}</span>
                <Edit2 className="w-3 h-3 text-text-muted" />
              </button>
            ) : (
              <span className="font-semibold text-text-primary">
                {currentGame.judge_name || tournament.chief_judge_name || 'Не указан'}
              </span>
            )}
          </div>
        </div>

        {/* Game Action Buttons: two columns on a phone so the card does not grow by one screen */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>button]:w-full [&>button]:justify-center [&>button]:text-center sm:[&>button]:w-auto">
          <button
            type="button"
            disabled={currentGame.status === 'planned'}
            title={currentGame.status === 'planned' ? 'Сначала запустите игру' : ''}
            onClick={() => {
              if (currentGame.status !== 'planned') onOpenProtocol(currentGame.id);
            }}
            className={`font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 min-h-[40px] shadow-sm ${
              currentGame.status === 'planned'
                ? 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed opacity-60'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 cursor-pointer'
            }`}
          >
            <FileCheck className="w-4 h-4 text-amber-400" />
            <span>Протокол игры</span>
          </button>

          {currentGame.status === 'active' && (
            <button
              type="button"
              data-testid="tournament-live-game-button"
              onClick={() => onLiveGame(String(currentGame.id))}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 min-h-[40px] shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Вести игру (движок)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onImportBlank(currentGame.id)}
            className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Загрузить бланк игры</span>
          </button>

          {currentGame.status === 'completed' && (
            <button
              type="button"
              id={`btn-game-${currentGame.game_number}-png-results-trigger`}
              onClick={() => onExportResult(currentGame)}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Посмотреть результат</span>
            </button>
          )}

          {/* «Исправить» on a completed game: reopens it (and a completed tournament first) — owner, 2026-10-22 */}
          {canCorrectCurrentGame && (
            <button
              type="button"
              data-testid="correct-completed-game-button"
              onClick={() => void handleCorrectGame(String(currentGame.id))}
              disabled={actionLoading}
              className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <span>Исправить</span>
            </button>
          )}

          {/* A wrong click while dealing the roles: fixable in a running game until its protocol is completed */}
          {(tournament.status === 'active' || tournament.status === 'correction') && currentGame.status === 'active' && (currentGame as any).protocol_status !== 'completed' && (
            <button
              type="button"
              data-testid="fix-active-game-roles-button"
              onClick={() => onFixRoles(String(currentGame.id))}
              className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <Users className="w-3.5 h-3.5 text-accent" />
              <span>Исправить роли</span>
            </button>
          )}

          {tournament.status === 'active' && currentGame.status === 'active' && (currentGame as any).protocol_status !== 'completed' && (
            <button
              type="button"
              data-testid="reset-game-to-planned-button"
              onClick={handleResetGameToPlanned}
              disabled={actionLoading}
              className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <span>Вернуть игру в план</span>
            </button>
          )}

          {(tournament.status === 'active' || tournament.status === 'draft') && games.length > 1 && games[games.length - 1]?.status === 'planned' && !(games[games.length - 1] as any).protocol_status && (
            <button
              type="button"
              data-testid="drop-last-game-button"
              onClick={handleDropLastGame}
              disabled={actionLoading}
              className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <span title={`${games.length} → ${games.length - 1} игр`}>Убрать игру №{games.length}</span>
            </button>
          )}

          {/* Swap seats / Correct players on seats allowed in draft/planned or active game in correction mode with draft protocol */}
          {canSwapSeatsCurrentGame && currentGame.status !== 'planned' && (
            <button
              onClick={onOpenSwap}
              className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
              <span>Исправить игроков на местах</span>
            </button>
          )}
        </div>
      </div>

      {currentGame.status === 'planned' ? (
        <TournamentGameSetup
          tournamentId={tournamentId}
          game={currentGame}
          tournamentStatus={tournament.status}
          isAnotherGameActive={isAnotherGameActive}
          activeGameNumber={activeGameInTournament?.game_number}
          judgeName={currentGame.judge_name}
          chiefJudgeName={tournament.chief_judge_name}
          canEditJudgeAndRoles={canEditCurrentGameJudgeAndRoles}
          canSwapSeats={canSwapSeatsCurrentGame}
          onOpenSwapModal={onOpenSwap}
          onEditJudgeClick={() => {
            setJudgeInput(currentGame.judge_name || tournament.chief_judge_name || '');
            setEditingJudge(true);
          }}
          onGameStarted={() => {
            loadDetail();
          }}
          setFeedbackMsg={setFeedbackMsg}
        />
      ) : (
        <>
          {/* Role Composition Summary Box */}
          <div className="bg-surface-2/60 p-3 rounded-2xl border border-border-soft text-xs space-y-2">
            <span className="font-bold text-text-secondary text-[11px] block">Проверка состава ролей перед запуском:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className={`p-2 rounded-xl border ${roleCounts.citizen === 6 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold' : 'bg-surface-1 border-border-soft text-text-muted'}`}>
                <span>Мирные: {roleCounts.citizen} / 6</span>
              </div>
              <div className={`p-2 rounded-xl border ${roleCounts.sheriff === 1 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-bold' : 'bg-surface-1 border-border-soft text-text-muted'}`}>
                <span>Шериф: {roleCounts.sheriff} / 1</span>
              </div>
              <div className={`p-2 rounded-xl border ${roleCounts.mafia === 2 ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold' : 'bg-surface-1 border-border-soft text-text-muted'}`}>
                <span>Мафия: {roleCounts.mafia} / 2</span>
              </div>
              <div className={`p-2 rounded-xl border ${roleCounts.don === 1 ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 font-bold' : 'bg-surface-1 border-border-soft text-text-muted'}`}>
                <span>Дон: {roleCounts.don} / 1</span>
              </div>
            </div>
          </div>

          {/* 10 Seats Cards List */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-text-secondary block">
                Рассадка на игру №{currentGame.game_number}
                {!canEditCurrentGameJudgeAndRoles && ' (заблокирована для изменений)'}:
              </span>
              {isCorrection && currentGame.status === 'completed' && (
                <span className="text-[11px] text-amber-400 italic font-medium">
                  Чтобы поменять судью или роли, откройте протокол для правки
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {seats.map((seat) => {
                const roleObj = ROLES_LIST.find((r) => r.id === seat.role);
                return (
                  <div
                    key={seat.id}
                    className="bg-surface-2 p-3 rounded-2xl border border-border-soft flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-accent text-white font-mono font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                        {seat.seat_number}
                      </span>
                      <PlayerAvatar playerId={seat.player_id || undefined} avatarVersion={seat.avatar_updated_at} forceStoredLookup nickname={seat.display_name} size="sm" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-text-primary block truncate">
                          {seat.display_name}
                        </span>
                      </div>
                    </div>

                    {/* Role selection dropdown */}
                    {canEditCurrentGameJudgeAndRoles ? (
                      <select
                        value={seat.role || ''}
                        onChange={(e) => handleAssignRole(seat.seat_number, e.target.value || null)}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none cursor-pointer ${
                          roleObj ? roleObj.color : 'bg-surface-1 text-text-muted border-border-soft'
                        }`}
                      >
                        <option
                          value=""
                          disabled={isRoleOptionDisabled(seats, seat.seat_number, null)}
                          className="bg-surface-1 text-text-muted disabled:opacity-40"
                        >
                          -- Роль не выбрана --
                        </option>
                        <option
                          value="citizen"
                          disabled={isRoleOptionDisabled(seats, seat.seat_number, 'citizen')}
                          className="bg-surface-1 text-emerald-400 font-semibold disabled:opacity-40"
                        >
                          Мирный ({roleCounts.citizen}/6)
                        </option>
                        <option
                          value="sheriff"
                          disabled={isRoleOptionDisabled(seats, seat.seat_number, 'sheriff')}
                          className="bg-surface-1 text-amber-400 font-semibold disabled:opacity-40"
                        >
                          Шериф ({roleCounts.sheriff}/1)
                        </option>
                        <option
                          value="mafia"
                          disabled={isRoleOptionDisabled(seats, seat.seat_number, 'mafia')}
                          className="bg-surface-1 text-rose-400 font-semibold disabled:opacity-40"
                        >
                          Мафия ({roleCounts.mafia}/2)
                        </option>
                        <option
                          value="don"
                          disabled={isRoleOptionDisabled(seats, seat.seat_number, 'don')}
                          className="bg-surface-1 text-purple-400 font-semibold disabled:opacity-40"
                        >
                          Дон ({roleCounts.don}/1)
                        </option>
                      </select>
                    ) : (
                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
                          roleObj ? roleObj.color : 'bg-surface-1 text-text-muted border-border-soft'
                        }`}
                      >
                        {roleObj ? roleObj.label : 'Без роли'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )}
</div>
</div>
  );
};
