import React, { useState, useEffect } from 'react';
import { Clock, Image as ImageIcon } from 'lucide-react';
import {
  api,
  TournamentGame,
  TournamentGameProtocolData,
  PlayerResultData,
  Tournament
} from '../../../lib/api';
import { ResultsImageExportModal } from './ResultsImageExportModal.tsx';
import { ProtocolCompletionDialogs } from './protocol/ProtocolCompletionDialogs';
import {
  ProtocolDisciplineConfirmDialog,
  type PendingProtocolDisciplineAction
} from './protocol/ProtocolDisciplineConfirmDialog';
import {
  ProtocolExitTypeConfirmDialog,
  type PendingProtocolExitTypeChange
} from './protocol/ProtocolExitTypeConfirmDialog';
import { ProtocolFirstKilledConfirmDialog } from './protocol/ProtocolFirstKilledConfirmDialog';
import { ProtocolZeroRoundConfirmDialog } from './protocol/ProtocolZeroRoundConfirmDialog';
import { TournamentPointsView } from './protocol/TournamentPointsView';
import { useMobileKeyboardViewport } from '../../../hooks/useMobileKeyboardViewport';
import {
  buildLegacyTechFoulClassification,
  getProtocolPayload
} from './protocol/protocolUtils';
import { getOppositeTeam } from './protocol/protocolStateUtils';
import {
  type DisciplineActionType,
  type TechFoulType,
  getConfirmedPlayerDisciplineUpdates,
  getRegularFoulChange,
  getTechFoulChange
} from './protocol/protocolDisciplineUtils';
import {
  findUnclassifiedTechFouls,
  hasUnclassifiedTechFouls,
  removeProtocolLocalBackup,
  writeBlockedProtocolLocalBackup,
  writeProtocolLocalBackup
} from './protocol/protocolPersistenceUtils';
import { validateProtocolCompletion } from './protocol/protocolValidationUtils';
import { ProtocolWorkspace } from '../gameProtocol/ProtocolWorkspace';
import { useProtocolEditing } from '../gameProtocol/useProtocolEditing';
import { useProtocolAutosave } from '../gameProtocol/useProtocolAutosave';
import type { ProtocolState } from '../gameProtocol/protocolReview';
import type { ProtocolApi } from '../gameProtocol/types';

export {
  buildLegacyTechFoulClassification,
  formatColorMark,
  formatSignedBonus,
  getProtocolPayload,
  strictParseDecimal
} from './protocol/protocolUtils';

interface GameProtocolModalProps {
  tournamentId: string;
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
  onProtocolUpdated?: () => void;
}

/**
 * The protocol of a tournament game. The window, its places and every edit are the club protocol's (gameProtocol/); this
 * component loads and saves the tournament game, keeps the emergency browser backup, asks before the changes that cost
 * points, and adds the judge's points.
 */
