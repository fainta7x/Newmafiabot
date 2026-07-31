import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Play,
  ArrowLeftRight,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Edit2,
  Check,
  X,
  FileText,
  Image as ImageIcon,
  Trophy,
  RotateCcw,
} from 'lucide-react';
import { api, Tournament, TournamentGame, TournamentGameSeat } from '../../../lib/api.ts';
import { EditTournamentDataModal } from './EditTournamentDataModal.tsx';
import { EditTournamentRosterModal } from './EditTournamentRosterModal.tsx';
import { ConfirmStartTournamentModal } from './ConfirmStartTournamentModal.tsx';
import { SeatingExportModal } from './SeatingExportModal.tsx';
import { ProtocolImportModal } from './ProtocolImportModal.tsx';
import { GameProtocolModal } from './GameProtocolModal.tsx';
import { TournamentStandingsView } from './TournamentStandingsView.tsx';
import { TournamentNominationsView } from './TournamentNominationsView.tsx';
import { FileSpreadsheet, FileCheck, Award } from 'lucide-react';
import { ConfirmCompleteTournamentModal } from './ConfirmCompleteTournamentModal.tsx';
import { ConfirmReopenTournamentModal } from './ConfirmReopenTournamentModal.tsx';
import { TournamentOfficialResults } from './TournamentOfficialResults.tsx';

interface TournamentDetailViewProps {
  tournamentId: string;
  onBack: () => void;
}

