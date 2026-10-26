import { useResumeLiveGame } from '../../../lib/useResumeLiveGame.ts';
import React, { useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, Users, X, FileText, Trophy, Award } from 'lucide-react';
import { TournamentGame, TournamentGameSeat, TournamentParticipant } from '../../../lib/api.ts';
import { EditTournamentDataModal } from './EditTournamentDataModal.tsx';
import { EditTournamentRosterModal } from './EditTournamentRosterModal.tsx';
import { ConfirmStartTournamentModal } from './ConfirmStartTournamentModal.tsx';
import { SeatingExportModal } from './SeatingExportModal.tsx';
import { ProtocolImportModal } from './ProtocolImportModal.tsx';
import { ActiveGameRolesModal } from './ActiveGameRolesModal.tsx';
import TournamentLiveGameModal from '../../player/TournamentLiveGameModal.tsx';
import { GameProtocolModal } from './GameProtocolModal.tsx';
import { ResultsImageExportModal } from './ResultsImageExportModal.tsx';
import { TournamentStandingsView } from './TournamentStandingsView.tsx';
import { TournamentNominationsView } from './TournamentNominationsView.tsx';
import { CorrectParticipantModal } from './CorrectParticipantModal.tsx';
import { ConfirmCompleteTournamentModal } from './ConfirmCompleteTournamentModal.tsx';
import { ConfirmReopenTournamentModal } from './ConfirmReopenTournamentModal.tsx';
import { tournamentGameEditRights } from './tournamentGameEditRights.ts';
import { TournamentOrganizationTab } from './TournamentOrganizationTab.tsx';
import { TournamentGamesTab } from './TournamentGamesTab.tsx';
import { SwapSeatsModal } from './SwapSeatsModal.tsx';
import { TournamentCardHeader } from './TournamentCardHeader.tsx';
import { useTournamentActions } from './useTournamentActions.ts';
import { useTournamentDetail } from './useTournamentDetail.ts';

type TournamentTab = 'organization' | 'games' | 'standings' | 'nominations';

interface TournamentDetailViewProps {
  tournamentId: string;
  onBack: () => void;
  /** Step screen of a tournament with registration: its own header, and only this step's tabs. */
  hideHeader?: boolean;
  tabs?: TournamentTab[];
}

const ALL_TABS: TournamentTab[] = ['organization', 'games', 'standings', 'nominations'];

const TAB_BUTTONS: Array<{ id: TournamentTab; label: string; Icon: React.ElementType; iconClass?: string }> = [
  { id: 'organization', label: 'Организация', Icon: FileText },
  { id: 'games', label: 'Игры', Icon: Users },
  { id: 'standings', label: 'Таблица', Icon: Trophy, iconClass: 'text-amber-400' },
  { id: 'nominations', label: 'Номинации', Icon: Award, iconClass: 'text-cyan-400' },
];

