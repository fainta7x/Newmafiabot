import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Users,
  Vote,
  Moon,
  FileCheck,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon
} from 'lucide-react';
import {
  api,
  TournamentGame,
  TournamentGameProtocolData,
  PlayerResultData,
  Tournament
} from '../../../lib/api';
import { ResultsImageExportModal } from './ResultsImageExportModal.tsx';
import { calculateDisciplinaryPenalty } from '../../../lib/gameDiscipline';
import {
  determineVotingResult,
  createNextRevoteRound,
  cleanAndSyncVotes,
  validateVotingHierarchy
} from '../../../shared/tournamentVoting';
import { ProtocolVotingTab } from './protocol/ProtocolVotingTab';
import { ProtocolNightsTab } from './protocol/ProtocolNightsTab';
import { ProtocolSummaryTab } from './protocol/ProtocolSummaryTab';
import { PlayerColorProtocolEditor } from './protocol/PlayerColorProtocolEditor';
import { PointStepper, roundTenths } from './protocol/PointStepper';
import { useMobileKeyboardViewport } from '../../../hooks/useMobileKeyboardViewport';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';
import {
  buildLegacyTechFoulClassification,
  formatColorMark,
  getProtocolPayload
} from './protocol/protocolUtils';
import {
  calculateGuessedBlacks as calculateGuessedBlacksForResults,
  getOppositeTeam,
  recalculateVoteRemainder,
  syncAllEventsToResults
} from './protocol/protocolStateUtils';
import {
  type DisciplineActionType,
  type TechFoulType,
  getConfirmedPlayerDisciplineUpdates,
  getRegularFoulChange,
  getTechFoulChange
} from './protocol/protocolDisciplineUtils';
import {
  type ColorMarkEditState,
  type ColorMarkType,
  addColorMarkToResults,
  createColorMarkEditState,
  deleteColorMarkFromResults,
  moveColorMarkInResults,
  saveEditedColorMarkToResults,
  setColorMarkEditType,
  toggleColorMarkEditSeat,
  toggleColorSeatInList
} from './protocol/protocolColorUtils';
import {
  type ProtocolLocalBackup,
  findUnclassifiedTechFouls,
  getProtocolBackupKey,
  hasUnclassifiedTechFouls,
  parseRestorableProtocolBackup,
  serializeBlockedProtocolBackup,
  serializeProtocolLocalBackup
} from './protocol/protocolPersistenceUtils';
import {
  getProtocolPlayerPresentation
} from './protocol/protocolPlayerPresentationUtils';

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