const ROLES_LIST = [
  { id: 'citizen', label: 'Мирный', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'sheriff', label: 'Шериф', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold' },
  { id: 'mafia', label: 'Мафия', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  { id: 'don', label: 'Дон', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30 font-bold' },
];

export const TournamentDetailView: React.FC<TournamentDetailViewProps> = ({
  tournamentId,
  onBack,
}) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'games' | 'standings' | 'nominations'>('games');

  // Edit draft modals state
  const [showEditDataModal, setShowEditDataModal] = useState(false);
  const [showEditRosterModal, setShowEditRosterModal] = useState(false);

  // Custom confirmation launch modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [startModalLoading, setStartModalLoading] = useState(false);
  const [startModalError, setStartModalError] = useState<string | null>(null);

  // Seating PNG export modal state
  const [showSeatingExportModal, setShowSeatingExportModal] = useState(false);

  // Protocol blank import modal state
  const [showProtocolImportModal, setShowProtocolImportModal] = useState(false);
  const [selectedImportGameId, setSelectedImportGameId] = useState<string | undefined>(undefined);

  // Manual Mobile Protocol modal state
  const [showGameProtocolModal, setShowGameProtocolModal] = useState(false);
  const [protocolGameId, setProtocolGameId] = useState<string | null>(null);

  // Swap modal state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapSeat1, setSwapSeat1] = useState<number>(1);
  const [swapSeat2, setSwapSeat2] = useState<number>(2);

  // Feedback state
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Judge edit state
  const [editingJudge, setEditingJudge] = useState(false);
  const [judgeInput, setJudgeInput] = useState('');

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadDetail();
  }, [tournamentId, refreshTrigger]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await api.getTournament(tournamentId);
      setTournament(data);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка загрузки турнира' });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTournament = async () => {
    // This is passed as onConfirm to ConfirmCompleteTournamentModal
    await api.completeTournament(tournamentId);
    setFeedbackMsg({
      type: 'success',
      text: 'Турнир успешно официально завершён! Все результаты зафиксированы.',
    });
    loadDetail();
  };

  const handleReopenTournament = async () => {
    try {
      await api.reopenTournamentForCorrection(tournamentId);
      setFeedbackMsg({
        type: 'success',
        text: 'Турнир возвращён на корректировку. Публичные результаты временно скрыты.',
      });
      await loadDetail();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Ошибка возврата турнира на корректировку',
      });
      throw err;
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-text-muted text-xs">Загрузка данных турнира...</div>;
  }

  if (!tournament) {
    return (
      <div className="py-20 text-center text-danger text-xs space-y-3">
        <p>Турнир не найден</p>
        <button
          onClick={onBack}
          className="bg-surface-2 hover:bg-surface-hover text-text-primary px-4 py-2 rounded-xl text-xs font-bold"
        >
          Назад к списку
        </button>
      </div>
    );
  }

  const isDraft = tournament.status === 'draft';
  const games = tournament.games || [];
  const currentGame: TournamentGame | undefined = games[selectedGameIdx];
  const seats: TournamentGameSeat[] = currentGame?.seats || [];

  // Check active game in entire tournament
  const activeGameInTournament = games.find((g) => g.status === 'active');
  const isAnotherGameActive = Boolean(
    activeGameInTournament && currentGame && activeGameInTournament.id !== currentGame.id
  );

  // Calculate role stats for selected game
  const roleCounts = {
    citizen: seats.filter((s) => s.role === 'citizen').length,
    sheriff: seats.filter((s) => s.role === 'sheriff').length,
    mafia: seats.filter((s) => s.role === 'mafia').length,
    don: seats.filter((s) => s.role === 'don').length,
  };

  const isRolesValid =
    roleCounts.citizen === 6 &&
    roleCounts.sheriff === 1 &&
    roleCounts.mafia === 2 &&
    roleCounts.don === 1;

  const canStartCurrentGame =
    tournament.status === 'active' &&
    currentGame?.status === 'planned' &&
    !isAnotherGameActive &&
    isRolesValid;

  const handleOpenStartModal = () => {
    setStartModalError(null);
    setShowStartModal(true);
  };

  const handleConfirmStartTournament = async () => {
    setStartModalLoading(true);
    setStartModalError(null);
    try {
      await api.startTournament(tournamentId);
      setShowStartModal(false);
      setFeedbackMsg({
        type: 'success',
        text: 'Турнир успешно запущен! Статус изменён на «Турнир идёт». Состав и рассадка заблокированы.',
      });
      loadDetail();
    } catch (err: any) {
      setStartModalError(err.message || 'Ошибка запуска турнира');
    } finally {
      setStartModalLoading(false);
    }
  };

  const handleRegenerateSeating = async () => {
    if (!confirm('Сгенерировать новую случайную рассадку для всех 10 игр?')) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.generateTournamentSeating(tournamentId);
      setFeedbackMsg({ type: 'success', text: 'Случайная рассадка для 10 игр успешно перегенерирована!' });
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка генерации рассадки' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwapSeats = async () => {
    if (!currentGame) return;
    if (swapSeat1 === swapSeat2) {
      setFeedbackMsg({ type: 'error', text: 'Выберите два разных места для перестановки' });
      return;
    }
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.swapTournamentSeats(tournamentId, currentGame.id, swapSeat1, swapSeat2);
      setFeedbackMsg({ type: 'success', text: `Места #${swapSeat1} и #${swapSeat2} переставлены в Игра №${currentGame.game_number}` });
      setShowSwapModal(false);
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка перестановки мест' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignRole = async (seatNumber: number, newRole: string | null) => {
    if (!currentGame || currentGame.status !== 'planned') return;
    try {
      const updatedRoles = seats.map((s) =>
        s.seat_number === seatNumber ? { seat_number: s.seat_number, role: newRole } : { seat_number: s.seat_number, role: s.role }
      );
      await api.updateGameRoles(tournamentId, currentGame.id, updatedRoles);
      const nextSeats = seats.map((s) => (s.seat_number === seatNumber ? { ...s, role: newRole } : s));
      const nextGames = games.map((g) => (g.id === currentGame.id ? { ...g, seats: nextSeats } : g));
      setTournament({ ...tournament, games: nextGames });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка назначения роли' });
    }
  };

  const handleSaveJudge = async () => {
    if (!currentGame || currentGame.status !== 'planned') return;
    try {
      await api.updateGameJudge(tournamentId, currentGame.id, judgeInput.trim());
      setEditingJudge(false);
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка обновления судьи' });
    }
  };

  const handleStartGame = async () => {
    if (!currentGame) return;
    if (!canStartCurrentGame) {
      if (tournament.status !== 'active') {
        setFeedbackMsg({ type: 'error', text: 'Запуск игры разрешён только после старта турнира' });
      } else if (isAnotherGameActive) {
        setFeedbackMsg({ type: 'error', text: `Уже идет активная Игра №${activeGameInTournament?.game_number}` });
      } else if (!isRolesValid) {
        setFeedbackMsg({ type: 'error', text: 'Для запуска игры требуется ровно: 6 мирных, 1 Шериф, 2 мафии, 1 Дон' });
      }
      return;
    }

    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.startTournamentGame(tournamentId, currentGame.id);
      setFeedbackMsg({ type: 'success', text: `Игра №${currentGame.game_number} успешно запущена!` });
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось запустить игру' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-text-primary">
      {/* Top Header & Navigation */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-hover px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                tournament.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : tournament.status === 'completed'
                  ? 'bg-surface-2 text-text-muted border-border-soft'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              {tournament.status === 'active' ? 'Турнир идёт' : tournament.status === 'completed' ? 'Завершён' : 'Черновик'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-black text-text-primary tracking-tight">{tournament.title}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              {new Date(tournament.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            {tournament.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-text-muted" />
                {tournament.venue}
              </span>
            )}
            {tournament.stage && <span className="text-accent font-semibold">{tournament.stage}</span>}
            {tournament.chief_judge_name && (
              <span className="text-text-muted">Главный судья: {tournament.chief_judge_name}</span>
            )}
          </div>
          {tournament.notes && (
            <p className="text-xs text-text-muted italic pt-1">{tournament.notes}</p>
          )}
        </div>

        {/* Global actions row & readiness indicator */}
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
                onClick={() => setShowSeatingExportModal(true)}
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
                onClick={() => {
                  setSelectedImportGameId(undefined);
                  setShowProtocolImportModal(true);
                }}
                className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Загрузить бланк игры</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEditDataModal(true)}
                className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>Редактировать данные</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEditRosterModal(true)}
                className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <Users className="w-3.5 h-3.5 text-accent" />
                <span>Изменить состав</span>
              </button>

              <button
                type="button"
                onClick={handleRegenerateSeating}
                disabled={actionLoading}
                className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Перегенерировать рассадку</span>
              </button>

              <button
                type="button"
                onClick={handleOpenStartModal}
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
            {tournament.status === 'active' && (() => {
              const readiness = tournament.complete_readiness || { isReady: false, errors: ['Ошибка загрузки готовности'] };
              return (
                <div className="bg-surface-2 border border-border-soft rounded-2xl p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-text-primary">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Прогресс турнира:</span>
                      <span className="font-mono text-accent text-sm font-black">
                        {games.filter((g) => g.status === 'completed').length} из {games.length} игр завершено
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!readiness.isReady || actionLoading}
                      onClick={() => setShowCompleteModal(true)}
                      className={`font-extrabold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                        readiness.isReady
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                          : 'bg-surface-3 text-text-muted cursor-not-allowed border border-border-soft/60 shadow-none'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Завершить турнир</span>
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
            })()}

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
                    onClick={() => setShowReopenModal(true)}
                    className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Редактировать завершённый турнир</span>
                  </button>
                </div>

                <TournamentOfficialResults
                  tournamentId={tournamentId}
                  refreshTrigger={refreshTrigger}
                  onResolve={() => setRefreshTrigger((prev) => prev + 1)}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSeatingExportModal(true)}
                className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                <span>Рассадка для игроков (PNG)</span>
              </button>
            </div>
          </div>
        )}
      </div>

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

      {/* Navigation Tabs (Игры и рассадка / Таблица / Номинации) */}
      <div className="flex items-center gap-2 bg-surface-1 p-1.5 rounded-2xl border border-border-soft">
        <button
          type="button"
          onClick={() => setActiveTab('games')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'games'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Игры и рассадка</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('standings')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'standings'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Таблица</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('nominations')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'nominations'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          }`}
        >
          <Award className="w-4 h-4 text-cyan-400" />
          <span>Номинации</span>
        </button>
      </div>

      {activeTab === 'standings' ? (
        <TournamentStandingsView tournamentId={tournamentId} refreshTrigger={refreshTrigger} />
      ) : activeTab === 'nominations' ? (
        <TournamentNominationsView tournamentId={tournamentId} refreshTrigger={refreshTrigger} />
      ) : (
        <>
          {/* Roster / Participants Accordion */}
          <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-text-primary">Состав участников (10 человек)</h3>
              </div>
              {isDraft && (
                <button
                  onClick={() => setShowEditRosterModal(true)}
                  className="text-xs text-accent hover:underline font-bold"
                >
                  Изменить состав
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {tournament.participants?.map((p) => (
                <div key={p.id} className="bg-surface-2 p-2.5 rounded-2xl border border-border-soft text-center space-y-0.5">
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[10px] font-bold inline-flex items-center justify-center mb-1">
                    {p.participant_number}
                  </span>
                  <span className="text-xs font-bold text-text-primary block truncate">{p.display_name}</span>
                  {p.player_nickname && p.player_nickname !== p.display_name && (
                    <span className="text-[10px] text-text-muted block truncate">({p.player_nickname})</span>
                  )}
                </div>
              ))}
            </div>
          </div>

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
                  <h3 className="text-base font-bold text-text-primary">Игра №{currentGame.game_number}</h3>
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

                {/* Judge info (Editable ONLY when game is planned) */}
                <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                  <span>Судья:</span>
                  {editingJudge && currentGame.status === 'planned' ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={judgeInput}
                        onChange={(e) => setJudgeInput(e.target.value)}
                        className="bg-surface-1 border border-border-soft rounded px-2 py-0.5 text-xs text-text-primary"
                        placeholder="Имя судьи"
                      />
                      <button onClick={handleSaveJudge} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingJudge(false)} className="p-1 text-text-muted hover:bg-surface-hover rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : currentGame.status === 'planned' ? (
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

              {/* Game Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={currentGame.status === 'planned'}
                  title={currentGame.status === 'planned' ? 'Сначала запустите игру' : ''}
                  onClick={() => {
                    if (currentGame.status !== 'planned') {
                      setProtocolGameId(currentGame.id);
                      setShowGameProtocolModal(true);
                    }
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

                <button
                  type="button"
                  onClick={() => {
                    setSelectedImportGameId(currentGame.id);
                    setShowProtocolImportModal(true);
                  }}
                  className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Загрузить бланк игры</span>
                </button>

                {/* Swap seats allowed ONLY in draft & planned game */}
                {isDraft && currentGame.status === 'planned' && (
                  <button
                    onClick={() => {
                      setSwapSeat1(1);
                      setSwapSeat2(2);
                      setShowSwapModal(true);
                    }}
                    className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
                    <span>Поменять местами</span>
                  </button>
                )}

                {currentGame.status === 'planned' && (
                  <button
                    onClick={handleStartGame}
                    disabled={actionLoading || !canStartCurrentGame}
                    className={`font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[40px] ${
                      canStartCurrentGame
                        ? 'bg-accent hover:bg-accent-hover text-white cursor-pointer shadow-lg shadow-accent/20'
                        : 'bg-surface-1 text-text-muted border border-border-soft opacity-60 cursor-not-allowed'
                    }`}
                    title={
                      tournament.status !== 'active'
                        ? 'Запуск разрешен только в активном турнире (запустите турнир сначала)'
                        : isAnotherGameActive
                        ? `Сначала завершите игру №${activeGameInTournament?.game_number}`
                        : !isRolesValid
                        ? 'Назначьте ровно: 6 мирных, 1 Шериф, 2 мафии, 1 Дон'
                        : ''
                    }
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Запустить игру №{currentGame.game_number}</span>
                  </button>
                )}
              </div>
            </div>

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
              <span className="text-xs font-bold text-text-secondary block">
                Рассадка на игру №{currentGame.game_number}
                {currentGame.status !== 'planned' && ' (заблокирована для изменений)'}:
              </span>
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
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-text-primary block truncate">
                            {seat.display_name}
                          </span>
                        </div>
                      </div>

                      {/* Role selection dropdown (Disabled when game is active or completed) */}
                      {currentGame.status === 'planned' ? (
                        <select
                          value={seat.role || ''}
                          onChange={(e) => handleAssignRole(seat.seat_number, e.target.value || null)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none cursor-pointer ${
                            roleObj ? roleObj.color : 'bg-surface-1 text-text-muted border-border-soft'
                          }`}
                        >
                          <option value="" className="bg-surface-1 text-text-muted">-- Роль не выбрана --</option>
                          <option value="citizen" className="bg-surface-1 text-emerald-400 font-semibold">Мирный (6)</option>
                          <option value="sheriff" className="bg-surface-1 text-amber-400 font-semibold">Шериф (1)</option>
                          <option value="mafia" className="bg-surface-1 text-rose-400 font-semibold">Мафия (2)</option>
                          <option value="don" className="bg-surface-1 text-purple-400 font-semibold">Дон (1)</option>
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
          </div>
        )}
      </div>
        </>
      )}

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
      {showSwapModal && isDraft && currentGame?.status === 'planned' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-sm w-full p-6 space-y-4 text-text-primary">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Перестановка мест</h3>
              <button onClick={() => setShowSwapModal(false)} className="text-text-muted hover:text-text-primary p-1 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              Выберите два места в Игра №{currentGame?.game_number}, которые нужно поменять местами:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-text-secondary font-semibold mb-1">Первое место</label>
                <select
                  value={swapSeat1}
                  onChange={(e) => setSwapSeat1(parseInt(e.target.value))}
                  className="w-full bg-surface-2 border border-border-soft rounded-xl p-2.5 text-text-primary font-bold focus:outline-none"
                >
                  {seats.map((s) => (
                    <option key={s.id} value={s.seat_number}>
                      Место #{s.seat_number} — {s.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-text-secondary font-semibold mb-1">Второе место</label>
                <select
                  value={swapSeat2}
                  onChange={(e) => setSwapSeat2(parseInt(e.target.value))}
                  className="w-full bg-surface-2 border border-border-soft rounded-xl p-2.5 text-text-primary font-bold focus:outline-none"
                >
                  {seats.map((s) => (
                    <option key={s.id} value={s.seat_number}>
                      Место #{s.seat_number} — {s.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSwapSeats}
                  disabled={actionLoading}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer min-h-[44px]"
                >
                  {actionLoading ? 'Выполнение...' : 'Поменять местами'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSwapModal(false)}
                  className="bg-surface-2 text-text-secondary font-bold px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Protocol Blank Import Modal */}
      {showProtocolImportModal && (
        <ProtocolImportModal
          tournamentId={tournamentId}
          games={tournament.games || []}
          preselectedGameId={selectedImportGameId}
          onClose={() => setShowProtocolImportModal(false)}
          onSuccess={() => {
            setShowProtocolImportModal(false);
            setFeedbackMsg({ type: 'success', text: 'Протокол игры успешно сохранён в черновик!' });
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
            loadDetail();
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
        onClose={() => setShowReopenModal(false)}
        onConfirm={handleReopenTournament}
      />
    </div>
  );
};