export const TournamentDetailView: React.FC<TournamentDetailViewProps> = ({
  tournamentId,
  onBack,
  hideHeader = false,
  tabs = ALL_TABS,
}) => {
  // The card's own message line is owned by the actions below; a failed silent refresh reports through it.
  const reportRef = useRef<(message: string) => void>(() => undefined);
  const { tournament, setTournament, loading, loadError, selectedGameIdx, setSelectedGameIdx, refreshTrigger, refresh, loadDetail } = useTournamentDetail({ tournamentId, onSilentError: (message) => reportRef.current(message) });
  const [activeTab, setActiveTabRaw] = useState<TournamentTab>(tabs[0] || 'organization');
  // A step screen shows only its own tabs; a jump to another tab (e.g. to games after the start) stays inside them.
  const setActiveTab = (tab: TournamentTab) => setActiveTabRaw(tabs.includes(tab) ? tab : tabs[0]);

  // Edit draft modals state
  const [showEditDataModal, setShowEditDataModal] = useState(false);
  const [showEditRosterModal, setShowEditRosterModal] = useState(false);

  // Seating PNG export modal state
  const [showSeatingExportModal, setShowSeatingExportModal] = useState(false);

  // Protocol blank import modal state
  const [showProtocolImportModal, setShowProtocolImportModal] = useState(false);
  const [liveGameId, setLiveGameId] = useState<string | null>(null);
  // A reload returns to the game window that was open.
  useResumeLiveGame('tournament', tournament?.games ?? null, liveGameId !== null, (game) => setLiveGameId(String(game.id)), (game) => game.status === 'active');
  const [rolesFixGameId, setRolesFixGameId] = useState<string | null>(null);
  const [selectedImportGameId, setSelectedImportGameId] = useState<string | undefined>(undefined);

  // Manual Mobile Protocol modal state
  const [showGameProtocolModal, setShowGameProtocolModal] = useState(false);
  const [protocolGameId, setProtocolGameId] = useState<string | null>(null);

  // Correct participant state
  const [correctingParticipant, setCorrectingParticipant] = useState<TournamentParticipant | null>(null);

  // Results PNG export states
  const [exportGameId, setExportGameId] = useState<string | undefined>(undefined);
  const [exportGameNumber, setExportGameNumber] = useState<number | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const {
    feedbackMsg, setFeedbackMsg, actionLoading,
    showStartModal, setShowStartModal, startModalLoading, startModalError,
    showSwapModal, setShowSwapModal, swapSeat1, setSwapSeat1, swapSeat2, setSwapSeat2,
    showCompleteModal, setShowCompleteModal, showReopenModal, setShowReopenModal, setCorrectGameAfterReopen,
    editingJudge, setEditingJudge, judgeInput, setJudgeInput,
    handleCompleteTournament, handleCorrectGame, handleReopenTournament,
    handleOpenStartModal, handleConfirmStartTournament, handleRegenerateSeating, handleCancelTournament,
    handleResetGameToPlanned, handleDropLastGame, handleSendSeatMessages, handleSwapSeats, handleAssignRole, handleSaveJudge,
  } = useTournamentActions({ tournamentId, tournament, selectedGameIdx, loadDetail: (opts) => loadDetail(opts), setTournament, goToGames: () => setActiveTab('games') });
  reportRef.current = (message) => setFeedbackMsg({ type: 'error', text: message });

  if (loading) {
    return <div className="py-20 text-center text-text-muted text-xs">Загрузка данных турнира...</div>;
  }

  if (!tournament) {
    const isNotFound = loadError?.status === 404;
    return (
      <div className="py-20 text-center text-xs space-y-3">
        <p className={isNotFound ? 'text-danger' : 'text-text-primary font-bold'}>
          {isNotFound ? 'Турнир не найден' : 'Не удалось загрузить турнир'}
        </p>
        {!isNotFound && (
          <p className="mx-auto max-w-sm px-4 text-text-secondary">
            Попробуйте загрузить данные ещё раз. Сам турнир и его результаты при ошибке загрузки не изменяются.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!isNotFound && (
            <button
              type="button"
              onClick={() => loadDetail()}
              className="min-h-[44px] bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl text-xs font-bold"
            >
              Повторить
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] bg-surface-2 hover:bg-surface-hover text-text-primary px-4 py-2 rounded-xl text-xs font-bold"
          >
            Назад к списку
          </button>
        </div>
      </div>
    );
  }

  const isDraft = tournament.status === 'draft';
  // Tournaments with registration get their players one by one in «Участники» and their settings in «Турнирный вечер»
  // above; the old all-ten-at-once roster form and the old data form stay only for tournaments made the old way.
  const registrationFlow = Number((tournament as any).tournament_evening_flow || 0) === 1;
  const games = tournament.games || [];
  const currentGame: TournamentGame | undefined = games[selectedGameIdx];
  const seats: TournamentGameSeat[] = currentGame?.seats || [];

  const rights = tournamentGameEditRights(tournament.status, games, currentGame);

  return (
    <div className="space-y-5 text-text-primary">
      {/* Top Header & Navigation */}
      {!hideHeader ? <TournamentCardHeader tournament={tournament} games={games} actionLoading={actionLoading} onBack={onBack} onCancel={handleCancelTournament} /> : null}

      {/* Feedback banner */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 text-xs font-semibold ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="p-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      {tabs.length > 1 ? (
      <div className={`grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 bg-surface-1 p-1.5 rounded-2xl border border-border-soft overflow-hidden`}>
        {TAB_BUTTONS.filter((item) => tabs.includes(item.id)).map(({ id, label, Icon, iconClass }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`min-w-0 min-h-[44px] sm:flex-1 py-1.5 px-2 rounded-xl text-[11px] leading-tight sm:text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-center ${
              activeTab === id
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0${iconClass ? ` ${iconClass}` : ''}`} />
            <span className="line-clamp-2">{label}</span>
          </button>
        ))}
      </div>
      ) : null}

      {activeTab === 'organization' && (
        <TournamentOrganizationTab
          tournament={tournament} tournamentId={tournamentId} games={games} isDraft={isDraft} registrationFlow={registrationFlow}
          actionLoading={actionLoading} refreshTrigger={refreshTrigger} onRefresh={() => refresh()}
          onSeatingExport={() => setShowSeatingExportModal(true)}
          onImportBlank={(gameId) => { setSelectedImportGameId(gameId); setShowProtocolImportModal(true); }}
          onEditData={() => setShowEditDataModal(true)}
          onEditRoster={() => setShowEditRosterModal(true)}
          onRegenerateSeating={handleRegenerateSeating}
          onSendSeatMessages={handleSendSeatMessages}
          onStart={handleOpenStartModal}
          onComplete={() => setShowCompleteModal(true)}
          onReopen={() => setShowReopenModal(true)}
          onCorrectParticipant={setCorrectingParticipant}
        />
      )}

      {activeTab === 'standings' ? (
        <TournamentStandingsView tournamentId={tournamentId} refreshTrigger={refreshTrigger} />
      ) : activeTab === 'nominations' ? (
        <TournamentNominationsView tournamentId={tournamentId} refreshTrigger={refreshTrigger} />
      ) : activeTab === 'games' ? (
        <TournamentGamesTab
          tournament={tournament} tournamentId={tournamentId} games={games} selectedGameIdx={selectedGameIdx} setSelectedGameIdx={setSelectedGameIdx}
          currentGame={currentGame} seats={seats} rights={rights} actionLoading={actionLoading}
          editingJudge={editingJudge} setEditingJudge={setEditingJudge} judgeInput={judgeInput} setJudgeInput={setJudgeInput}
          handleSaveJudge={handleSaveJudge} handleCorrectGame={handleCorrectGame} handleResetGameToPlanned={handleResetGameToPlanned}
          handleDropLastGame={handleDropLastGame} handleAssignRole={handleAssignRole} setFeedbackMsg={setFeedbackMsg} loadDetail={() => loadDetail()}
          onOpenProtocol={(gameId) => { setProtocolGameId(gameId); setShowGameProtocolModal(true); }}
          onLiveGame={setLiveGameId}
          onImportBlank={(gameId) => { setSelectedImportGameId(gameId); setShowProtocolImportModal(true); }}
          onExportResult={(game) => { setExportGameId(game.id); setExportGameNumber(game.game_number); setIsExportModalOpen(true); }}
          onFixRoles={setRolesFixGameId}
          onOpenSwap={() => { setSwapSeat1(1); setSwapSeat2(2); setShowSwapModal(true); }}
        />
      ) : null}

      {/* EDIT TOURNAMENT DATA MODAL */}
      <EditTournamentDataModal
        isOpen={showEditDataModal}
        tournament={tournament}
        onClose={() => setShowEditDataModal(false)}
        onSaved={loadDetail}
      />

      {/* EDIT TOURNAMENT ROSTER MODAL */}
      <EditTournamentRosterModal
        isOpen={showEditRosterModal}
        tournament={tournament}
        onClose={() => setShowEditRosterModal(false)}
        onSaved={loadDetail}
      />

      {/* SWAP SEATS MODAL */}
      {showSwapModal && rights.canSwapSeatsCurrentGame && (
        <SwapSeatsModal seats={seats} gameNumber={currentGame?.game_number} swapSeat1={swapSeat1} setSwapSeat1={setSwapSeat1} swapSeat2={swapSeat2} setSwapSeat2={setSwapSeat2}
          actionLoading={actionLoading} onSwap={handleSwapSeats} onClose={() => setShowSwapModal(false)} />
      )}

      {/* CORRECT PARTICIPANT MODAL */}
      <CorrectParticipantModal
        isOpen={!!correctingParticipant}
        tournamentId={tournamentId}
        participant={correctingParticipant}
        allParticipants={tournament.participants || []}
        onClose={() => setCorrectingParticipant(null)}
        onSuccess={() => {
          setCorrectingParticipant(null);
          setFeedbackMsg({ type: 'success', text: 'Профиль участника успешно исправлен во всём турнире' });
          loadDetail();
        }}
      />

      {/* Confirm Start Tournament Modal */}
      <ConfirmStartTournamentModal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        onConfirm={handleConfirmStartTournament}
        tournamentTitle={tournament.title}
        loading={startModalLoading}
        error={startModalError}
      />

      {/* Seating PNG Export Modal */}
      <SeatingExportModal
        isOpen={showSeatingExportModal}
        onClose={() => setShowSeatingExportModal(false)}
        tournament={tournament}
      />

      {/* Live Game engine for the active tournament game (owner, 2026-10-03): the same engine as the judge's cabinet */}
      {liveGameId && (() => {
        const liveGame = (tournament.games || []).find((game) => String(game.id) === liveGameId);
        return liveGame && liveGame.status === 'active' ? (
          <TournamentLiveGameModal
            tournamentId={tournamentId}
            gameId={liveGameId}
            judgeName={liveGame.judge_name || tournament.chief_judge_name}
            obsRemote
            onClose={() => setLiveGameId(null)}
            onCompleted={() => { setLiveGameId(null); loadDetail(); }}
          />
        ) : null;
      })()}

      {rolesFixGameId && (() => {
        const fixGame = (tournament.games || []).find((game) => String(game.id) === rolesFixGameId);
        return fixGame && fixGame.status === 'active' ? (
          <ActiveGameRolesModal
            tournamentId={tournamentId}
            gameId={rolesFixGameId}
            gameNumber={fixGame.game_number}
            seats={fixGame.seats || []}
            onClose={() => setRolesFixGameId(null)}
            onSaved={() => {
              setRolesFixGameId(null);
              setFeedbackMsg({ type: 'success', text: `Роли игры №${fixGame.game_number} исправлены. Если игра открыта в движке, откройте её заново.` });
              loadDetail();
            }}
          />
        ) : null;
      })()}

      {/* Protocol Blank Import Modal */}
      {showProtocolImportModal && (
        <ProtocolImportModal
          tournamentId={tournamentId}
          games={tournament.games || []}
          preselectedGameId={selectedImportGameId}
          onClose={() => setShowProtocolImportModal(false)}
          onSuccess={() => {
            setShowProtocolImportModal(false);
            setFeedbackMsg({ type: 'success', text: 'Протокол игры сохранён. Игра пока не завершена.' });
            loadDetail();
          }}
        />
      )}

      {/* Manual Mobile Protocol Modal */}
      {showGameProtocolModal && protocolGameId && (
        <GameProtocolModal
          tournamentId={tournamentId}
          gameId={protocolGameId}
          isOpen={showGameProtocolModal}
          onClose={() => {
            setShowGameProtocolModal(false);
            setProtocolGameId(null);
          }}
          onProtocolUpdated={() => {
            loadDetail({ silent: true });
          }}
        />
      )}

      <ConfirmCompleteTournamentModal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        onConfirm={handleCompleteTournament}
        tournamentId={tournamentId}
      />

      <ConfirmReopenTournamentModal
        isOpen={showReopenModal}
        onClose={() => { setShowReopenModal(false); setCorrectGameAfterReopen(null); }}
        onConfirm={handleReopenTournament}
      />

      {tournament && isExportModalOpen && (
        <ResultsImageExportModal
          isOpen={isExportModalOpen}
          onClose={() => {
            setIsExportModalOpen(false);
            setExportGameId(undefined);
            setExportGameNumber(undefined);
          }}
          tournament={tournament}
          exportType="game"
          gameId={exportGameId}
          gameNumber={exportGameNumber}
        />
      )}
    </div>
  );
};
