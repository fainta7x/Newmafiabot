import { useState } from 'react';
import { api, type Tournament, type TournamentGame, type TournamentGameSeat } from '../../../lib/api.ts';
import { validateRoleAssignmentChange } from '../../../lib/tournamentRoleValidation.ts';
import { tournamentGameEditRights } from './tournamentGameEditRights.ts';

type Feedback = { type: 'success' | 'error'; text: string } | null;

type Options = {
  tournamentId: string;
  tournament: Tournament | null;
  selectedGameIdx: number;
  loadDetail: (opts?: { silent?: boolean }) => Promise<void>;
  setTournament: (tournament: Tournament) => void;
  /** After a start the screen moves to «Игры». */
  goToGames: () => void;
};

/**
 * Everything an organizer does to a tournament from its card: start, complete, reopen, cancel, correct or reset a game,
 * shuffle or swap seats, assign roles, change the judge, send the seats. Each action is the same chain — confirm, call
 * the API, say what happened, reload — and the card only shows the state.
 */
export const useTournamentActions = ({ tournamentId, tournament, selectedGameIdx, loadDetail, setTournament, goToGames }: Options) => {
  const games: TournamentGame[] = tournament?.games || [];
  const currentGame: TournamentGame | undefined = games[selectedGameIdx];
  const seats: TournamentGameSeat[] = currentGame?.seats || [];
  const rights = tournament ? tournamentGameEditRights(tournament.status, games, currentGame) : null;
  const canEditCurrentGameJudgeAndRoles = rights?.canEditCurrentGameJudgeAndRoles ?? false;

  const [showStartModal, setShowStartModal] = useState(false);
  const [startModalLoading, setStartModalLoading] = useState(false);
  const [startModalError, setStartModalError] = useState<string | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapSeat1, setSwapSeat1] = useState<number>(1);
  const [swapSeat2, setSwapSeat2] = useState<number>(2);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<Feedback>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  // «Исправить» on a game of a completed tournament: the game to reopen once the tournament is back in correction.
  const [correctGameAfterReopen, setCorrectGameAfterReopen] = useState<string | null>(null);
  const [editingJudge, setEditingJudge] = useState(false);
  const [judgeInput, setJudgeInput] = useState('');

  const handleCompleteTournament = async () => {
    // This is passed as onConfirm to ConfirmCompleteTournamentModal
    await api.completeTournament(tournamentId);
    setFeedbackMsg({
      type: 'success',
      text: 'Турнир успешно официально завершён! Все результаты зафиксированы.',
    });
    loadDetail();
  };

  // «Исправить» on a completed game (owner, 2026-10-22): reopen it right here; a completed tournament is reopened first.
  const handleCorrectGame = async (gameId: string) => {
    if (tournament?.status === 'completed') {
      setCorrectGameAfterReopen(gameId);
      setShowReopenModal(true);
      return;
    }
    setActionLoading(true);
    try {
      await api.revertGameProtocolToDraft(tournamentId, gameId);
      setFeedbackMsg({ type: 'success', text: 'Игра открыта для правки: можно менять судью, роли, места и протокол.' });
      await loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось открыть игру для правки' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenTournament = async () => {
    try {
      await api.reopenTournamentForCorrection(tournamentId);
      if (correctGameAfterReopen) {
        const gameId = correctGameAfterReopen;
        setCorrectGameAfterReopen(null);
        // The tournament is already reopened: if the game step fails, reload so «Исправить» retries only that step.
        try {
          await api.revertGameProtocolToDraft(tournamentId, gameId);
          setFeedbackMsg({ type: 'success', text: 'Турнир открыт для исправления, игра открыта для правки. Публичные результаты скрыты до повторного завершения.' });
        } catch (gameErr: any) {
          setFeedbackMsg({ type: 'error', text: `Турнир открыт для исправления, но игру открыть не удалось: ${gameErr?.message || 'ошибка'}. Нажмите «Исправить» ещё раз.` });
        }
        await loadDetail();
        return;
      }
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
      goToGames();
    } catch (err: any) {
      setStartModalError(err.message || 'Ошибка запуска турнира');
    } finally {
      setStartModalLoading(false);
    }
  };

  const handleRegenerateSeating = async () => {
    if (!confirm(`Сгенерировать новую случайную рассадку для всех ${(tournament?.games || []).length || 10} игр?`)) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.generateTournamentSeating(tournamentId);
      setFeedbackMsg({ type: 'success', text: 'Случайная рассадка успешно перегенерирована!' });
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка генерации рассадки' });
    } finally {
      setActionLoading(false);
    }
  };

  // The tournament will not be played: registered players are told, the card stays as «Отменён».
  const handleCancelTournament = async () => {
    if (!confirm('Отменить турнир? Все записанные игроки получат сообщение об отмене. Это нельзя вернуть.')) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      const result = await api.cancelTournament(tournamentId);
      setFeedbackMsg({ type: 'success', text: `Турнир отменён. Игроков уведомлено: ${result.notified}` });
      await loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось отменить турнир' });
    } finally {
      setActionLoading(false);
    }
  };

  // A game started by mistake: back to «planned», its unfinished draft protocol is discarded.
  const handleResetGameToPlanned = async () => {
    if (!currentGame) return;
    if (!confirm(`Вернуть игру №${currentGame.game_number} в план? Незавершённый протокол и ход игры будут сброшены, рассадка и роли останутся.`)) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.resetTournamentGameToPlanned(tournamentId, String(currentGame.id));
      // Only this game's leftovers: the shared engine session and this game's evidence/votes (club or other games stay).
      try {
        ['mafia_live_session', `mafia_live_session:tournament:${currentGame.id}:protocol`, `mafia_live_broadcast_votes:tournament:${tournamentId}:${currentGame.id}`]
          .forEach((key) => localStorage.removeItem(key));
      } catch { /* storage may be blocked */ }
      setFeedbackMsg({ type: 'success', text: `Игра №${currentGame.game_number} снова запланирована` });
      await loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось вернуть игру в план' });
    } finally {
      setActionLoading(false);
    }
  };

  // Force majeure: drop the last game that was never started, so the tournament is shorter by one game.
  const handleDropLastGame = async () => {
    const total = (tournament?.games || []).length;
    if (!confirm(`Убрать игру №${total} и играть турнир в ${total - 1} игр? Сыгранные игры не затрагиваются.`)) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      await api.setTournamentGameCount(tournamentId, total - 1);
      setFeedbackMsg({ type: 'success', text: `Теперь в турнире ${total - 1} игр` });
      await loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось убрать игру' });
    } finally {
      setActionLoading(false);
    }
  };

  // Sends «ты сидишь на месте N» to the players of the next game now (otherwise it goes by itself 30 minutes before the start).
  const handleSendSeatMessages = async () => {
    if (!confirm('Разослать игрокам личные сообщения, где они сидят в ближайшей игре?')) return;
    setActionLoading(true);
    setFeedbackMsg(null);
    try {
      const result = await api.sendTournamentSeatMessages(tournamentId);
      const missing = result.unreachable > 0
        ? ` У ${result.unreachable} из ${result.players} нет привязанного Telegram/VK или личные сообщения выключены, им не дойдёт.`
        : '';
      if (result.reached === 0) {
        setFeedbackMsg({ type: 'error', text: `Места игры №${result.game_number} никому не дошли: ни у кого из игроков нет привязанного Telegram/VK или личные сообщения выключены.` });
      } else if (result.new_sent === 0) {
        setFeedbackMsg({ type: 'success', text: `Места игры №${result.game_number} уже были разосланы раньше (${result.reached} из ${result.players} игроков).${missing}` });
      } else {
        setFeedbackMsg({ type: 'success', text: `Места игры №${result.game_number} отправлены в личные сообщения: ${result.reached} из ${result.players} игроков.${missing}` });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Не удалось разослать места' });
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
    if (!currentGame || !canEditCurrentGameJudgeAndRoles) return;
    const validation = validateRoleAssignmentChange(seats, seatNumber, newRole);
    if (!validation.allowed) {
      setFeedbackMsg({
        type: 'error',
        text: validation.error || 'Нельзя назначить данную роль: лимит заполнен',
      });
      return;
    }
    try {
      const updatedRoles = seats.map((s) =>
        s.seat_number === seatNumber ? { seat_number: s.seat_number, role: newRole } : { seat_number: s.seat_number, role: s.role }
      );
      await api.updateGameRoles(tournamentId, currentGame.id, updatedRoles);
      const nextSeats = seats.map((s) => (s.seat_number === seatNumber ? { ...s, role: newRole } : s));
      const nextGames = games.map((g) => (g.id === currentGame.id ? { ...g, seats: nextSeats } : g));
      if (tournament) setTournament({ ...tournament, games: nextGames });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка назначения роли' });
    }
  };

  const handleSaveJudge = async () => {
    if (!currentGame || !canEditCurrentGameJudgeAndRoles) return;
    try {
      await api.updateGameJudge(tournamentId, currentGame.id, judgeInput.trim());
      setEditingJudge(false);
      loadDetail();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка обновления судьи' });
    }
  };


  return {
    feedbackMsg, setFeedbackMsg, actionLoading,
    showStartModal, setShowStartModal, startModalLoading, startModalError,
    showSwapModal, setShowSwapModal, swapSeat1, setSwapSeat1, swapSeat2, setSwapSeat2,
    showCompleteModal, setShowCompleteModal, showReopenModal, setShowReopenModal, correctGameAfterReopen, setCorrectGameAfterReopen,
    editingJudge, setEditingJudge, judgeInput, setJudgeInput,
    handleCompleteTournament, handleCorrectGame, handleReopenTournament,
    handleOpenStartModal, handleConfirmStartTournament, handleRegenerateSeating, handleCancelTournament,
    handleResetGameToPlanned, handleDropLastGame, handleSendSeatMessages, handleSwapSeats, handleAssignRole, handleSaveJudge,
  };
};