export const GameProtocolModal: React.FC<GameProtocolModalProps> = ({
  tournamentId,
  gameId,
  isOpen,
  onClose,
  onProtocolUpdated
}) => {
  useMobileKeyboardViewport();
  const [activeTab, setActiveTab] = useState<'players' | 'votes' | 'nights' | 'summary'>('players');
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
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Color Protocol builder state per player
  const [selectedColorSeats, setSelectedColorSeats] = useState<Record<string, number[]>>({});
  const [selectedColorMark, setSelectedColorMark] = useState<Record<string, ColorMarkType>>({});

  // Voting states
  const [voteDrafts, setVoteDrafts] = useState<Record<string, string>>({});
  const [highlightedRoundIdx, setHighlightedRoundIdx] = useState<number | null>(null);
  const roundRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (activeTab === 'votes' && highlightedRoundIdx !== null) {
      setTimeout(() => {
        const el = roundRefs.current[highlightedRoundIdx];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [activeTab, highlightedRoundIdx]);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const isLoadingRef = useRef(true);
  const isUpdatingFromServer = useRef(false);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const dirtyRevision = useRef(0);
  const lastSavedRevision = useRef(0);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  const protocolRef = useRef(protocol);
  const playerResultsRef = useRef(playerResults);

  useEffect(() => {
    protocolRef.current = protocol;
  }, [protocol]);

  useEffect(() => {
    playerResultsRef.current = playerResults;
  }, [playerResults]);

  // Modals for confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // First killed change & Ci reset confirmation
  const [showCiConfirmModal, setShowCiConfirmModal] = useState(false);
  const [pendingFirstKilledId, setPendingFirstKilledId] = useState<string | null>(null);

  // Zero round voted change & BM reset confirmation
  const [showZeroRoundConfirmModal, setShowZeroRoundConfirmModal] = useState(false);
  const [pendingZeroRoundVotedId, setPendingZeroRoundVotedId] = useState<string | null>(null);

  // Color protocol entry editing state
  const [editingColorMarkMap, setEditingColorMarkMap] = useState<
    Record<string, ColorMarkEditState | null>
  >({});

  const [pendingExitTypeConfirm, setPendingExitTypeConfirm] = useState<{
    participantId: string;
    newExitType: PlayerResultData['exit_type'];
    playerName: string;
    seatNum: number;
  } | null>(null);

  // Discipline confirmations
  const [pendingDisciplineAction, setPendingDisciplineAction] = useState<{
    participantId: string;
    type: DisciplineActionType;
    playerName: string;
    seatNum: number;
    techType?: TechFoulType;
  } | null>(null);

  const [oldTechFoulsToFix, setOldTechFoulsToFix] = useState<Record<string, number>>({});



  // Load Protocol Data
  useEffect(() => {
    if (!isOpen || !gameId) return;

    let isMounted = true;
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    let restoredBackupData: ProtocolLocalBackup | null = null;

    api.getGameProtocol(tournamentId, gameId)
      .then(async (res) => {
        if (!isMounted) return;
        try {
          const tRes = await api.getTournament(tournamentId);
          if (isMounted) setTournament(tRes);
        } catch (tErr) {
          console.error('Failed to load tournament detail in GameProtocolModal:', tErr);
        }
        isUpdatingFromServer.current = true;
        setGame(res.game);
        setProtocol(res.protocol);
        setPlayerResults(res.player_results);
        protocolRef.current = res.protocol;
        playerResultsRef.current = res.player_results;
        setSaveStatus('saved');
        dirtyRevision.current = 0;
        lastSavedRevision.current = 0;

        // Restore backup from localStorage if available and draft is newer
        const backupKey = getProtocolBackupKey(gameId);
        const restoredBackup = parseRestorableProtocolBackup(
          localStorage.getItem(backupKey),
          res.protocol.status,
          res.protocol.updated_at
        );
        if (restoredBackup) {
          restoredBackupData = restoredBackup;
          setProtocol(restoredBackup.protocol);
          setPlayerResults(restoredBackup.playerResults);
          protocolRef.current = restoredBackup.protocol;
          playerResultsRef.current = restoredBackup.playerResults;
          dirtyRevision.current = 1;
          setSaveStatus('unsaved');
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Не удалось загрузить протокол');
      })
      .finally(() => {
        if (isMounted) {
          isLoadingRef.current = false;
          setLoading(false);
          isFirstRender.current = false;
          isUpdatingFromServer.current = false;
          if (restoredBackupData) {
            performSave(true);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tournamentId, gameId]);

  // Detect unclassified tech fouls from old versions
  useEffect(() => {
    if (!loading && playerResults.length > 0) {
      setOldTechFoulsToFix(findUnclassifiedTechFouls(playerResults));
    }
  }, [loading, playerResults]);

  const classifyTechFoul = (participantId: string, minor: number, major: number) => {
    const updates = buildLegacyTechFoulClassification(minor, major);

    updatePlayerResult(participantId, updates);
    setOldTechFoulsToFix(prev => {
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
  };

  // Debounced Auto-save effect
  useEffect(() => {
    if (isFirstRender.current || loading || isLoadingRef.current || !isOpen || protocol.status === 'completed') return;

    if (isUpdatingFromServer.current) {
      isUpdatingFromServer.current = false;
      return;
    }

    dirtyRevision.current++;
    setSaveStatus('unsaved');

    // Save backup to localStorage immediately
    localStorage.setItem(
      getProtocolBackupKey(gameId),
      serializeProtocolLocalBackup(protocol, playerResults)
    );

    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);

    autoSaveTimeout.current = setTimeout(() => {
      performSave();
    }, 1500);

    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    };
  }, [protocol, playerResults]);

  const performSave = (isManual = false): Promise<boolean> => {
    if (protocolRef.current.status === 'completed' || isLoadingRef.current) {
      return Promise.resolve(true);
    }

    if (activeSavePromiseRef.current) {
      pendingSaveRef.current = true;
      return activeSavePromiseRef.current;
    }

    if (!isManual && dirtyRevision.current <= lastSavedRevision.current && saveStatus === 'saved' && !pendingSaveRef.current) {
      return Promise.resolve(true);
    }

    const doSave = async (): Promise<boolean> => {
      isSavingRef.current = true;
      setSaveStatus('saving');
      setSaveErrorMessage(null);

      let success = true;

      while (dirtyRevision.current > lastSavedRevision.current || pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const revisionToSave = dirtyRevision.current;

        try {
          const currentProto = protocolRef.current;
          const currentResults = playerResultsRef.current;

          // Check for unclassified tech fouls
          if (hasUnclassifiedTechFouls(currentResults)) {
            setSaveStatus('unsaved');
            setSaveErrorMessage('Сначала классифицируйте старые техфолы');
            // Backup locally anyway
            localStorage.setItem(
              getProtocolBackupKey(gameId),
              serializeBlockedProtocolBackup(currentProto, currentResults)
            );
            break;
          }

          const payload = getProtocolPayload(currentProto, currentResults);

          const res = await api.saveGameProtocol(tournamentId, gameId, payload);
          lastSavedRevision.current = Math.max(lastSavedRevision.current, revisionToSave);

          if (dirtyRevision.current === revisionToSave) {
            isUpdatingFromServer.current = true;
            setProtocol(res.protocol);
            setPlayerResults(res.player_results);
            setSaveStatus('saved');
          } else {
            setSaveStatus('unsaved');
          }
        } catch (err: any) {
          setSaveStatus('error');
          const errMsg = err.message || 'Ошибка сохранения';
          setSaveErrorMessage(errMsg);
          success = false;
          break;
        }
      }

      isSavingRef.current = false;
      activeSavePromiseRef.current = null;
      return success;
    };

    const promise = doSave();
    activeSavePromiseRef.current = promise;
    return promise;
  };

  const handleModalClose = async () => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);

    if (protocolRef.current.status !== 'completed') {
      if (dirtyRevision.current > lastSavedRevision.current || activeSavePromiseRef.current || pendingSaveRef.current || saveStatus === 'unsaved') {
        const ok = await performSave(true);
        if (!ok || dirtyRevision.current > lastSavedRevision.current) {
          setSaveErrorMessage('Последние изменения не сохранены');
          setSaveStatus('error');
          return;
        }
      }
    }

    onClose();
  };

  // Helper to update player result
  const updatePlayerResult = (participantId: string, updates: Partial<PlayerResultData>) => {
    if (updates.exit_type !== undefined) {
      const targetPlayer = playerResults.find((pr) => pr.participant_id === participantId);
      if (
        targetPlayer &&
        targetPlayer.exit_type === 'killed' &&
        updates.exit_type !== 'killed' &&
        targetPlayer.color_protocol &&
        targetPlayer.color_protocol.length > 0
      ) {
        setPendingExitTypeConfirm({
          participantId,
          newExitType: updates.exit_type,
          playerName: targetPlayer.display_name,
          seatNum: targetPlayer.seat_number
        });
        return;
      }
    }

    setPlayerResults((prev) =>
      prev.map((pr) => (pr.participant_id === participantId ? { ...pr, ...updates } : pr))
    );
  };

  const handleRegularFoulChange = (participantId: string, delta: number) => {
    const player = playerResults.find(p => p.participant_id === participantId);
    if (!player) return;

    const change = getRegularFoulChange(player, delta);
    if (change.kind === 'confirm') {
      handleDisciplineAction(participantId, change.action);
    } else if (change.kind === 'update') {
      updatePlayerResult(participantId, change.updates);
    }
  };

  const handleTechFoulChange = (participantId: string, techType: TechFoulType, delta: number) => {
    const player = playerResults.find(p => p.participant_id === participantId);
    if (!player) return;

    const change = getTechFoulChange(player, techType, delta);
    if (change.kind === 'confirm') {
      handleDisciplineAction(participantId, change.action, change.techType);
    } else if (change.kind === 'update') {
      updatePlayerResult(participantId, change.updates);
    }
  };

  const confirmExitTypeChange = () => {
    if (!pendingExitTypeConfirm) return;
    const { participantId, newExitType } = pendingExitTypeConfirm;
    setPlayerResults((prev) =>
      prev.map((pr) => {
        if (pr.participant_id === participantId) {
          return { ...pr, exit_type: newExitType, color_protocol: [] };
        }
        return pr;
      })
    );
    setPendingExitTypeConfirm(null);
  };

  const handleDisciplineAction = (
    participantId: string,
    type: DisciplineActionType,
    techType?: TechFoulType
  ) => {
    const player = playerResults.find(p => p.participant_id === participantId);
    if (!player) return;
    setPendingDisciplineAction({
      participantId,
      type,
      playerName: player.display_name,
      seatNum: player.seat_number,
      techType
    });
  };

  const confirmDisciplineAction = () => {
    if (!pendingDisciplineAction) return;
    const { participantId, type, techType } = pendingDisciplineAction;

    if (type === 'ppk') {
      const player = playerResults.find(p => p.participant_id === participantId);
      if (player) {
        const winnerTeam = getOppositeTeam(player.role);
        if (!winnerTeam) {
          setError(`Не удалось определить победителя по ППК: роль игрока #${player.seat_number} не установлена или некорректна`);
          setPendingDisciplineAction(null);
          return;
        }
        setProtocol(prev => ({
          ...prev,
          end_reason: 'ppk',
          ppk_culprit_participant_id: participantId,
          winner_team: winnerTeam
        }));
      }
    } else if (type === 'cancel_ppk') {
      setProtocol(prev => ({
        ...prev,
        end_reason: 'normal',
        ppk_culprit_participant_id: null,
        winner_team: null
      }));
    } else {
      const player = playerResults.find(p => p.participant_id === participantId);
      if (player) {
        const updates = getConfirmedPlayerDisciplineUpdates(player, type, techType);
        if (updates) {
          updatePlayerResult(participantId, updates);
        }
      }
    }

    setPendingDisciplineAction(null);
  };

  // Color protocol handlers per player
  const toggleColorSeatSelection = (participantId: string, seatNum: number) => {
    setSelectedColorSeats((prev) => ({
      ...prev,
      [participantId]: toggleColorSeatInList(prev[participantId] || [], seatNum)
    }));
  };

  const handleAddColorMark = (participantId: string) => {
    const seats = selectedColorSeats[participantId] || [];
    if (seats.length === 0) return;
    const mark = selectedColorMark[participantId] || 'red';

    setPlayerResults((prev) =>
      addColorMarkToResults(prev, participantId, seats, mark)
    );

    setSelectedColorSeats((prev) => ({ ...prev, [participantId]: [] }));
  };

  const handleMoveColorMark = (participantId: string, fromIndex: number, toIndex: number) => {
    setPlayerResults((prev) =>
      moveColorMarkInResults(prev, participantId, fromIndex, toIndex)
    );
  };

  const handleDeleteColorMark = (participantId: string, index: number) => {
    setPlayerResults((prev) =>
      deleteColorMarkFromResults(prev, participantId, index)
    );
  };

  const startEditColorMark = (
    participantId: string,
    index: number,
    entry: { seat_numbers: number[]; mark: ColorMarkType }
  ) => {
    setEditingColorMarkMap((prev) => ({
      ...prev,
      [participantId]: createColorMarkEditState(index, entry)
    }));
  };

  const cancelEditColorMark = (participantId: string) => {
    setEditingColorMarkMap((prev) => ({ ...prev, [participantId]: null }));
  };

  const toggleEditColorSeat = (participantId: string, seatNum: number) => {
    setEditingColorMarkMap((prev) => {
      const current = prev[participantId];
      if (!current) return prev;
      return {
        ...prev,
        [participantId]: toggleColorMarkEditSeat(current, seatNum)
      };
    });
  };

  const setEditColorMarkType = (participantId: string, mark: ColorMarkType) => {
    setEditingColorMarkMap((prev) => {
      const current = prev[participantId];
      if (!current) return prev;
      return {
        ...prev,
        [participantId]: setColorMarkEditType(current, mark)
      };
    });
  };

  const saveEditColorMark = (participantId: string) => {
    const editState = editingColorMarkMap[participantId];
    if (!editState || editState.seats.length === 0) return;

    setPlayerResults((prev) =>
      saveEditedColorMarkToResults(prev, participantId, editState)
    );

    cancelEditColorMark(participantId);
  };

  // Calculate live Best Move Scores
  const calculateGuessedBlacks = (seats: number[]) =>
    calculateGuessedBlacksForResults(seats, playerResults);

  const toggleBestMoveSeat = (source: 'first_killed' | 'zero_round_voted', participantId: string, seatNumber: number) => {
    setProtocol((prev) => {
      const moves = [...(prev.best_moves || [])];
      const existingIdx = moves.findIndex(bm => bm.source === source);

      let seats: number[] = [];
      if (existingIdx >= 0) {
        seats = [...moves[existingIdx].seat_numbers];
      }

      if (seats.includes(seatNumber)) {
        seats = seats.filter((s) => s !== seatNumber);
      } else {
        if (seats.length >= 3) return prev; // max 3
        seats = [...seats, seatNumber].sort((a, b) => a - b);
      }

      if (existingIdx >= 0) {
        moves[existingIdx] = { ...moves[existingIdx], participant_id: participantId, seat_numbers: seats };
      } else {
        moves.push({ participant_id: participantId, source, seat_numbers: seats });
      }

      return { ...prev, best_moves: moves };
    });
  };

  const syncAndCleanVotes = (votesList: any[]): any[] => {
    return cleanAndSyncVotes(votesList);
  };

  const handleRoundChange = (rIdx: number, updater: (r: any) => any) => {
    setHighlightedRoundIdx(null);
    setProtocol((prev) => {
      const votesCopy = [...(prev.votes || [])];
      let r = { ...votesCopy[rIdx] };
      const hadOutcome = r.outcome && r.outcome !== 'pending';

      r = updater(r);
      r = recalculateVoteRemainder(r);

      if (hadOutcome) {
        r.outcome = 'pending';
        r.eliminated_seats = [];
        r.table_leave_votes = undefined;
      }

      votesCopy[rIdx] = r;

      const nextVotes = syncAndCleanVotes(votesCopy);

      const syncRes = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResultsRef.current, { ...prev, votes: nextVotes });
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;

      dirtyRevision.current++;
      setSaveStatus('unsaved');
      return syncRes.protocol;
    });
  };

  const handleConfirmOutcome = (
    rIdx: number,
    calculatedOutcome: string,
    winners: number[]
  ) => {
    setHighlightedRoundIdx(null);
    if (calculatedOutcome === 'tie_revote' || calculatedOutcome === 'needs_revote') {
      setProtocol((prev) => {
        const currentVotes = [...(prev.votes || [])];
        const updatedParent = {
          ...currentVotes[rIdx],
          outcome: 'tie_revote' as const,
          eliminated_seats: []
        };
        currentVotes[rIdx] = updatedParent;

        const newRound = createNextRevoteRound(updatedParent, winners);

        currentVotes.splice(rIdx + 1, 0, newRound);

        const nextVotes = syncAndCleanVotes(currentVotes);

        const syncRes = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResultsRef.current, { ...prev, votes: nextVotes });
        setPlayerResults(syncRes.player_results);
        playerResultsRef.current = syncRes.player_results;

        dirtyRevision.current++;
        setSaveStatus('unsaved');
        return syncRes.protocol;
      });
    } else {
      let dbOutcome: 'single_eliminated' | 'all_tied_eliminated' | 'no_elimination' = 'no_elimination';
      if (calculatedOutcome === 'single_eliminated') {
        dbOutcome = 'single_eliminated';
      } else if (calculatedOutcome === 'all_tied_eliminated') {
        dbOutcome = 'all_tied_eliminated';
      }

      setProtocol((prev) => {
        const currentVotes = [...(prev.votes || [])];
        currentVotes[rIdx] = {
          ...currentVotes[rIdx],
          outcome: dbOutcome,
          eliminated_seats: dbOutcome === 'single_eliminated'
            ? [winners[0]]
            : dbOutcome === 'all_tied_eliminated'
            ? winners
            : []
        };

        const nextVotes = syncAndCleanVotes(currentVotes);

        const syncRes = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResultsRef.current, { ...prev, votes: nextVotes });
        setPlayerResults(syncRes.player_results);
        playerResultsRef.current = syncRes.player_results;

        dirtyRevision.current++;
        setSaveStatus('unsaved');
        return syncRes.protocol;
      });
    }
  };

  const handleResetOutcome = (rIdx: number) => {
    setHighlightedRoundIdx(null);
    setProtocol((prev) => {
      const votesCopy = [...(prev.votes || [])];
      const r = votesCopy[rIdx];

      votesCopy[rIdx] = {
        ...r,
        outcome: 'pending',
        eliminated_seats: [],
        table_leave_votes: undefined
      };

      const nextVotes = syncAndCleanVotes(votesCopy);

      const syncRes = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResultsRef.current, { ...prev, votes: nextVotes });
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;

      dirtyRevision.current++;
      setSaveStatus('unsaved');
      return syncRes.protocol;
    });
  };

  const handleDeleteVoting = (rIdx: number) => {
    setHighlightedRoundIdx(null);
    setProtocol((prev) => {
      const remainingVotes = (prev.votes || []).filter((_, idx) => idx !== rIdx);
      const nextVotes = syncAndCleanVotes(remainingVotes);
      const syncRes = syncAllEventsToResults(
        nextVotes,
        prev.shots || [],
        prev.first_killed_participant_id,
        playerResultsRef.current,
        { ...prev, votes: nextVotes }
      );
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
    dirtyRevision.current++;
    setSaveStatus('unsaved');
  };

  const handleAddVoting = () => {
    const currentVotes = protocol.votes || [];
    const normalVotes = currentVotes.filter(v => !v.is_revote);
    const nextDayNum = normalVotes.length === 0
      ? 0
      : Math.max(...normalVotes.map(v => v.day_number ?? 0)) + 1;
    const nextRoundNum = currentVotes.length + 1;
    setProtocol((prev) => {
      const nextVotes = [
        ...(prev.votes || []),
        {
          round_number: nextRoundNum,
          is_revote: false,
          nominated_seats: [],
          vote_counts: {},
          day_number: nextDayNum,
          eligible_voters: 10,
          outcome: 'pending'
        }
      ];
      const cleanVotes = syncAndCleanVotes(nextVotes);
      const syncRes = syncAllEventsToResults(
        cleanVotes,
        prev.shots || [],
        prev.first_killed_participant_id,
        playerResultsRef.current,
        { ...prev, votes: cleanVotes }
      );
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
    dirtyRevision.current++;
    setSaveStatus('unsaved');
  };

  const handleFirstKilledChange = (newId: string | null) => {
    const prevId = protocol.first_killed_participant_id;
    if (newId === prevId) return;

    const prevBm = protocol.best_moves?.find(bm => bm.source === 'first_killed');
    const hasOldNumbers = prevBm && prevBm.seat_numbers.length > 0;
    let hasManualCi = false;

    if (prevId) {
      const prevPlayer = playerResults.find((p) => p.participant_id === prevId);
      if (prevPlayer && Number(prevPlayer.ci_points || 0) !== 0) {
        hasManualCi = true;
      }
    }

    if (prevId && (hasOldNumbers || hasManualCi)) {
      setPendingFirstKilledId(newId);
      setShowCiConfirmModal(true);
      return;
    }

    setProtocol((prev) => {
      let moves = [...(prev.best_moves || [])].filter(bm => bm.source !== 'first_killed');
      if (newId) {
        moves.push({ participant_id: newId, source: 'first_killed', seat_numbers: [] });
      }
      const nextProto = { ...prev, first_killed_participant_id: newId, best_moves: moves };
      const syncRes = syncAllEventsToResults(prev.votes || [], prev.shots || [], newId, playerResultsRef.current, nextProto);
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
  };

  const handleZeroRoundVotedChange = (newId: string | null) => {
    const prevId = protocol.zero_round_voted_participant_id;
    if (newId === prevId) return;

    const prevBm = protocol.best_moves?.find(bm => bm.source === 'zero_round_voted');
    const hasOldNumbers = prevBm && prevBm.seat_numbers.length > 0;

    if (prevId && hasOldNumbers) {
      setPendingZeroRoundVotedId(newId);
      setShowZeroRoundConfirmModal(true);
      return;
    }

    setProtocol((prev) => {
      let moves = [...(prev.best_moves || [])].filter(bm => bm.source !== 'zero_round_voted');
      if (newId) {
        moves.push({ participant_id: newId, source: 'zero_round_voted', seat_numbers: [] });
      }
      return { ...prev, zero_round_voted_participant_id: newId, best_moves: moves };
    });
  };

  const handleAddNight = () => {
    setProtocol((prev) => {
      const nextShots = [
        ...(prev.shots || []),
        {
          night_number: (prev.shots || []).length + 1,
          target_seat: 1,
          result: 'killed' as const
        }
      ];
      const syncRes = syncAllEventsToResults(prev.votes || [], nextShots, prev.first_killed_participant_id, playerResultsRef.current, { ...prev, shots: nextShots });
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
  };

  const handleDeleteNight = (sIdx: number) => {
    setProtocol((prev) => {
      const nextShots = (prev.shots || []).filter((_, idx) => idx !== sIdx).map((s, idx) => ({ ...s, night_number: idx + 1 }));
      const syncRes = syncAllEventsToResults(prev.votes || [], nextShots, prev.first_killed_participant_id, playerResultsRef.current, { ...prev, shots: nextShots });
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
  };

  const handleShotChange = (sIdx: number, targetSeat: number, result: 'killed' | 'miss' | 'agreement_failed') => {
    setProtocol((prev) => {
      const shotsCopy = [...(prev.shots || [])];
      shotsCopy[sIdx] = { ...shotsCopy[sIdx], target_seat: targetSeat, result };
      const syncRes = syncAllEventsToResults(prev.votes || [], shotsCopy, prev.first_killed_participant_id, playerResultsRef.current, { ...prev, shots: shotsCopy });
      setPlayerResults(syncRes.player_results);
      playerResultsRef.current = syncRes.player_results;
      return syncRes.protocol;
    });
  };

  const handleWinnerTeamChange = (team: 'red' | 'black' | null) => {
    setProtocol((prev) => ({ ...prev, winner_team: team }));
  };

  const handleReplacementChange = (replacement: any | null) => {
    setProtocol((prev) => ({ ...prev, replacement }));
  };

  const handleJudgeNotesChange = (notes: string) => {
    setProtocol((prev) => ({ ...prev, judge_notes: notes }));
  };

  const validateVotesLogic = (
    votes: any[],
    results: PlayerResultData[],
    zeroRoundVotedId: string | null
  ): { errorMsg: string | null, roundIndexWithError: number | null } => {
    if (!votes || votes.length === 0) {
      return { errorMsg: null, roundIndexWithError: null };
    }

    for (let rIdx = 0; rIdx < votes.length; rIdx++) {
      const round = votes[rIdx];
      const roundNum = round.round_number ?? (rIdx + 1);
      const dayNum = round.day_number ?? (rIdx === 0 ? 0 : 1);

      if (!round.nominated_seats || round.nominated_seats.length === 0) {
        return {
          errorMsg: `Запрещено завершать протокол с пустым кругом голосования (круг #${roundNum}, день ${dayNum}).`,
          roundIndexWithError: rIdx
        };
      }

      if (round.eligible_voters === undefined || round.eligible_voters === null || round.eligible_voters <= 0) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): не указано количество имеющих право голоса.`,
          roundIndexWithError: rIdx
        };
      }

      const sumVotes = round.nominated_seats.reduce((sum: number, s: number) => sum + (round.vote_counts?.[s] || 0), 0);

      if (sumVotes !== round.eligible_voters) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): сумма распределённых голосов (${sumVotes}) не равна количеству голосующих (${round.eligible_voters}).`,
          roundIndexWithError: rIdx
        };
      }

      const noms = round.nominated_seats || [];
      if (noms.length > 0) {
        const eligible = Number(round.eligible_voters ?? 10);
        if (noms.length === 1) {
          const onlySeat = noms[0];
          const count = Number(round.vote_counts?.[onlySeat] ?? 0);
          if (count !== eligible) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): единственный кандидат #${onlySeat} должен получить ровно ${eligible} голосов (получено ${count}).`,
              roundIndexWithError: rIdx
            };
          }
        } else {
          const lastSeat = noms[noms.length - 1];
          let sumPrev = 0;
          for (let i = 0; i < noms.length - 1; i++) {
            const seat = noms[i];
            sumPrev += Number(round.vote_counts?.[seat] ?? 0);
          }
          if (sumPrev > eligible) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): сумма голосов предыдущих кандидатов (${sumPrev}) превышает число голосующих (${eligible}).`,
              roundIndexWithError: rIdx
            };
          }
          const expectedLast = eligible - sumPrev;
          const actualLast = Number(round.vote_counts?.[lastSeat] ?? 0);
          if (actualLast !== expectedLast) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): последний кандидат #${lastSeat} должен получить автоматический остаток ${expectedLast} голосов (получено ${actualLast}).`,
              roundIndexWithError: rIdx
            };
          }
        }
      }

      if (!round.outcome || round.outcome === 'pending') {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход голосования не подтверждён судьёй.`,
          roundIndexWithError: rIdx
        };
      }

      const votingResult = determineVotingResult({
        nominated_seats: round.nominated_seats,
        eligible_voters: Number(round.eligible_voters),
        is_revote: !!round.is_revote,
        vote_counts: round.vote_counts,
        table_leave_votes: round.table_leave_votes !== null && round.table_leave_votes !== undefined ? Number(round.table_leave_votes) : null
      });
      const winners = votingResult.winners;

      if (votingResult.outcome === 'single_eliminated') {
        if (round.outcome !== 'single_eliminated') {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается выбывание игрока #${winners[0]}).`,
            roundIndexWithError: rIdx
          };
        }
        if (!round.eliminated_seats || round.eliminated_seats.length !== 1 || Number(round.eliminated_seats[0]) !== winners[0]) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки противоречат исходу (ожидается игрок #${winners[0]}).`,
            roundIndexWithError: rIdx
          };
        }
      } else if (votingResult.outcome === 'needs_revote') {
        if (round.outcome !== 'tie_revote') {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается ничья между игроками #${winners.join(', #')}).`,
            roundIndexWithError: rIdx
          };
        }
        if (round.eliminated_seats && round.eliminated_seats.length > 0) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): при ничьей список выбывших должен быть пуст.`,
            roundIndexWithError: rIdx
          };
        }
      } else if (votingResult.outcome === 'auto_no_elimination') {
        if (round.outcome !== 'no_elimination') {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination', так как спорных игроков больше половины.`,
            roundIndexWithError: rIdx
          };
        }
        if (round.eliminated_seats && round.eliminated_seats.length > 0) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`,
            roundIndexWithError: rIdx
          };
        }
      } else if (votingResult.outcome === 'requires_table_decision') {
        if (round.table_leave_votes === undefined || round.table_leave_votes === null) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): не указаны голоса за уход всех спорных игроков при переголосовании.`,
            roundIndexWithError: rIdx
          };
        }
        if (votingResult.resolvedOutcome === 'all_tied_eliminated') {
          if (round.outcome !== 'all_tied_eliminated') {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'all_tied_eliminated' (все уходят).`,
              roundIndexWithError: rIdx
            };
          }
          const elims = [...(round.eliminated_seats || [])].map(Number).sort((a,b) => a-b);
          const expected = [...winners].map(Number).sort((a,b) => a-b);
          if (JSON.stringify(elims) !== JSON.stringify(expected)) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки должны совпадать с кандидатами переголосования #${winners.join(', #')}.`,
              roundIndexWithError: rIdx
            };
          }
        } else {
          if (round.outcome !== 'no_elimination') {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination' (никто не уходит).`,
              roundIndexWithError: rIdx
            };
          }
          if (round.eliminated_seats && round.eliminated_seats.length > 0) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`,
              roundIndexWithError: rIdx
            };
          }
        }
      }

      if (round.is_revote && round.parent_round_number) {
        const parentRound = votes.find(v => Number(v.round_number) === Number(round.parent_round_number));
        if (parentRound) {
          const parentResult = determineVotingResult({
            nominated_seats: parentRound.nominated_seats,
            eligible_voters: Number(parentRound.eligible_voters),
            is_revote: !!parentRound.is_revote,
            vote_counts: parentRound.vote_counts,
            table_leave_votes: parentRound.table_leave_votes !== null && parentRound.table_leave_votes !== undefined ? Number(parentRound.table_leave_votes) : null
          });
          const currentNoms = [...(round.nominated_seats || [])].map(Number);
          const expectedNoms = [...parentResult.winners].map(Number);
          if (JSON.stringify(currentNoms) !== JSON.stringify(expectedNoms)) {
            return {
              errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список кандидатов переголосования (${currentNoms.join(', ')}) не соответствует спорным игрокам предыдущего раунда (${expectedNoms.join(', ')}).`,
              roundIndexWithError: rIdx
            };
          }
        }
      }
    }

    const hierarchyError = validateVotingHierarchy(votes);
    if (hierarchyError) {
      return {
        errorMsg: hierarchyError,
        roundIndexWithError: null
      };
    }

    const zeroRoundEliminated = new Set<number>();
    const otherDayEliminated = new Set<number>();
    for (const round of votes) {
      if (round.outcome && round.outcome !== 'pending') {
        const dayNum = round.day_number ?? 0;
        const seats = round.eliminated_seats || [];
        if (dayNum === 0) {
          seats.forEach((s: number) => zeroRoundEliminated.add(s));
        } else {
          seats.forEach((s: number) => otherDayEliminated.add(s));
        }
      }
    }

    for (const pr of results) {
      if (pr.exit_type === 'voted_zero_round' && !zeroRoundEliminated.has(pr.seat_number)) {
        return {
          errorMsg: `Игрок #${pr.seat_number} имеет статус ухода "Заголосован (0 круг)", но не был заголосован в подтверждённых кругах дня 0.`,
          roundIndexWithError: null
        };
      }
      if (pr.exit_type === 'voted_day' && !otherDayEliminated.has(pr.seat_number)) {
        return {
          errorMsg: `Игрок #${pr.seat_number} имеет статус ухода "Заголосован", но не был заголосован в подтверждённых кругах последующих дней.`,
          roundIndexWithError: null
        };
      }
      if (zeroRoundEliminated.has(pr.seat_number) && pr.exit_type !== 'voted_zero_round') {
        return {
          errorMsg: `Игрок #${pr.seat_number} выбыл в нулевом круге, но его статус ухода в списке игроков не "Заголосован (0 круг)".`,
          roundIndexWithError: null
        };
      }
      if (otherDayEliminated.has(pr.seat_number) && pr.exit_type !== 'voted_day') {
        return {
          errorMsg: `Игрок #${pr.seat_number} выбыл при голосовании, но его статус ухода в списке игроков не "Заголосован".`,
          roundIndexWithError: null
        };
      }
    }

    const zrCount = zeroRoundEliminated.size;
    if (zrCount === 1) {
      if (!zeroRoundVotedId) {
        return {
          errorMsg: `В нулевом круге выбыл один игрок, но в поле "Заголосованный в нулевой круг" не выбран участник.`,
          roundIndexWithError: null
        };
      }
      const targetSeat = Array.from(zeroRoundEliminated)[0];
      const targetPlayer = results.find(p => p.seat_number === targetSeat);
      if (targetPlayer && targetPlayer.participant_id !== zeroRoundVotedId) {
        return {
          errorMsg: `Игрок в поле "Заголосованный в нулевой круг" должен совпадать с выбывшим игроком #${targetSeat}.`,
          roundIndexWithError: null
        };
      }
    } else {
      if (zeroRoundVotedId !== null && zeroRoundVotedId !== '') {
        return {
          errorMsg: `В нулевом круге выбыло ${zrCount} игроков (не 1), поэтому поле "Заголосованный в нулевой круг" должно быть сброшено (пусто).`,
          roundIndexWithError: null
        };
      }
    }

    return { errorMsg: null, roundIndexWithError: null };
  };

  // Validate protocol on client side before completing
  const validateBeforeComplete = (): string | null => {
    if (!protocol.winner_team || !['red', 'black'].includes(protocol.winner_team)) {
      return 'Необходимо выбрать победившую команду (Красные или Чёрные)';
    }

    if (!playerResults || playerResults.length !== 10) {
      return 'В протоколе должно быть ровно 10 игроков';
    }

    // Role check: 6 citizen, 1 sheriff, 2 mafia, 1 don
    const roleCounts: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
    for (const pr of playerResults) {
      const r = (pr.role || '').toLowerCase();
      if (r === 'мирянин' || r === 'мирный') roleCounts.citizen++;
      else if (r === 'шериф') roleCounts.sheriff++;
      else if (r === 'мафия') roleCounts.mafia++;
      else if (r === 'дон') roleCounts.don++;
      else if (roleCounts[r] !== undefined) roleCounts[r]++;
    }
    if (roleCounts.citizen !== 6 || roleCounts.sheriff !== 1 || roleCounts.mafia !== 2 || roleCounts.don !== 1) {
      return 'Не все роли участников корректно распределены (требуется: 6 мирных, 1 Шериф, 2 Мафии, 1 Дон)';
    }

    if (protocol.first_killed_participant_id) {
      const fkPlayer = playerResults.find((p) => p.participant_id === protocol.first_killed_participant_id);
      if (fkPlayer && fkPlayer.exit_type !== 'killed') {
        return 'Первоубиенный игрок должен иметь тип ухода "killed" (убит ночью)';
      }
    }

    if (protocol.zero_round_voted_participant_id) {
      const zrPlayer = playerResults.find((p) => p.participant_id === protocol.zero_round_voted_participant_id);
      if (zrPlayer && zrPlayer.exit_type !== 'voted_zero_round') {
        return 'Заголосованный в нулевой круг игрок должен иметь тип ухода "voted_zero_round"';
      }
    }

    if (protocol.first_killed_participant_id && protocol.zero_round_voted_participant_id && protocol.first_killed_participant_id === protocol.zero_round_voted_participant_id) {
      return 'Первоубиенный игрок и заголосованный в нулевой круг не могут быть одним и тем же игроком';
    }

    if (protocol.best_moves && protocol.best_moves.length > 0) {
      const seenParticipants = new Set<string>();
      const seenSources = new Set<string>();
      for (const bm of protocol.best_moves) {
        if (seenParticipants.has(bm.participant_id)) return 'Один участник не может иметь два ЛХ';
        seenParticipants.add(bm.participant_id);

        if (seenSources.has(bm.source)) return 'Источник ЛХ не может повторяться';
        seenSources.add(bm.source);

        if (bm.source === 'first_killed' && bm.participant_id !== protocol.first_killed_participant_id) {
          return 'Для ЛХ первого убитого участник обязан совпадать с первоубиенным';
        }
        if (bm.source === 'zero_round_voted' && bm.participant_id !== protocol.zero_round_voted_participant_id) {
          return 'Для ЛХ выбывшего в 0 круге участник обязан совпадать с заголосованным в 0 круг';
        }
      }
    }

    // Check for unclassified tech fouls
    if (Object.keys(oldTechFoulsToFix).length > 0) {
      return 'Необходимо классифицировать старые техфолы для всех игроков (малый/большой)';
    }

    const votingVal = validateVotesLogic(protocol.votes || [], playerResults, protocol.zero_round_voted_participant_id);
    if (votingVal.errorMsg) {
      setActiveTab('votes');
      if (votingVal.roundIndexWithError !== null) {
        setHighlightedRoundIdx(votingVal.roundIndexWithError);
      }
      return votingVal.errorMsg;
    }
    setHighlightedRoundIdx(null);

    return null;
  };

  // Handle Complete Protocol
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
      setSaveStatus('saved');
      setShowCompleteConfirm(false);

      if (res.checkpoint_warning) {
        alert('Протокол завершён, но возникла ошибка при создании резервной копии базы данных:\n\n' + res.checkpoint_warning);
      }

      // Clear localStorage backup for this game upon successful protocol completion
      const protocolBackupKey = getProtocolBackupKey(gameId);
      localStorage.removeItem(protocolBackupKey);

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
      setSaveStatus('saved');
      setShowRevertConfirm(false);

      if (res.checkpoint_warning) {
        alert('Протокол возвращён в черновик, но возникла ошибка при создании резервной копии базы данных:\n\n' + res.checkpoint_warning);
      }

      if (onProtocolUpdated) onProtocolUpdated();
    } catch (err: any) {
      setError(err.message || 'Не удалось вернуть в черновик');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="protocol-noir-root fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-hidden">
      <div className="protocol-noir-shell text-text-primary rounded-none sm:rounded-2xl w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="protocol-noir-header px-3 py-2.5 sm:px-4 sm:py-3 border-b flex items-center justify-between shrink-0 min-h-[58px] sm:min-h-[64px] min-w-0 protocol-modal-header">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="min-w-[34px] text-warning flex items-center justify-center font-black text-base sm:text-lg tabular-nums shrink-0">
              #{game?.game_number || 1}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-semibold text-white truncate">
                  <span className="sm:hidden">Игра #{game?.game_number || 1}</span>
                  <span className="hidden sm:inline">Протокол игры #{game?.game_number || 1}</span>
                </h2>
                {protocol.status === 'completed' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    Завершён
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    Черновик
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs text-text-secondary truncate">
                Судья: {game?.judge_name || 'Не указан'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Save Status Badge */}
            {protocol.status === 'draft' && (
              <div className="protocol-save-status text-[11px] sm:text-xs">
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium hidden sm:inline">Сохранено</span>
                  </>
                )}
                {saveStatus === 'saving' && (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span className="text-amber-400 font-medium hidden sm:inline">Сохраняем...</span>
                  </>
                )}
                {saveStatus === 'unsaved' && (
                  <>
                    <Save className="w-3.5 h-3.5 text-text-secondary" />
                    <span className="text-text-secondary hidden sm:inline">Не сохранено</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400 font-medium hidden sm:inline">Ошибка</span>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleModalClose}
              className="text-text-secondary hover:text-white p-1.5 rounded-lg hover:bg-surface-hover transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-rose-300 shrink-0">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Save Error Banner */}
        {saveErrorMessage && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300 shrink-0">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Ошибка автосохранения: {saveErrorMessage}</span>
            </div>
            <button
              onClick={() => performSave(true)}
              className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="protocol-noir-tabs border-b px-2 pt-1 sm:px-3 shrink-0 protocol-modal-tabs">
          <div className="grid grid-cols-4 gap-1 sm:flex sm:space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('players')}
              className={`px-1 sm:px-3 text-[11px] min-[390px]:text-xs sm:text-sm font-medium transition flex items-center justify-center gap-1 sm:gap-2 min-w-0 ${
                activeTab === 'players'
                  ? 'protocol-noir-tab-active font-bold'
                  : 'protocol-noir-tab'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Игроки</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('votes')}
              className={`px-1 sm:px-3 text-[11px] min-[390px]:text-xs sm:text-sm font-medium transition flex items-center justify-center gap-1 sm:gap-2 min-w-0 ${
                activeTab === 'votes'
                  ? 'protocol-noir-tab-active font-bold'
                  : 'protocol-noir-tab'
              }`}
            >
              <Vote className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Голоса</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('nights')}
              className={`px-1 sm:px-3 text-[11px] min-[390px]:text-xs sm:text-sm font-medium transition flex items-center justify-center gap-1 sm:gap-2 min-w-0 ${
                activeTab === 'nights'
                  ? 'protocol-noir-tab-active font-bold'
                  : 'protocol-noir-tab'
              }`}
            >
              <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Ночи/ЛХ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`px-1 sm:px-3 text-[11px] min-[390px]:text-xs sm:text-sm font-medium transition flex items-center justify-center gap-1 sm:gap-2 min-w-0 ${
                activeTab === 'summary'
                  ? 'protocol-noir-tab-active font-bold'
                  : 'protocol-noir-tab'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Итог</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="protocol-noir-content flex-1 min-h-0 overflow-y-auto overscroll-contain overflow-x-hidden p-3 sm:p-5 max-w-full">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-text-secondary">
              <Clock className="w-8 h-8 animate-spin text-amber-500" />
              <span className="text-sm font-medium">Загрузка данных протокола...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: PLAYERS PROTOCOL */}
              {activeTab === 'players' && (
                <div className="space-y-4">
                  <div className="text-xs text-text-secondary flex items-center justify-between">
                    <span>Заполните фолы, доп. баллы, штрафы и цветовые протоколы участников:</span>
                    <span className="font-semibold text-text-secondary">Игроков: {playerResults.length}/10</span>
                  </div>

                  <div className="protocol-player-list">
                    {playerResults.map((player) => {
                      const isExpanded = expandedPlayerId === player.participant_id;
                      const {
                        briefBadges,
                        roleLabel,
                        roleClass,
                        statusLabel,
                        statusClass
                      } = getProtocolPlayerPresentation(
                        player,
                        protocol.ppk_culprit_participant_id
                      );

                      return (
                        <div
                          key={player.participant_id}
                          className="protocol-player-row" data-expanded={isExpanded}
                        >
                          {/* Compact Row Header */}
                          <button
                            type="button"
                            data-testid={`player-row-${player.participant_id}`}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedPlayerId((prev) => (prev === player.participant_id ? null : player.participant_id))
                            }
                            className="protocol-player-trigger w-full grid grid-cols-[34px_32px_minmax(0,1fr)_32px] sm:grid-cols-[38px_36px_minmax(0,1fr)_36px] items-start gap-2 sm:gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left min-h-[64px] transition-colors"
                          >
                            <span className="text-warning font-black text-sm sm:text-base tabular-nums pt-1">
                              {String(player.seat_number).padStart(2, '0')}
                            </span>
                            <PlayerAvatar nickname={player.display_name} size="xs" />
                            <span className="min-w-0 space-y-1.5">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                <span className="font-semibold text-sm text-text-primary break-words min-w-0 max-w-full">
                                  {player.display_name}
                                </span>
                                <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${roleClass}`}>
                                  {roleLabel}
                                </span>
                                {statusLabel && (
                                  <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${statusClass}`}>
                                    {statusLabel}
                                  </span>
                                )}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                {briefBadges.length > 0 ? (
                                  briefBadges.map((badge) => (
                                    <span
                                      key={badge.key}
                                      className={`text-[10px] sm:text-[11px] leading-4 whitespace-normal tabular-nums ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] sm:text-[11px] text-text-muted">Без отметок</span>
                                )}
                              </span>
                            </span>
                            <span className="w-8 h-8 flex items-center justify-center text-text-secondary shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-accent" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </span>
                          </button>

                          {/* Expanded Player Form */}
                          {isExpanded && (
                            <div className="border-t border-border-soft px-3 pb-3 sm:px-4 sm:pb-4 space-y-3">
                              {/* Status Selector Row */}
                              <div className="protocol-inline-section flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="flex items-center space-x-2 text-xs">
                                  <span className="text-text-secondary font-medium">Статус игрока:</span>
                                  <select
                                    disabled={protocol.status === 'completed' || !!player.removal_reason}
                                    value={player.exit_type}
                                    onChange={(e) => {
                                      const val = e.target.value as any;
                                      if (val === 'removed') {
                                        handleDisciplineAction(player.participant_id, 'direct_removal');
                                      } else {
                                        updatePlayerResult(player.participant_id, {
                                          exit_type: val
                                        });
                                      }
                                    }}
                                    className="protocol-noir-field !w-auto text-xs disabled:opacity-60"
                                  >
                                    <option value="alive">Жив</option>
                                    <option value="killed">Убит (ночью)</option>
                                    <option value="voted_zero_round">Заголосован (0 круг)</option>
                                    <option value="voted_day">Заголосован (день)</option>
                                    <option value="removed">Снят (4 фола/дискв.)</option>
                                  </select>
                                  {!!player.removal_reason && (
                                    <span className="text-[10px] text-rose-400 font-bold ml-1 uppercase bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                                      {player.removal_reason === '4th_foul' && '4 фола'}
                                      {player.removal_reason === '2nd_tech' && '2 техфола'}
                                      {player.removal_reason === 'direct' && 'Удаление'}
                                    </span>
                                  )}
                                </div>
                              </div>

                          {/* Middle Row: Fouls & Bonuses Grid */}
                          <div className="mt-2">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                              {/* Regular Fouls */}
                              <div className="protocol-control-block">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-text-secondary">Обычные фолы</span>
                                  {player.regular_fouls === 3 && (
                                    <span className="text-[10px] text-amber-500 font-medium animate-pulse">30 сек</span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1">
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || player.regular_fouls <= 0}
                                    onClick={() => handleRegularFoulChange(player.participant_id, -1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    -
                                  </button>
                                  <span className="flex-1 text-center font-bold text-amber-400 text-base">
                                    {player.regular_fouls}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || player.regular_fouls >= 4}
                                    onClick={() => handleRegularFoulChange(player.participant_id, 1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                               {/* Technical Fouls - Minor */}
                              <div className="protocol-control-block">
                                <span className="text-text-secondary block mb-1">Малый тех −0.3</span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || (player.minor_technical_fouls || 0) <= 0}
                                    onClick={() => handleTechFoulChange(player.participant_id, 'minor', -1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    -
                                  </button>
                                  <span className="flex-1 text-center font-bold text-rose-400 text-base">
                                    {player.minor_technical_fouls || 0}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || (player.technical_fouls || 0) >= 2}
                                    onClick={() => handleTechFoulChange(player.participant_id, 'minor', 1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Technical Fouls - Major */}
                              <div className="protocol-control-block">
                                <span className="text-text-secondary block mb-1">Большой тех −0.6</span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || (player.major_technical_fouls || 0) <= 0}
                                    onClick={() => handleTechFoulChange(player.participant_id, 'major', -1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    -
                                  </button>
                                  <span className="flex-1 text-center font-bold text-rose-600 text-base">
                                    {player.major_technical_fouls || 0}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={protocol.status === 'completed' || (player.technical_fouls || 0) >= 2}
                                    onClick={() => handleTechFoulChange(player.participant_id, 'major', 1)}
                                    className="w-11 h-11 rounded-lg bg-surface-2 text-text-secondary hover:bg-surface-hover disabled:opacity-40 font-bold flex items-center justify-center transition-colors active:scale-95"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Disciplinary Penalty (Read-only) */}
                              <div className="protocol-control-block">
                                <span className="text-text-secondary block mb-0.5">Дисципл. минус</span>
                                <div className="w-full bg-surface-1/40 border border-border-soft rounded px-2 py-1 text-text-secondary text-xs text-center font-medium">
                                  {calculateDisciplinaryPenalty(
                                    player.minor_technical_fouls || 0,
                                    player.major_technical_fouls || 0,
                                    player.exit_type === 'removed',
                                    protocol.ppk_culprit_participant_id === player.participant_id
                                  )}
                                </div>
                                <span className="text-[10px] text-text-muted block mt-1 leading-none text-center">Не влияет на номин.</span>
                              </div>
                            </div>

                            {/* Unclassified Tech Fouls Warning */}
                            {oldTechFoulsToFix[player.participant_id] !== undefined && (
                              <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                <div className="flex items-center space-x-2 text-amber-400 mb-2">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span className="text-[11px] font-bold">Старые техфолы: тип не указан ({oldTechFoulsToFix[player.participant_id]})</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {oldTechFoulsToFix[player.participant_id] === 1 ? (
                                    <>
                                      <button
                                        disabled={protocol.status === 'completed'}
                                        onClick={() => classifyTechFoul(player.participant_id, 1, 0)}
                                        className="min-h-[44px] px-3 py-1 rounded bg-surface-2 hover:bg-surface-hover text-[10px] font-bold text-text-primary border border-border-soft disabled:opacity-50"
                                      >
                                        1 малый
                                      </button>
                                      <button
                                        disabled={protocol.status === 'completed'}
                                        onClick={() => classifyTechFoul(player.participant_id, 0, 1)}
                                        className="min-h-[44px] px-3 py-1 rounded bg-surface-2 hover:bg-surface-hover text-[10px] font-bold text-text-primary border border-border-soft disabled:opacity-50"
                                      >
                                        1 большой
                                      </button>
                                    </>
                                  ) : oldTechFoulsToFix[player.participant_id] === 2 ? (
                                    <>
                                      <button
                                        disabled={protocol.status === 'completed'}
                                        onClick={() => classifyTechFoul(player.participant_id, 2, 0)}
                                        className="min-h-[44px] px-3 py-1 rounded bg-surface-2 hover:bg-surface-hover text-[10px] font-bold text-text-primary border border-border-soft disabled:opacity-50"
                                      >
                                        2 малых
                                      </button>
                                      <button
                                        disabled={protocol.status === 'completed'}
                                        onClick={() => classifyTechFoul(player.participant_id, 1, 1)}
                                        className="min-h-[44px] px-3 py-1 rounded bg-surface-2 hover:bg-surface-hover text-[10px] font-bold text-text-primary border border-border-soft disabled:opacity-50"
                                      >
                                        малый + большой
                                      </button>
                                      <button
                                        disabled={protocol.status === 'completed'}
                                        onClick={() => classifyTechFoul(player.participant_id, 0, 2)}
                                        className="min-h-[44px] px-3 py-1 rounded bg-surface-2 hover:bg-surface-hover text-[10px] font-bold text-text-primary border border-border-soft disabled:opacity-50"
                                      >
                                        2 больших
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {/* Bonuses and Ci Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-3">
                              <div className="protocol-control-block flex flex-col items-center">
                                <span className="text-text-secondary block mb-1 text-center">Балл за прот.</span>
                                <PointStepper
                                  value={player.protocol_bonus ?? 0}
                                  min={-1.0}
                                  max={1.0}
                                  step={0.1}
                                  disabled={protocol.status === 'completed'}
                                  ariaLabelMinus="Уменьшить балл за протокол"
                                  ariaLabelPlus="Увеличить балл за протокол"
                                  formatValue={(v) => {
                                    const r = roundTenths(v);
                                    if (r > 0) return `+${r}`;
                                    if (r < 0) return `−${Math.abs(r)}`;
                                    return '0';
                                  }}
                                  onChange={(val) =>
                                    updatePlayerResult(player.participant_id, {
                                      protocol_bonus: roundTenths(val),
                                    })
                                  }
                                />
                              </div>

                              <div data-testid={`judge-bonus-${player.participant_id}`} className="protocol-control-block flex flex-col items-center">
                                <span className="text-text-secondary block mb-1 text-center">Балл судьи</span>
                                <PointStepper
                                  value={player.judge_bonus ?? 0}
                                  min={-1.0}
                                  max={1.0}
                                  step={0.1}
                                  disabled={protocol.status === 'completed'}
                                  ariaLabelMinus="Уменьшить балл судьи"
                                  ariaLabelPlus="Увеличить балл судьи"
                                  formatValue={(v) => {
                                    const r = roundTenths(v);
                                    if (r > 0) return `+${r}`;
                                    if (r < 0) return `−${Math.abs(r)}`;
                                    return '0';
                                  }}
                                  onChange={(val) =>
                                    updatePlayerResult(player.participant_id, {
                                      judge_bonus: roundTenths(val),
                                    })
                                  }
                                />
                              </div>

                              {player.participant_id === protocol.first_killed_participant_id ? (
                                <div className="bg-cyan-950/20 p-2 rounded-lg border border-cyan-500/40 space-y-1">
                                  <span className="text-cyan-400 font-bold block">Коэффициент Ci</span>
                                  <p className="text-[10px] text-text-secondary leading-tight">
                                    Ci рассчитывается автоматически
                                  </p>
                                </div>
                              ) : (
                                <div className="hidden sm:block"></div>
                              )}
                            </div>

                            {/* Action Buttons: Removal & PPK */}
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border-soft/40">
                              {player.removal_reason === 'direct' ? (
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed'}
                                  onClick={() => handleDisciplineAction(player.participant_id, 'cancel_direct')}
                                  className="flex-1 min-h-[44px] rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/20 transition flex items-center justify-center"
                                >
                                  Отменить удаление
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed' || player.exit_type === 'removed'}
                                  onClick={() => handleDisciplineAction(player.participant_id, 'direct_removal')}
                                  className="flex-1 min-h-[44px] rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold hover:bg-rose-500/20 transition disabled:opacity-30 flex items-center justify-center"
                                >
                                  Удалить решением судьи
                                </button>
                              )}

                              {protocol.ppk_culprit_participant_id === player.participant_id ? (
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed'}
                                  onClick={() => handleDisciplineAction(player.participant_id, 'cancel_ppk')}
                                  className="flex-1 min-h-[44px] rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] hover:bg-amber-600 transition shadow-lg shadow-amber-500/20 flex items-center justify-center"
                                >
                                  Снять ППК
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed' || (protocol.end_reason === 'ppk' && protocol.ppk_culprit_participant_id !== player.participant_id)}
                                  onClick={() => handleDisciplineAction(player.participant_id, 'ppk')}
                                  className="flex-1 min-h-[44px] rounded-lg bg-surface-2 text-text-secondary border border-border-soft text-[11px] font-bold hover:bg-surface-hover transition disabled:opacity-30 flex items-center justify-center"
                                >
                                  ППК
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          <div>
                            <input
                              type="text"
                              placeholder="Заметка о действиях игрока..."
                              disabled={protocol.status === 'completed'}
                              value={player.notes || ''}
                              onChange={(e) =>
                                updatePlayerResult(player.participant_id, {
                                  notes: e.target.value || null
                                })
                              }
                              className="protocol-noir-field text-xs disabled:opacity-50"
                            />
                          </div>

                          {/* Color Protocol Section (for killed player or existing marks) */}
                          <PlayerColorProtocolEditor
                            player={player}
                            protocolStatus={protocol.status}
                            selectedColorSeats={selectedColorSeats[player.participant_id] || []}
                            selectedColorMarkType={selectedColorMark[player.participant_id] || 'red'}
                            editingColorMarkState={editingColorMarkMap[player.participant_id]}
                            formatColorMark={formatColorMark}
                            onToggleEditColorSeat={toggleEditColorSeat}
                            onSetEditColorMarkType={setEditColorMarkType}
                            onCancelEditColorMark={cancelEditColorMark}
                            onSaveEditColorMark={saveEditColorMark}
                            onStartEditColorMark={startEditColorMark}
                            onMoveColorMark={handleMoveColorMark}
                            onDeleteColorMark={handleDeleteColorMark}
                            onToggleColorSeatSelection={toggleColorSeatSelection}
                            onSetSelectedColorMark={(participantId, mark) => 
                              setSelectedColorMark(prev => ({ ...prev, [participantId]: mark }))
                            }
                            onAddColorMark={handleAddColorMark}
                          />
                        </div>
                      )}
                    </div>
                  );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: VOTINGS */}
              {activeTab === 'votes' && (
                <ProtocolVotingTab
                  protocol={protocol}
                  playerResults={playerResults}
                  voteDrafts={voteDrafts}
                  setVoteDrafts={setVoteDrafts}
                  highlightedRoundIdx={highlightedRoundIdx}
                  onAddVoting={handleAddVoting}
                  onDeleteVoting={handleDeleteVoting}
                  onRoundChange={handleRoundChange}
                  onConfirmOutcome={handleConfirmOutcome}
                  onResetOutcome={handleResetOutcome}
                  onRegisterRoundRef={(rIdx, el) => {
                    roundRefs.current[rIdx] = el;
                  }}
                />
              )}

              {/* TAB 3: NIGHTS & BEST MOVE */}
              {activeTab === 'nights' && (
                <ProtocolNightsTab
                  protocol={protocol}
                  playerResults={playerResults}
                  onFirstKilledChange={handleFirstKilledChange}
                  onZeroRoundVotedChange={handleZeroRoundVotedChange}
                  onToggleBestMoveSeat={toggleBestMoveSeat}
                  onAddNight={handleAddNight}
                  onDeleteNight={handleDeleteNight}
                  onShotChange={handleShotChange}
                  calculateGuessedBlacks={calculateGuessedBlacks}
                />
              )}

              {/* TAB 4: SUMMARY & FINALIZATION */}
              {activeTab === 'summary' && (
                <ProtocolSummaryTab
                  protocol={protocol}
                  playerResults={playerResults}
                  onWinnerTeamChange={handleWinnerTeamChange}
                  onReplacementChange={handleReplacementChange}
                  onJudgeNotesChange={handleJudgeNotesChange}
                />
              )}
            </>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="protocol-noir-footer protocol-modal-footer border-t px-3 py-2.5 sm:px-4 sm:py-3 shrink-0 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="text-[11px] sm:text-xs text-text-secondary min-w-0">
              {protocol.status === 'completed' ? (
                <span className="text-success font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Протокол завершён</span>
                </span>
              ) : (
                <span>Черновик сохраняется автоматически</span>
              )}
            </div>

            {protocol.status === 'draft' ? (
              <button
                type="button"
                onClick={() => {
                  const valErr = validateBeforeComplete();
                  if (valErr) {
                    setError(valErr);
                  } else {
                    setError(null);
                    setShowCompleteConfirm(true);
                  }
                }}
                className="protocol-action-primary w-full sm:w-auto px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
              >
                <FileCheck className="w-4 h-4 shrink-0" />
                <span>Завершить протокол</span>
              </button>
            ) : (
              <div className="grid grid-cols-1 min-[430px]:grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  id={`btn-protocol-${game?.game_number || 'export'}-png-results-trigger`}
                  onClick={() => setIsExportModalOpen(true)}
                  className="protocol-action-secondary px-3 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
                >
                  <ImageIcon className="w-4 h-4 shrink-0 text-success" />
                  <span>Результаты PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRevertConfirm(true)}
                  className="protocol-action-danger px-3 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>Вернуть в черновик</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* MODAL: CONFIRM DISCIPLINE ACTION */}
      {pendingDisciplineAction && (() => {
        const player = playerResults.find(p => p.participant_id === pendingDisciplineAction.participantId);
        const winnerTeam = getOppositeTeam(player?.role || null);
        const canConfirmPpk = pendingDisciplineAction.type !== 'ppk' || !!winnerTeam;

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
              <div className="flex items-center space-x-3 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">
                  {pendingDisciplineAction.type === 'foul_4' && 'Подтвердите 4-й фол'}
                  {pendingDisciplineAction.type === 'tech_2' && 'Подтвердите 2-й техфол'}
                  {pendingDisciplineAction.type === 'direct_removal' && 'Удаление решением судьи'}
                  {pendingDisciplineAction.type === 'ppk' && 'Завершить игру по ППК?'}
                  {pendingDisciplineAction.type === 'cancel_ppk' && 'Отменить завершение по ППК?'}
                  {pendingDisciplineAction.type === 'cancel_direct' && 'Отменить удаление судьи?'}
                </h3>
              </div>

              <div className="text-xs sm:text-sm text-text-secondary space-y-2">
                <p>
                  Игрок <strong>#{pendingDisciplineAction.seatNum} ({pendingDisciplineAction.playerName})</strong>
                </p>
                {pendingDisciplineAction.type === 'foul_4' && (
                  <p>Будет автоматически удалён из игры по причине «4-й фол».</p>
                )}
                {pendingDisciplineAction.type === 'tech_2' && (
                  <p>
                    Будет автоматически удалён из игры по причине «2-й техфол».
                    Тип фола: <span className="text-rose-400 font-bold">{pendingDisciplineAction.techType === 'minor' ? 'Малый' : 'Большой'}</span>
                  </p>
                )}
                {pendingDisciplineAction.type === 'direct_removal' && (
                  <p>Игрок будет удалён из игры по решению судьи (дисквалификация).</p>
                )}
                {pendingDisciplineAction.type === 'ppk' && (
                  <div className="bg-surface-2/60 p-3 rounded-lg border border-border-soft/60 space-y-1">
                    <p>Игровой процесс завершится, но протокол останется открыт для проверки и выставления баллов.</p>
                    <p className="text-rose-400 font-bold">
                      Победитель: {winnerTeam === 'red' ? 'Красные' : winnerTeam === 'black' ? 'Чёрные' : 'Не определён'}
                    </p>
                    {!winnerTeam && (
                      <p className="text-rose-500 text-[11px] mt-1 bg-rose-500/10 p-2 rounded">
                        Сначала назначьте роль участнику в рассадке
                      </p>
                    )}
                    <p className="text-amber-500 font-medium">Виновнику будет начислен штраф −1.0.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingDisciplineAction(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold flex-1 sm:flex-none"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={!canConfirmPpk}
                  onClick={confirmDisciplineAction}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md flex-1 sm:flex-none ${
                    ['foul_4', 'tech_2', 'direct_removal', 'ppk'].includes(pendingDisciplineAction.type)
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-accent hover:bg-accent-hover text-white'
                  } disabled:opacity-50`}
                >
                  Подтвердить
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CONFIRM EXIT TYPE CHANGE WHEN COLOR PROTOCOL EXISTS */}
      {pendingExitTypeConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <h3 className="text-base font-bold">Очистить оставленный протокол?</h3>
            </div>

            <p className="text-xs sm:text-sm text-text-secondary">
              У игрока #{pendingExitTypeConfirm.seatNum} ({pendingExitTypeConfirm.playerName}) есть сохранённый цветовой протокол. Изменение статуса ухода с «Убит» удалит эти записи.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingExitTypeConfirm(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmExitTypeChange}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Удалить и изменить статус
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM COMPLETE PROTOCOL */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <FileCheck className="w-6 h-6" />
              <h3 className="text-lg font-bold">Завершить протокол игры?</h3>
            </div>

            <div className="text-xs sm:text-sm text-text-secondary space-y-2 bg-surface-2/60 p-3 rounded-xl border border-border-soft/60">
              <p>
                Победитель:{' '}
                <strong className={protocol.winner_team === 'red' ? 'text-rose-400' : 'text-text-primary'}>
                  {protocol.winner_team === 'red' ? 'Красные' : protocol.winner_team === 'black' ? 'Чёрные' : 'Не выбран'}
                </strong>
              </p>
              {protocol.best_moves && protocol.best_moves.map(bm => {
                const bmInfo = calculateGuessedBlacks(bm.seat_numbers);
                const title = bm.source === 'first_killed' ? 'ЛХ Первого убитого' : 'ЛХ Заголосованного в 0 круг';
                const formattedSeats = bm.seat_numbers.length > 0
                  ? `#${bm.seat_numbers.join(', #')}`
                  : '0 номеров';
                return (
                  <p key={bm.source}>
                    {title}: {formattedSeats} (+{bmInfo.bonusPoints} б.)
                  </p>
                );
              })}
              {(!protocol.best_moves || protocol.best_moves.length === 0) && (
                <p>Лучший ход: Не указан</p>
              )}
              <p className="text-text-secondary text-xs">
                После завершения игра получит статус «Завершена», и станет доступен запуск следующей игры турнира.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleComplete}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md"
              >
                {submitting ? 'Завершаем...' : 'Подтвердить завершение'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM REVERT TO DRAFT */}
      {showRevertConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold">Вернуть протокол в черновик?</h3>
            </div>

            <p className="text-xs sm:text-sm text-text-secondary">
              Игра вернётся в статус «Активна», и вы сможете внести любые исправления в протокол.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowRevertConfirm(false)}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleRevertToDraft}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md"
              >
                {submitting ? 'Возвращаем...' : 'Да, вернуть в черновик'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM FIRST KILLED CI RESET */}
      {showCiConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Подтверждение смены первоубиенного</h3>
            </div>

            <p className="text-xs sm:text-sm text-text-secondary">
              Выбранный ЛХ и ручной Ci прежнего первоубиенного будут очищены.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCiConfirmModal(false);
                  setPendingFirstKilledId(null);
                }}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const prevId = protocol.first_killed_participant_id;
                  if (prevId) {
                    updatePlayerResult(prevId, { ci_points: 0 });
                  }
                  setProtocol((prev) => {
                    let moves = [...(prev.best_moves || [])].filter(bm => bm.source !== 'first_killed');
                    if (pendingFirstKilledId) {
                      moves.push({ participant_id: pendingFirstKilledId, source: 'first_killed', seat_numbers: [] });
                    }
                    return { ...prev, first_killed_participant_id: pendingFirstKilledId, best_moves: moves };
                  });
                  setShowCiConfirmModal(false);
                  setPendingFirstKilledId(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Сменить и обнулить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM ZERO ROUND VOTED BM RESET */}
      {showZeroRoundConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border-soft rounded-2xl p-5 max-w-md w-full space-y-4 text-text-primary shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Подтверждение смены игрока нулевого круга</h3>
            </div>

            <p className="text-xs sm:text-sm text-text-secondary">
              Выбранные номера ЛХ прежнего игрока будут очищены.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowZeroRoundConfirmModal(false);
                  setPendingZeroRoundVotedId(null);
                }}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover text-text-secondary text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setProtocol((prev) => {
                    let moves = [...(prev.best_moves || [])].filter(bm => bm.source !== 'zero_round_voted');
                    if (pendingZeroRoundVotedId) {
                      moves.push({ participant_id: pendingZeroRoundVotedId, source: 'zero_round_voted', seat_numbers: [] });
                    }
                    return { ...prev, zero_round_voted_participant_id: pendingZeroRoundVotedId, best_moves: moves };
                  });
                  setShowZeroRoundConfirmModal(false);
                  setPendingZeroRoundVotedId(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Сменить и очистить
              </button>
            </div>
          </div>
        </div>
      )}
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
    </div>
  );
};