export const GameProtocolModal: React.FC<GameProtocolModalProps> = ({
  tournamentId,
  gameId,
  isOpen,
  onClose,
  onProtocolUpdated
}) => {
  useMobileKeyboardViewport();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [game, setGame] = useState<TournamentGame | null>(null);
  const [protocol, setProtocol] = useState<TournamentGameProtocolData>({
    game_id: gameId,
    status: 'draft',
    winner_team: null,
    first_killed_participant_id: null,
    zero_round_voted_participant_id: null,
    best_move_participant_id: null,
    best_move_source: null,
    best_move_seats: [],
    best_moves: [],
    votes: [],
    shots: [],
    replacement: null,
    judge_notes: null,
    best_move_score: 0
  });
  const [playerResults, setPlayerResults] = useState<PlayerResultData[]>([]);
  // The club and the tournament protocol share one autosave (architecture programme, 2026-10-26). An edit is kept in the
  // browser as an emergency backup at once and sent after 1.5 s; unclassified old technical fouls hold the save back.
  const autosave = useProtocolAutosave({
    active: isOpen && !loading && protocol.status !== 'completed',
    protocol, playerResults, setProtocol, setPlayerResults,
    send: (nextProtocol, nextResults) => api.saveGameProtocol(tournamentId, gameId, getProtocolPayload(nextProtocol, nextResults)),
    echoOf: (res) => ({ protocol: res.protocol, player_results: res.player_results }),
    delayMs: 1500,
    hold: (nextProtocol, nextResults) => {
      if (!hasUnclassifiedTechFouls(nextResults)) return null;
      // Keep the emergency browser artifact even while server save is blocked.
      writeBlockedProtocolLocalBackup(gameId, nextProtocol, nextResults);
      return 'Сначала классифицируйте старые техфолы';
    },
    onEdit: (nextProtocol, nextResults) => writeProtocolLocalBackup(gameId, nextProtocol, nextResults),
  });
  const [baseline, setBaseline] = useState<ProtocolState | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Modals for confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCiConfirmModal, setShowCiConfirmModal] = useState(false);
  const [pendingFirstKilledId, setPendingFirstKilledId] = useState<string | null>(null);
  const [showZeroRoundConfirmModal, setShowZeroRoundConfirmModal] = useState(false);
  const [pendingZeroRoundVotedId, setPendingZeroRoundVotedId] = useState<string | null>(null);
  const [pendingExitTypeConfirm, setPendingExitTypeConfirm] = useState<PendingProtocolExitTypeChange | null>(null);
  const [pendingDisciplineAction, setPendingDisciplineAction] = useState<PendingProtocolDisciplineAction | null>(null);
  const [oldTechFoulsToFix, setOldTechFoulsToFix] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen || !gameId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getGameProtocol(tournamentId, gameId)
      .then(async (res) => {
        if (!isMounted) return;
        try {
          const tRes = await api.getTournament(tournamentId);
          if (isMounted) setTournament(tRes);
        } catch (tErr) {
          console.error('Failed to load tournament detail in GameProtocolModal:', tErr);
        }
        setGame(res.game);
        setProtocol(res.protocol);
        setPlayerResults(res.player_results);
        setBaseline({ protocol: res.protocol, results: res.player_results });
        autosave.markSaved(res.protocol, res.player_results);
        // An older emergency backup in the browser is never replayed over the server data; it is replaced by it.
        writeProtocolLocalBackup(gameId, res.protocol, res.player_results);

      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Не удалось загрузить протокол');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tournamentId, gameId]);


  useEffect(() => {
    if (!loading && playerResults.length > 0) {
      setOldTechFoulsToFix(findUnclassifiedTechFouls(playerResults));
    }
  }, [loading, playerResults]);


  const handleModalClose = async () => {
    if (protocol.status !== 'completed' && !(await autosave.flush())) {
      autosave.setSaveError('Последние изменения не сохранены');
      autosave.setSaveState('error');
      return;
    }
    onClose();
  };

  // Helper to update player result

  // The edits are the club protocol's; a tournament only asks first where a change costs points.
  const editing = useProtocolEditing({
    protocol, setProtocol, playerResults, setPlayerResults,
    guards: {
      updateResult: (participantId, updates) => {
        if (updates.exit_type === undefined) return false;
        const target = playerResults.find((player) => player.participant_id === participantId);
        if (target && target.exit_type === 'killed' && updates.exit_type !== 'killed' && target.color_protocol && target.color_protocol.length > 0) {
          setPendingExitTypeConfirm({ participantId, newExitType: updates.exit_type, playerName: target.display_name, seatNum: target.seat_number });
          return true;
        }
        return false;
      },
      firstKilled: (newId) => {
        const prevId = protocol.first_killed_participant_id;
        if (newId === prevId || !prevId) return false;
        const prevMove = protocol.best_moves?.find((move) => move.source === 'first_killed');
        const hasOldNumbers = !!prevMove && prevMove.seat_numbers.length > 0;
        const prevPlayer = playerResults.find((player) => player.participant_id === prevId);
        const hasManualCi = !!prevPlayer && Number(prevPlayer.ci_points || 0) !== 0;
        if (!hasOldNumbers && !hasManualCi) return false;
        setPendingFirstKilledId(newId);
        setShowCiConfirmModal(true);
        return true;
      },
      zeroRoundVoted: (newId) => {
        const prevId = protocol.zero_round_voted_participant_id;
        if (newId === prevId || !prevId) return false;
        const prevMove = protocol.best_moves?.find((move) => move.source === 'zero_round_voted');
        if (!prevMove || prevMove.seat_numbers.length === 0) return false;
        setPendingZeroRoundVotedId(newId);
        setShowZeroRoundConfirmModal(true);
        return true;
      },
    },
  });
  const { updatePlayerResult } = editing;

  const confirmExitTypeChange = () => {
    if (!pendingExitTypeConfirm) return;
    const { participantId, newExitType } = pendingExitTypeConfirm;
    setPlayerResults((prev) => prev.map((player) => (player.participant_id === participantId ? { ...player, exit_type: newExitType, color_protocol: [] } : player)));
    setPendingExitTypeConfirm(null);
  };

  const handleDisciplineAction = (participantId: string, type: DisciplineActionType, techType?: TechFoulType) => {
    const player = playerResults.find((item) => item.participant_id === participantId);
    if (!player) return;
    setPendingDisciplineAction({ participantId, type, playerName: player.display_name, seatNum: player.seat_number, techType });
  };

  const confirmDisciplineAction = () => {
    if (!pendingDisciplineAction) return;
    const { participantId, type, techType } = pendingDisciplineAction;
    const player = playerResults.find((item) => item.participant_id === participantId);
    if (type === 'ppk') {
      if (player) {
        const winnerTeam = getOppositeTeam(player.role);
        if (!winnerTeam) {
          setError(`Не удалось определить победителя по ППК: роль игрока #${player.seat_number} не установлена`);
          setPendingDisciplineAction(null);
          return;
        }
        setProtocol((prev) => ({ ...prev, end_reason: 'ppk', ppk_culprit_participant_id: participantId, winner_team: winnerTeam }));
      }
    } else if (type === 'cancel_ppk') {
      setProtocol((prev) => ({ ...prev, end_reason: 'normal', ppk_culprit_participant_id: null, winner_team: null }));
    } else if (player) {
      const updates = getConfirmedPlayerDisciplineUpdates(player, type, techType);
      if (updates) updatePlayerResult(participantId, updates);
    }
    setPendingDisciplineAction(null);
  };

  const confirmFirstKilledChange = () => {
    const prevId = protocol.first_killed_participant_id;
    // The compensation points belonged to the previous first killed: they go with him.
    editing.applyFirstKilled(pendingFirstKilledId, (results) => results.map((player) => (player.participant_id === prevId ? { ...player, ci_points: 0 } : player)));
    setShowCiConfirmModal(false);
    setPendingFirstKilledId(null);
  };

  const confirmZeroRoundVotedChange = () => {
    editing.applyZeroRoundVoted(pendingZeroRoundVotedId);
    setShowZeroRoundConfirmModal(false);
    setPendingZeroRoundVotedId(null);
  };

  const classifyTechFoul = (participantId: string, minor: number, major: number) => {
    const updates = buildLegacyTechFoulClassification(minor, major);

    editing.updatePlayerResult(participantId, updates);
    setOldTechFoulsToFix(prev => {
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
  };


  // Validate protocol on client side before completing
  const validateBeforeComplete = (): string | null => {
    const validation = validateProtocolCompletion(
      protocol,
      playerResults,
      Object.keys(oldTechFoulsToFix).length > 0
    );

    if (validation.source === 'voting' && validation.errorMsg) {
      return validation.errorMsg;
    }

    if (validation.errorMsg) {
      return validation.errorMsg;
    }

    return null;
  };


  const handleComplete = async () => {
    const valErr = validateBeforeComplete();
    if (valErr) {
      setError(valErr);
      setShowCompleteConfirm(false);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = getProtocolPayload(protocol, playerResults);

      const res = await api.completeGameProtocol(tournamentId, gameId, payload);
      setProtocol(res.protocol);
      setPlayerResults(res.player_results);
      if (res.game) setGame(res.game);
      autosave.markSaved(res.protocol, res.player_results);
      setBaseline({ protocol: res.protocol, results: res.player_results });
      setShowCompleteConfirm(false);

      if (res.checkpoint_warning) {
        alert('Протокол завершён, но возникла ошибка при создании резервной копии базы данных:\n\n' + res.checkpoint_warning);
      }

      // Clear the emergency browser backup after successful completion.
      removeProtocolLocalBackup(gameId);

      if (onProtocolUpdated) onProtocolUpdated();
    } catch (err: any) {
      setError(err.message || 'Не удалось завершить протокол');
    } finally {
      setSubmitting(false);
    }
  };


  // Handle Revert to Draft
  const handleRevertToDraft = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await api.revertGameProtocolToDraft(tournamentId, gameId);
      setProtocol(res.protocol);
      setPlayerResults(res.player_results);
      if (res.game) setGame(res.game);
      autosave.markSaved(res.protocol, res.player_results);
      setBaseline({ protocol: res.protocol, results: res.player_results });
      setShowRevertConfirm(false);

      if (res.checkpoint_warning) {
        alert('Протокол открыт для правки, но резервная копия базы не сохранилась:\n\n' + res.checkpoint_warning);
      }

      if (onProtocolUpdated) onProtocolUpdated();
    } catch (err: any) {
      setError(err.message || 'Не удалось открыть протокол для правки');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const pendingDisciplinePlayer = pendingDisciplineAction
    ? playerResults.find((player) => player.participant_id === pendingDisciplineAction.participantId)
    : null;
  const pendingDisciplineWinnerTeam = getOppositeTeam(pendingDisciplinePlayer?.role || null);

  const locked = protocol.status === 'completed';
  const api2: ProtocolApi = {
    protocol, results: playerResults, locked, tableSize: playerResults.length, zeroRoundRule: 'tournament',
    ...editing.members,
    // Fouls, removals and the PPK end the game for a player: a tournament asks with its own dialog first.
    changeRegularFoul: (player, delta) => {
      const change = getRegularFoulChange(player, delta);
      if (change.kind === 'confirm') handleDisciplineAction(player.participant_id, change.action);
      else if (change.kind === 'update') updatePlayerResult(player.participant_id, change.updates);
    },
    changeTechFoul: (player, type, delta) => {
      const change = getTechFoulChange(player, type, delta);
      if (change.kind === 'confirm') handleDisciplineAction(player.participant_id, change.action, change.techType);
      else if (change.kind === 'update') updatePlayerResult(player.participant_id, change.updates);
    },
    causePpk: (player) => handleDisciplineAction(player.participant_id, 'ppk'),
    cancelPpk: () => { if (protocol.ppk_culprit_participant_id) handleDisciplineAction(protocol.ppk_culprit_participant_id, 'cancel_ppk'); },
    removeByJudge: (player) => handleDisciplineAction(player.participant_id, 'direct_removal'),
    cancelRemoval: (player) => handleDisciplineAction(player.participant_id, 'cancel_direct'),
  };
  const { saveState: saveStatus, saveError: saveErrorMessage } = autosave;
  const saveLabel = saveStatus === 'saving' ? { label: 'Сохраняем…', tone: 'neutral' as const }
    : saveStatus === 'unsaved' ? { label: 'Есть несохранённые изменения', tone: 'warn' as const }
      : saveStatus === 'error' ? { label: 'Не сохранилось', tone: 'bad' as const }
        : { label: 'Сохранено', tone: 'good' as const };
  const problem = error || (saveErrorMessage ? `Ошибка автосохранения: ${saveErrorMessage}` : null);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-[#090a0d] text-white/60" data-testid="protocol-window">
        <Clock className="h-8 w-8 animate-spin" aria-hidden="true" />
        <span className="text-sm font-medium">{error || 'Загрузка данных протокола...'}</span>
        {error ? <button type="button" onClick={() => void handleModalClose()} className="min-h-11 rounded-2xl bg-white/[0.08] px-5 text-sm font-semibold text-white">Закрыть</button> : null}
      </div>
    );
  }

  return (
    <>
      <ProtocolWorkspace
        api={api2}
        title={`Игра #${game?.game_number || 1}`}
        subtitle={`Судья: ${game?.judge_name || 'Не указан'}`}
        save={saveLabel}
        saveError={problem}
        baseline={baseline}
        busy={submitting}
        onRevert={editing.revertChange}
        onConfirm={() => {
          const valErr = validateBeforeComplete();
          if (valErr) setError(valErr);
          else { setError(null); setShowCompleteConfirm(true); }
        }}
        onReopen={() => setShowRevertConfirm(true)}
        onClose={() => void handleModalClose()}
        resetKey={gameId}
        extra={{ points: <TournamentPointsView api={api2} oldTechFouls={oldTechFoulsToFix} onClassify={classifyTechFoul} /> }}
        resultExtra={locked ? (
          <button
            type="button"
            id={`btn-protocol-${game?.game_number || 'export'}-png-results-trigger`}
            onClick={() => setIsExportModalOpen(true)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.10] px-4 text-sm font-semibold text-emerald-100"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />Результаты PNG
          </button>
        ) : null}
      />
      <ProtocolDisciplineConfirmDialog
        pending={pendingDisciplineAction}
        winnerTeam={pendingDisciplineWinnerTeam}
        onCancel={() => setPendingDisciplineAction(null)}
        onConfirm={confirmDisciplineAction}
      />
      <ProtocolExitTypeConfirmDialog
        pending={pendingExitTypeConfirm}
        onCancel={() => setPendingExitTypeConfirm(null)}
        onConfirm={confirmExitTypeChange}
      />
      <ProtocolCompletionDialogs
        protocol={protocol}
        playerResults={playerResults}
        showCompleteConfirm={showCompleteConfirm}
        showRevertConfirm={showRevertConfirm}
        submitting={submitting}
        onCancelComplete={() => setShowCompleteConfirm(false)}
        onConfirmComplete={handleComplete}
        onCancelRevert={() => setShowRevertConfirm(false)}
        onConfirmRevert={handleRevertToDraft}
      />
      <ProtocolFirstKilledConfirmDialog
        isOpen={showCiConfirmModal}
        onCancel={() => {
          setShowCiConfirmModal(false);
          setPendingFirstKilledId(null);
        }}
        onConfirm={confirmFirstKilledChange}
      />
      <ProtocolZeroRoundConfirmDialog
        isOpen={showZeroRoundConfirmModal}
        onCancel={() => {
          setShowZeroRoundConfirmModal(false);
          setPendingZeroRoundVotedId(null);
        }}
        onConfirm={confirmZeroRoundVotedChange}
      />
      {tournament && isExportModalOpen && (
        <ResultsImageExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          tournament={tournament}
          exportType="game"
          gameId={gameId}
          gameNumber={game?.game_number}
        />
      )}
    </>
  );
};
