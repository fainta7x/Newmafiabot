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
  Plus,
  Trash2,
  Shield,
  Award,
  Clock,
  ArrowUp,
  ArrowDown,
  Pencil
} from 'lucide-react';
import {
  api,
  TournamentGame,
  TournamentGameProtocolData,
  PlayerResultData
} from '../../../lib/api';

export function formatColorMark(entry: { seat_numbers: number[]; mark: 'red' | 'black' | 'sheriff' }): string {
  if (!entry || !entry.seat_numbers) return '';
  const sorted = [...entry.seat_numbers].sort((a, b) => a - b);
  const markLabel = entry.mark === 'red' ? 'кр' : entry.mark === 'black' ? 'ч' : 'ш';
  return `${sorted.join(' ')} ${markLabel}`;
}

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

  // Decimal inputs state (strings)
  const [playerInputStrings, setPlayerInputStrings] = useState<Record<string, string>>({});

  // Color Protocol builder state per player
  const [selectedColorSeats, setSelectedColorSeats] = useState<Record<string, number[]>>({});
  const [selectedColorMark, setSelectedColorMark] = useState<Record<string, 'red' | 'black' | 'sheriff'>>({});

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
    Record<string, { index: number; seats: number[]; mark: 'red' | 'black' | 'sheriff' } | null>
  >({});

  // Exit type change confirmation modal (when color_protocol is present)
  const [pendingExitTypeConfirm, setPendingExitTypeConfirm] = useState<{
    participantId: string;
    newExitType: PlayerResultData['exit_type'];
    playerName: string;
    seatNum: number;
  } | null>(null);

  // Helper for decimal parsing
  const parseDecimalString = (val: string): number => {
    if (!val || val.trim() === '' || val === '-') return 0;
    const normalized = val.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleDecimalChange = (
    participantId: string,
    field: 'protocol_bonus' | 'judge_bonus' | 'penalty_points' | 'ci_points',
    rawStr: string
  ) => {
    const key = `${participantId}_${field}`;
    setPlayerInputStrings((prev) => ({ ...prev, [key]: rawStr }));
    const numVal = parseDecimalString(rawStr);
    updatePlayerResult(participantId, { [field]: numVal });
  };

  const getDecimalInputValue = (
    participantId: string,
    field: 'protocol_bonus' | 'judge_bonus' | 'penalty_points' | 'ci_points',
    numVal: number
  ): string => {
    const key = `${participantId}_${field}`;
    if (key in playerInputStrings) {
      return playerInputStrings[key];
    }
    return numVal !== undefined && numVal !== null ? String(numVal) : '0';
  };

  // Load Protocol Data
  useEffect(() => {
    if (!isOpen || !gameId) return;

    let isMounted = true;
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);
    setPlayerInputStrings({});

    let restoredBackupData: { protocol: any; playerResults: any } | null = null;

    api.getGameProtocol(tournamentId, gameId)
      .then((res) => {
        if (!isMounted) return;
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
        const backupKey = `tournament_protocol_backup_${gameId}`;
        const savedBackup = localStorage.getItem(backupKey);
        if (savedBackup && res.protocol.status === 'draft') {
          try {
            const parsed = JSON.parse(savedBackup);
            if (
              parsed.updatedAt &&
              new Date(parsed.updatedAt).getTime() > new Date(res.protocol.updated_at || 0).getTime()
            ) {
              if (parsed.protocol && parsed.playerResults) {
                restoredBackupData = parsed;
                setProtocol(parsed.protocol);
                setPlayerResults(parsed.playerResults);
                protocolRef.current = parsed.protocol;
                playerResultsRef.current = parsed.playerResults;
                dirtyRevision.current = 1;
                setSaveStatus('unsaved');
              }
            }
          } catch (_) {}
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
          if (restoredBackupData) {
            performSave(true);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tournamentId, gameId]);

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
    const backupKey = `tournament_protocol_backup_${gameId}`;
    localStorage.setItem(
      backupKey,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        protocol,
        playerResults
      })
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

          const payload = {
            protocol: currentProto,
            player_results: currentResults.map((pr) => ({
              participant_id: pr.participant_id,
              exit_type: pr.exit_type,
              exit_order: pr.exit_order,
              regular_fouls: pr.regular_fouls,
              technical_fouls: pr.technical_fouls,
              judge_bonus: pr.judge_bonus,
              protocol_bonus: pr.protocol_bonus,
              penalty_points: pr.penalty_points,
              color_protocol: pr.color_protocol || [],
              notes: pr.notes
            }))
          };

          const res = await api.saveGameProtocol(tournamentId, gameId, payload);
          lastSavedRevision.current = Math.max(lastSavedRevision.current, revisionToSave);

          if (dirtyRevision.current === revisionToSave) {
            isUpdatingFromServer.current = true;
            setProtocol(res.protocol);
            setPlayerResults(res.player_results);
            setSaveStatus('saved');
            const backupKey = `tournament_protocol_backup_${gameId}`;
            localStorage.removeItem(backupKey);
          } else {
            setSaveStatus('unsaved');
          }

          if (onProtocolUpdated) onProtocolUpdated();
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

  // Color protocol handlers per player
  const toggleColorSeatSelection = (participantId: string, seatNum: number) => {
    setSelectedColorSeats((prev) => {
      const current = prev[participantId] || [];
      if (current.includes(seatNum)) {
        return { ...prev, [participantId]: current.filter((s) => s !== seatNum) };
      } else {
        return { ...prev, [participantId]: [...current, seatNum].sort((a, b) => a - b) };
      }
    });
  };

  const handleAddColorMark = (participantId: string) => {
    const seats = selectedColorSeats[participantId] || [];
    if (seats.length === 0) return;
    const mark = selectedColorMark[participantId] || 'red';

    setPlayerResults((prev) =>
      prev.map((pr) => {
        if (pr.participant_id === participantId) {
          const list = pr.color_protocol || [];
          return {
            ...pr,
            color_protocol: [...list, { seat_numbers: [...seats].sort((a, b) => a - b), mark }]
          };
        }
        return pr;
      })
    );

    setSelectedColorSeats((prev) => ({ ...prev, [participantId]: [] }));
  };

  const handleMoveColorMark = (participantId: string, fromIndex: number, toIndex: number) => {
    setPlayerResults((prev) =>
      prev.map((pr) => {
        if (pr.participant_id === participantId) {
          const list = [...(pr.color_protocol || [])];
          if (toIndex < 0 || toIndex >= list.length) return pr;
          const [moved] = list.splice(fromIndex, 1);
          list.splice(toIndex, 0, moved);
          return { ...pr, color_protocol: list };
        }
        return pr;
      })
    );
  };

  const handleDeleteColorMark = (participantId: string, index: number) => {
    setPlayerResults((prev) =>
      prev.map((pr) => {
        if (pr.participant_id === participantId) {
          const list = (pr.color_protocol || []).filter((_, i) => i !== index);
          return { ...pr, color_protocol: list };
        }
        return pr;
      })
    );
  };

  const startEditColorMark = (participantId: string, index: number, entry: { seat_numbers: number[]; mark: 'red' | 'black' | 'sheriff' }) => {
    setEditingColorMarkMap((prev) => ({
      ...prev,
      [participantId]: { index, seats: [...entry.seat_numbers], mark: entry.mark }
    }));
  };

  const cancelEditColorMark = (participantId: string) => {
    setEditingColorMarkMap((prev) => ({ ...prev, [participantId]: null }));
  };

  const toggleEditColorSeat = (participantId: string, seatNum: number) => {
    setEditingColorMarkMap((prev) => {
      const current = prev[participantId];
      if (!current) return prev;
      const seats = current.seats.includes(seatNum)
        ? current.seats.filter((s) => s !== seatNum)
        : [...current.seats, seatNum].sort((a, b) => a - b);
      return { ...prev, [participantId]: { ...current, seats } };
    });
  };

  const setEditColorMarkType = (participantId: string, mark: 'red' | 'black' | 'sheriff') => {
    setEditingColorMarkMap((prev) => {
      const current = prev[participantId];
      if (!current) return prev;
      return { ...prev, [participantId]: { ...current, mark } };
    });
  };

  const saveEditColorMark = (participantId: string) => {
    const editState = editingColorMarkMap[participantId];
    if (!editState || editState.seats.length === 0) return;

    setPlayerResults((prev) =>
      prev.map((pr) => {
        if (pr.participant_id === participantId) {
          const list = [...(pr.color_protocol || [])];
          if (editState.index >= 0 && editState.index < list.length) {
            list[editState.index] = {
              seat_numbers: [...editState.seats].sort((a, b) => a - b),
              mark: editState.mark
            };
          }
          return { ...pr, color_protocol: list };
        }
        return pr;
      })
    );

    cancelEditColorMark(participantId);
  };

  // Calculate live Best Move Scores
  const calculateGuessedBlacks = (seats: number[]) => {
    let guessedBlacks = 0;
    for (const seatNum of seats) {
      const p = playerResults.find((pr) => pr.seat_number === seatNum);
      if (p && p.role) {
        const lower = p.role.toLowerCase();
        if (lower === 'mafia' || lower === 'don' || lower === 'black' || lower === 'мафия' || lower === 'дон') {
          guessedBlacks++;
        }
      }
    }
    let bonusPoints = 0;
    if (guessedBlacks === 1) bonusPoints = 0.1;
    else if (guessedBlacks === 2) bonusPoints = 0.3;
    else if (guessedBlacks >= 3) bonusPoints = 0.6;
    return { guessedBlacks, bonusPoints };
  };

  const getBestMoveForSource = (source: string) => {
    return (protocol.best_moves || []).find(bm => bm.source === source);
  };

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
      const payload = {
        protocol,
        player_results: playerResults.map((pr) => ({
          participant_id: pr.participant_id,
          exit_type: pr.exit_type,
          exit_order: pr.exit_order,
          regular_fouls: pr.regular_fouls,
          technical_fouls: pr.technical_fouls,
          judge_bonus: pr.judge_bonus,
          protocol_bonus: pr.protocol_bonus,
          penalty_points: pr.penalty_points,
          color_protocol: pr.color_protocol || [],
          notes: pr.notes
        }))
      };

      const res = await api.completeGameProtocol(tournamentId, gameId, payload);
      setProtocol(res.protocol);
      setPlayerResults(res.player_results);
      if (res.game) setGame(res.game);
      setSaveStatus('saved');
      setShowCompleteConfirm(false);

      // Clear local backup
      localStorage.removeItem(`tournament_protocol_backup_${gameId}`);

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
      if (onProtocolUpdated) onProtocolUpdated();
    } catch (err: any) {
      setError(err.message || 'Не удалось вернуть в черновик');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBmCard = (source: 'first_killed' | 'zero_round_voted', participantId: string) => {
    const player = playerResults.find(p => p.participant_id === participantId);
    if (!player) return null;
    const bm = getBestMoveForSource(source);
    const seats = bm?.seat_numbers || [];
    const { guessedBlacks, bonusPoints } = calculateGuessedBlacks(seats);
    const title = source === 'first_killed' ? 'ЛХ первого убитого' : 'ЛХ игрока нулевого круга';

    return (
      <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 flex flex-col space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/60 pb-3 gap-2">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold text-slate-100">{title}</h3>
            </div>
            <div className="text-xs text-slate-400 mt-1 pl-6">
              #{player.seat_number} — {player.display_name}
            </div>
          </div>
          
          <div className="flex flex-row items-center gap-3 sm:justify-end">
             <div className="text-xs font-semibold text-slate-300 bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700/50">
               {seats.length} из 3
             </div>
             <div className="text-xs font-medium text-amber-400 bg-amber-900/20 px-2 py-1 rounded-md border border-amber-900/40">
               Угадано: {guessedBlacks} (+{bonusPoints} б.)
             </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-5 gap-2 pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isSelected = seats.includes(num);
              return (
                <button
                  key={num}
                  type="button"
                  disabled={protocol.status === 'completed'}
                  onClick={() => toggleBestMoveSeat(source, participantId, num)}
                  className={`min-h-[44px] flex items-center justify-center rounded-xl text-sm font-bold border transition ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 text-slate-100 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-800/90 px-4 py-3 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg">
              #{game?.game_number || 1}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-white">
                  Протокол игры #{game?.game_number || 1}
                </h2>
                {protocol.status === 'completed' ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Завершён
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Черновик
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Судья: {game?.judge_name || 'Не указан'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Save Status Badge */}
            {protocol.status === 'draft' && (
              <div className="text-xs flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Сохранено</span>
                  </>
                )}
                {saveStatus === 'saving' && (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span className="text-amber-400 font-medium">Сохраняем...</span>
                  </>
                )}
                {saveStatus === 'unsaved' && (
                  <>
                    <Save className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Не сохранено</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400 font-medium">Ошибка</span>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleModalClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
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
        <div className="bg-slate-800/40 border-b border-slate-800 px-3 py-2 flex items-center space-x-1 sm:space-x-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('players')}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'players'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Игроки</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('votes')}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'votes'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Vote className="w-4 h-4" />
            <span>Голосования</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nights')}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'nights'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Ночи и ЛХ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'summary'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Итоги</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-400">
              <Clock className="w-8 h-8 animate-spin text-amber-500" />
              <span className="text-sm font-medium">Загрузка данных протокола...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: PLAYERS PROTOCOL */}
              {activeTab === 'players' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Заполните фолы, доп. баллы, штрафы и цветовые протоколы участников:</span>
                    <span className="font-semibold text-slate-300">Игроков: {playerResults.length}/10</span>
                  </div>

                  <div className="space-y-3">
                    {playerResults.map((player) => {
                      const isKilled = player.exit_type === 'killed';
                      const hasColorProtocol = player.color_protocol && player.color_protocol.length > 0;
                      const showColorSection = isKilled || hasColorProtocol;

                      return (
                        <div
                          key={player.participant_id}
                          className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/80 space-y-2.5 transition hover:border-slate-600"
                        >
                          {/* Top Row: Seat, Name, Role, Exit Status */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-500/30">
                                #{player.seat_number}
                              </span>
                              <span className="font-semibold text-sm text-slate-100">
                                {player.display_name}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2 text-xs">
                              <span className="text-slate-400">Роль:</span>
                              <select
                                disabled={protocol.status === 'completed'}
                                value={player.role || 'citizen'}
                                onChange={(e) =>
                                  updatePlayerResult(player.participant_id, {
                                    role: e.target.value as any
                                  })
                                }
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:border-amber-500 focus:outline-none disabled:opacity-60"
                              >
                                <option value="citizen">Мирный</option>
                                <option value="sheriff">Шериф</option>
                                <option value="mafia">Мафия</option>
                                <option value="don">Дон</option>
                              </select>

                              <span className="text-slate-400 ml-1">Статус:</span>
                              <select
                                disabled={protocol.status === 'completed'}
                                value={player.exit_type}
                                onChange={(e) =>
                                  updatePlayerResult(player.participant_id, {
                                    exit_type: e.target.value as any
                                  })
                                }
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:border-amber-500 focus:outline-none disabled:opacity-60"
                              >
                                <option value="alive">Жив</option>
                                <option value="killed">Убит (ночью)</option>
                                <option value="voted_zero_round">Заголосован (0 круг)</option>
                                <option value="voted_day">Заголосован (день)</option>
                                <option value="removed">Снят (4 фола/дискв.)</option>
                              </select>
                            </div>
                          </div>

                          {/* Middle Row: Fouls & Bonuses Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                              <span className="text-slate-400 block mb-1">Обычные фолы</span>
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed' || player.regular_fouls <= 0}
                                  onClick={() =>
                                    updatePlayerResult(player.participant_id, {
                                      regular_fouls: Math.max(0, player.regular_fouls - 1)
                                    })
                                  }
                                  className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center"
                                >
                                  -
                                </button>
                                <span className="flex-1 text-center font-bold text-amber-400 text-sm">
                                  {player.regular_fouls}
                                </span>
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed' || player.regular_fouls >= 4}
                                  onClick={() =>
                                    updatePlayerResult(player.participant_id, {
                                      regular_fouls: Math.min(4, player.regular_fouls + 1)
                                    })
                                  }
                                  className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                              <span className="text-slate-400 block mb-1">Тех. фолы</span>
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed' || player.technical_fouls <= 0}
                                  onClick={() =>
                                    updatePlayerResult(player.participant_id, {
                                      technical_fouls: Math.max(0, player.technical_fouls - 1)
                                    })
                                  }
                                  className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center"
                                >
                                  -
                                </button>
                                <span className="flex-1 text-center font-bold text-rose-400 text-sm">
                                  {player.technical_fouls}
                                </span>
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed'}
                                  onClick={() =>
                                    updatePlayerResult(player.participant_id, {
                                      technical_fouls: player.technical_fouls + 1
                                    })
                                  }
                                  className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                              <span className="text-slate-400 block mb-1">Балл за прот.</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={protocol.status === 'completed'}
                                value={getDecimalInputValue(player.participant_id, 'protocol_bonus', player.protocol_bonus ?? 0)}
                                onChange={(e) => handleDecimalChange(player.participant_id, 'protocol_bonus', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs text-center focus:border-amber-500 focus:outline-none disabled:opacity-50"
                              />
                            </div>

                            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                              <span className="text-slate-400 block mb-1">Балл судьи</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={protocol.status === 'completed'}
                                value={getDecimalInputValue(player.participant_id, 'judge_bonus', player.judge_bonus ?? 0)}
                                onChange={(e) => handleDecimalChange(player.participant_id, 'judge_bonus', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs text-center focus:border-amber-500 focus:outline-none disabled:opacity-50"
                              />
                            </div>

                            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                              <span className="text-slate-400 block mb-1">Штраф</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={protocol.status === 'completed'}
                                value={getDecimalInputValue(player.participant_id, 'penalty_points', player.penalty_points ?? 0)}
                                onChange={(e) => handleDecimalChange(player.participant_id, 'penalty_points', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs text-center focus:border-amber-500 focus:outline-none disabled:opacity-50"
                              />
                            </div>

                            {player.participant_id === protocol.first_killed_participant_id && (
                              <div className="bg-slate-900/60 p-2 rounded-lg border border-cyan-500/40 col-span-2 sm:col-span-1 space-y-1">
                                <span className="text-cyan-400 font-bold block">Коэффициент Ci</span>
                                <p className="text-[10px] text-slate-300 font-medium">
                                  Ci рассчитывается автоматически по дистанции турнира
                                </p>
                              </div>
                            )}
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
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                            />
                          </div>

                          {/* Color Protocol Section (for killed player or existing marks) */}
                          {showColorSection && (
                            <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-700/60 space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                                <span>Оставленный протокол:</span>
                                {!isKilled && (
                                  <span className="text-[10px] text-amber-400/80">
                                    (Статус изменён, но протокол сохранён)
                                  </span>
                                )}
                              </div>

                              {/* Saved marks list */}
                              {player.color_protocol && player.color_protocol.length > 0 ? (
                                <div className="space-y-1">
                                  {player.color_protocol.map((entry, eIdx) => {
                                    const editState = editingColorMarkMap[player.participant_id];
                                    const isEditingThis = editState && editState.index === eIdx;

                                    if (isEditingThis) {
                                      return (
                                        <div
                                          key={eIdx}
                                          className="p-2 bg-slate-800/90 rounded border border-amber-500/50 space-y-2 text-xs"
                                        >
                                          <div className="text-[11px] font-bold text-amber-400">
                                            Редактирование записи #{eIdx + 1}:
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sNum) => {
                                              const isSel = editState.seats.includes(sNum);
                                              return (
                                                <button
                                                  key={sNum}
                                                  type="button"
                                                  onClick={() => toggleEditColorSeat(player.participant_id, sNum)}
                                                  className={`w-6 h-6 rounded text-[11px] font-bold border transition ${
                                                    isSel
                                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                                                  }`}
                                                >
                                                  #{sNum}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center space-x-1 text-[11px]">
                                              <button
                                                type="button"
                                                onClick={() => setEditColorMarkType(player.participant_id, 'red')}
                                                className={`px-2 py-0.5 rounded font-bold transition ${
                                                  editState.mark === 'red'
                                                    ? 'bg-rose-600 text-white'
                                                    : 'bg-slate-900 text-rose-400 hover:bg-slate-700'
                                                }`}
                                              >
                                                кр
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setEditColorMarkType(player.participant_id, 'black')}
                                                className={`px-2 py-0.5 rounded font-bold transition ${
                                                  editState.mark === 'black'
                                                    ? 'bg-slate-950 text-amber-400 border border-slate-700'
                                                    : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                                                }`}
                                              >
                                                ч
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setEditColorMarkType(player.participant_id, 'sheriff')}
                                                className={`px-2 py-0.5 rounded font-bold transition ${
                                                  editState.mark === 'sheriff'
                                                    ? 'bg-amber-500 text-slate-950'
                                                    : 'bg-slate-900 text-amber-400 hover:bg-slate-700'
                                                }`}
                                              >
                                                ш
                                              </button>
                                            </div>
                                            <div className="flex items-center space-x-1">
                                              <button
                                                type="button"
                                                onClick={() => cancelEditColorMark(player.participant_id)}
                                                className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px]"
                                              >
                                                Отмена
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => saveEditColorMark(player.participant_id)}
                                                className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px]"
                                              >
                                                Сохранить
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div
                                        key={eIdx}
                                        className="flex items-center justify-between bg-slate-800 px-2.5 py-1 rounded border border-slate-700 text-xs"
                                      >
                                        <span className="font-bold text-amber-300">
                                          {formatColorMark(entry)}
                                        </span>

                                        {protocol.status === 'draft' && (
                                          <div className="flex items-center space-x-1">
                                            <button
                                              type="button"
                                              onClick={() => startEditColorMark(player.participant_id, eIdx, entry)}
                                              title="Редактировать"
                                              className="p-0.5 text-slate-400 hover:text-amber-400 transition mr-1"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={eIdx === 0}
                                              onClick={() => handleMoveColorMark(player.participant_id, eIdx, eIdx - 1)}
                                              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                                            >
                                              <ArrowUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={eIdx === player.color_protocol.length - 1}
                                              onClick={() => handleMoveColorMark(player.participant_id, eIdx, eIdx + 1)}
                                              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                                            >
                                              <ArrowDown className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteColorMark(player.participant_id, eIdx)}
                                              className="p-0.5 text-rose-400 hover:text-rose-300 ml-1"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-500 italic">
                                  Записи отсутствуют
                                </div>
                              )}

                              {/* Add entry form */}
                              {protocol.status === 'draft' && isKilled && (
                                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                                  <div className="text-[11px] text-slate-400">Выберите места (1-10):</div>
                                  <div className="flex flex-wrap gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sNum) => {
                                      const isSelected = (selectedColorSeats[player.participant_id] || []).includes(sNum);
                                      return (
                                        <button
                                          key={sNum}
                                          type="button"
                                          onClick={() => toggleColorSeatSelection(player.participant_id, sNum)}
                                          className={`w-6 h-6 rounded text-xs font-bold border transition ${
                                            isSelected
                                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                                          }`}
                                        >
                                          {sNum}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center space-x-1 text-xs">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedColorMark((prev) => ({ ...prev, [player.participant_id]: 'red' }))
                                        }
                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                          (selectedColorMark[player.participant_id] || 'red') === 'red'
                                            ? 'bg-rose-600 text-white border-rose-500'
                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}
                                      >
                                        Красный
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedColorMark((prev) => ({ ...prev, [player.participant_id]: 'black' }))
                                        }
                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                          selectedColorMark[player.participant_id] === 'black'
                                            ? 'bg-slate-950 text-slate-200 border-slate-500'
                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}
                                      >
                                        Чёрный
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedColorMark((prev) => ({ ...prev, [player.participant_id]: 'sheriff' }))
                                        }
                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                          selectedColorMark[player.participant_id] === 'sheriff'
                                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}
                                      >
                                        Шериф
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={(selectedColorSeats[player.participant_id] || []).length === 0}
                                      onClick={() => handleAddColorMark(player.participant_id)}
                                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center space-x-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Добавить</span>
                                    </button>
                                  </div>
                                </div>
                              )}
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Протокол дневных голосов и переголосований по кругам:
                    </span>
                    {protocol.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => {
                          const currentVotes = protocol.votes || [];
                          const nextRoundNum = currentVotes.length + 1;
                          setProtocol((prev) => ({
                            ...prev,
                            votes: [
                              ...(prev.votes || []),
                              {
                                round_number: nextRoundNum,
                                is_revote: false,
                                nominated_seats: [],
                                vote_counts: {}
                              }
                            ]
                          }));
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Добавить круг</span>
                      </button>
                    )}
                  </div>

                  {!protocol.votes || protocol.votes.length === 0 ? (
                    <div className="bg-slate-800/40 rounded-xl p-8 text-center text-slate-400 text-xs border border-slate-800">
                      Голосования не зафиксированы. Нажмите «Добавить круг» для внесения данных.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {protocol.votes.map((round, rIdx) => (
                        <div
                          key={rIdx}
                          className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/80 space-y-3"
                        >
                          {/* Round Header */}
                          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                            <div className="flex items-center space-x-3">
                              <span className="font-bold text-sm text-amber-400">
                                Круг #{round.round_number || rIdx + 1}
                              </span>

                              {/* Toggle: Голосование / Переголосование */}
                              <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed'}
                                  onClick={() => {
                                    setProtocol((prev) => {
                                      const copy = [...(prev.votes || [])];
                                      copy[rIdx] = { ...copy[rIdx], is_revote: false };
                                      return { ...prev, votes: copy };
                                    });
                                  }}
                                  className={`px-2 py-0.5 text-[11px] rounded font-medium transition ${
                                    !round.is_revote
                                      ? 'bg-amber-500 text-slate-950 font-bold'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  Голосование
                                </button>
                                <button
                                  type="button"
                                  disabled={protocol.status === 'completed'}
                                  onClick={() => {
                                    setProtocol((prev) => {
                                      const copy = [...(prev.votes || [])];
                                      copy[rIdx] = { ...copy[rIdx], is_revote: true };
                                      return { ...prev, votes: copy };
                                    });
                                  }}
                                  className={`px-2 py-0.5 text-[11px] rounded font-medium transition ${
                                    round.is_revote
                                      ? 'bg-purple-600 text-white font-bold'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  Переголосование
                                </button>
                              </div>
                            </div>

                            {protocol.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProtocol((prev) => ({
                                    ...prev,
                                    votes: (prev.votes || []).filter((_, idx) => idx !== rIdx).map((v, idx) => ({
                                      ...v,
                                      round_number: idx + 1
                                    }))
                                  }));
                                }}
                                className="text-slate-500 hover:text-rose-400 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Candidate Seats Selector */}
                          <div className="space-y-1.5">
                            <span className="text-xs text-slate-400 block">
                              Выставленные кандидаты (выберите игрока 1-10):
                            </span>
                            <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1.5 w-full">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seatNum) => {
                                const isNominated = (round.nominated_seats || []).includes(seatNum);
                                return (
                                  <button
                                    key={seatNum}
                                    type="button"
                                    disabled={protocol.status === 'completed'}
                                    onClick={() => {
                                      setProtocol((prev) => {
                                        const votesCopy = [...(prev.votes || [])];
                                        const r = votesCopy[rIdx];
                                        const currentNoms = r.nominated_seats || [];
                                        let updatedNoms: number[];
                                        let updatedCounts = { ...(r.vote_counts || {}) };

                                        if (currentNoms.includes(seatNum)) {
                                          updatedNoms = currentNoms.filter((s) => s !== seatNum);
                                          delete updatedCounts[seatNum];
                                        } else {
                                          updatedNoms = Array.from(new Set([...currentNoms, seatNum])).sort((a, b) => a - b);
                                          updatedCounts[seatNum] = updatedCounts[seatNum] || 0;
                                        }

                                        votesCopy[rIdx] = {
                                          ...r,
                                          nominated_seats: updatedNoms,
                                          vote_counts: updatedCounts
                                        };
                                        return { ...prev, votes: votesCopy };
                                      });
                                    }}
                                    className={`w-full h-11 sm:w-8 sm:h-8 rounded-lg text-sm font-bold border transition ${
                                      isNominated
                                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                                    }`}
                                  >
                                    #{seatNum}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Vote Counts per Candidate */}
                          {round.nominated_seats && round.nominated_seats.length > 0 && (
                            <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 block">Голоса за участников:</span>
                                <span className="text-xs text-amber-400 font-medium">
                                  Всего: {round.nominated_seats.reduce((sum, s) => sum + (round.vote_counts?.[s] || 0), 0)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {round.nominated_seats.map((seatNum) => {
                                  const p = playerResults.find((pr) => pr.seat_number === seatNum);
                                  const count = round.vote_counts?.[seatNum] ?? 0;

                                  return (
                                    <div
                                      key={seatNum}
                                      className="bg-slate-900 p-2 rounded-lg border border-slate-700/80 text-xs flex flex-col space-y-1"
                                    >
                                      <span className="font-semibold text-slate-200 truncate">
                                        #{seatNum} {p?.display_name || ''}
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        disabled={protocol.status === 'completed'}
                                        value={count}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0;
                                          setProtocol((prev) => {
                                            const votesCopy = [...(prev.votes || [])];
                                            const r = votesCopy[rIdx];
                                            votesCopy[rIdx] = {
                                              ...r,
                                              vote_counts: {
                                                ...(r.vote_counts || {}),
                                                [seatNum]: Math.max(0, Math.min(10, val))
                                              }
                                            };
                                            return { ...prev, votes: votesCopy };
                                          });
                                        }}
                                        className="w-full h-11 bg-slate-800 border border-slate-700 rounded px-2 text-center font-bold text-lg text-amber-400 focus:border-amber-500 focus:outline-none"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: NIGHTS & BEST MOVE */}
              {activeTab === 'nights' && (
                <div className="space-y-5">
                  {/* First Killed & Zero Round Voted Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/80 space-y-2">
                      <label className="text-xs font-semibold text-slate-200 block">
                        Первоубиенный игрок (ночь 1):
                      </label>
                      <select
                        disabled={protocol.status === 'completed'}
                        value={protocol.first_killed_participant_id || ''}
                        onChange={(e) => {
                          const newId = e.target.value || null;
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
                            return { ...prev, first_killed_participant_id: newId, best_moves: moves };
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">Не выбрано</option>
                        {playerResults.map((p) => (
                          <option key={p.participant_id} value={p.participant_id}>
                            #{p.seat_number} - {p.display_name} ({p.exit_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/80 space-y-2">
                      <label className="text-xs font-semibold text-slate-200 block">
                        Заголосованный в нулевой круг (день 1):
                      </label>
                      <select
                        disabled={protocol.status === 'completed'}
                        value={protocol.zero_round_voted_participant_id || ''}
                        onChange={(e) => {
                          const newId = e.target.value || null;
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
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">Не выбрано</option>
                        {playerResults.map((p) => (
                          <option key={p.participant_id} value={p.participant_id}>
                            #{p.seat_number} - {p.display_name} ({p.exit_type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Best Move Section */}
                  <div className="space-y-4">
                    {protocol.first_killed_participant_id && renderBmCard('first_killed', protocol.first_killed_participant_id)}
                    {protocol.zero_round_voted_participant_id && renderBmCard('zero_round_voted', protocol.zero_round_voted_participant_id)}

                    {!protocol.first_killed_participant_id && !protocol.zero_round_voted_participant_id && (
                      <div className="text-xs text-slate-500 italic py-2">
                        Выберите первоубиенного игрока или заголосованного в нулевой круг для ввода ЛХ.
                      </div>
                    )}
                  </div>

                  {/* Night Shots Journal */}
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <Moon className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-xs font-bold text-slate-100">Журнал ночных отстрелов</h3>
                      </div>
                      {protocol.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentShots = protocol.shots || [];
                            const nextNight = currentShots.length + 1;
                            setProtocol((prev) => ({
                              ...prev,
                              shots: [
                                ...(prev.shots || []),
                                {
                                  night_number: nextNight,
                                  target_seat: 1,
                                  result: 'killed'
                                }
                              ]
                            }));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Добавить ночь</span>
                        </button>
                      )}
                    </div>

                    {!protocol.shots || protocol.shots.length === 0 ? (
                      <div className="text-xs text-slate-500 italic py-2">
                        Записи ночных выстрелов отсутствуют.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {protocol.shots.map((shot, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-bold text-amber-400 min-w-fit w-full sm:w-auto mb-2 sm:mb-0">
                              Ночь #{shot.night_number}
                            </span>

                            <div className="flex items-center space-x-2 w-full sm:w-auto">
                              <span className="text-slate-400 hidden sm:inline">Цель:</span>
                              <select
                                value={shot.target_seat}
                                disabled={protocol.status === 'completed'}
                                onChange={(e) => {
                                  const target = parseInt(e.target.value);
                                  setProtocol((prev) => {
                                    const shotsCopy = [...(prev.shots || [])];
                                    shotsCopy[sIdx] = { ...shotsCopy[sIdx], target_seat: target };
                                    return { ...prev, shots: shotsCopy };
                                  });
                                }}
                                className="bg-slate-900 border border-slate-700 rounded px-2 min-h-[44px] sm:min-h-0 py-1 text-slate-200 focus:border-amber-500 focus:outline-none flex-1 sm:flex-none"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                  <option key={num} value={num}>
                                    Игрок #{num}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={shot.result}
                                disabled={protocol.status === 'completed'}
                                onChange={(e) => {
                                  const res = e.target.value as any;
                                  setProtocol((prev) => {
                                    const shotsCopy = [...(prev.shots || [])];
                                    shotsCopy[sIdx] = { ...shotsCopy[sIdx], result: res };
                                    return { ...prev, shots: shotsCopy };
                                  });
                                }}
                                className="bg-slate-900 border border-slate-700 rounded px-2 min-h-[44px] sm:min-h-0 py-1 text-slate-200 focus:border-amber-500 focus:outline-none flex-1 sm:flex-none"
                              >
                                <option value="killed">Убит</option>
                                <option value="miss">Промах</option>
                                <option value="agreement_failed">Несогл.</option>
                              </select>

                              {protocol.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProtocol((prev) => ({
                                      ...prev,
                                      shots: (prev.shots || []).filter((_, idx) => idx !== sIdx).map((s, idx) => ({ ...s, night_number: idx + 1 }))
                                    }));
                                  }}
                                  className="text-slate-500 hover:text-rose-400 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: SUMMARY & FINALIZATION */}
              {activeTab === 'summary' && (
                <div className="space-y-5">
                  {/* Winner Team Selection */}
                  <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <label className="text-xs font-semibold text-slate-200 block">
                      Победившая команда:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={protocol.status === 'completed'}
                        onClick={() => setProtocol((prev) => ({ ...prev, winner_team: 'red' }))}
                        className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 border transition ${
                          protocol.winner_team === 'red'
                            ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-lg ring-2 ring-rose-500/50'
                            : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Shield className="w-4 h-4 text-rose-400" />
                        <span>Победа Красных</span>
                      </button>

                      <button
                        type="button"
                        disabled={protocol.status === 'completed'}
                        onClick={() => setProtocol((prev) => ({ ...prev, winner_team: 'black' }))}
                        className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 border transition ${
                          protocol.winner_team === 'black'
                            ? 'bg-slate-950 border-slate-500 text-slate-100 shadow-lg ring-2 ring-slate-400/50'
                            : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Shield className="w-4 h-4 text-slate-400" />
                        <span>Победа Чёрных</span>
                      </button>
                    </div>
                  </div>

                  {/* Substitution Section */}
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <span className="font-semibold text-xs text-slate-200">Замена в игре</span>
                      {protocol.status === 'draft' && (
                        <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(protocol.replacement)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProtocol((prev) => ({
                                  ...prev,
                                  replacement: {
                                    replaced_seat: 1,
                                    replacement_name_or_comment: '',
                                    replacement_time: '',
                                    notes: ''
                                  }
                                }));
                              } else {
                                setProtocol((prev) => ({ ...prev, replacement: null }));
                              }
                            }}
                            className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                          />
                          <span>Включить замену</span>
                        </label>
                      )}
                    </div>

                    {protocol.replacement ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="text-slate-400 block mb-1">Заменённое место</label>
                          <select
                            disabled={protocol.status === 'completed'}
                            value={protocol.replacement.replaced_seat || 1}
                            onChange={(e) => {
                              const seat = parseInt(e.target.value) || 1;
                              setProtocol((prev) => ({
                                ...prev,
                                replacement: { ...prev.replacement!, replaced_seat: seat }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                              <option key={s} value={s}>
                                Игрок #{s}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Имя или комментарий о замене</label>
                          <input
                            type="text"
                            placeholder="например: Замена на Иванова"
                            disabled={protocol.status === 'completed'}
                            value={protocol.replacement.replacement_name_or_comment || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProtocol((prev) => ({
                                ...prev,
                                replacement: { ...prev.replacement!, replacement_name_or_comment: val }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Момент замены</label>
                          <input
                            type="text"
                            placeholder="например: День 2"
                            disabled={protocol.status === 'completed'}
                            value={protocol.replacement.replacement_time || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProtocol((prev) => ({
                                ...prev,
                                replacement: { ...prev.replacement!, replacement_time: val }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Заметка судьи о замене</label>
                          <input
                            type="text"
                            placeholder="Причина или заметка"
                            disabled={protocol.status === 'completed'}
                            value={protocol.replacement.notes || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProtocol((prev) => ({
                                ...prev,
                                replacement: { ...prev.replacement!, notes: val }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Замен в игре не производилось.
                      </div>
                    )}
                  </div>

                  {/* Judge Notes */}
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Заметки судьи / комментарии по игре:
                    </label>
                    <textarea
                      rows={3}
                      disabled={protocol.status === 'completed'}
                      value={protocol.judge_notes || ''}
                      onChange={(e) => setProtocol((prev) => ({ ...prev, judge_notes: e.target.value }))}
                      placeholder="Замечания, тайминги, особенности партии..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Full Results Compact Table Overview */}
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-200">
                      Сводная таблица параметров игроков
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400">
                            <th className="py-2 px-1">#</th>
                            <th className="py-2 px-2">Игрок</th>
                            <th className="py-2 px-2">Роль</th>
                            <th className="py-2 px-2">Статус</th>
                            <th className="py-2 px-1 text-center">Фолы</th>
                            <th className="py-2 px-1 text-center">Тех</th>
                            <th className="py-2 px-1 text-right">Балл за прот.</th>
                            <th className="py-2 px-1 text-right">Судья</th>
                            <th className="py-2 px-1 text-right">Штраф</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {playerResults.map((p) => (
                            <tr key={p.participant_id} className="hover:bg-slate-800/40">
                              <td className="py-2 px-1 font-bold text-amber-400">#{p.seat_number}</td>
                              <td className="py-2 px-2 text-slate-100 font-medium">{p.display_name}</td>
                              <td className="py-2 px-2 text-amber-300/90 text-[11px]">
                                {p.role === 'citizen' && 'Мирный'}
                                {p.role === 'sheriff' && 'Шериф'}
                                {p.role === 'mafia' && 'Мафия'}
                                {p.role === 'don' && 'Дон'}
                              </td>
                              <td className="py-2 px-2 text-slate-300 text-[11px]">
                                {p.exit_type === 'alive' && <span className="text-emerald-400">Жив</span>}
                                {p.exit_type === 'killed' && <span className="text-rose-400">Убит</span>}
                                {p.exit_type === 'voted_zero_round' && <span className="text-amber-400">Заголосован (0)</span>}
                                {p.exit_type === 'voted_day' && <span className="text-amber-400">Заголосован</span>}
                                {p.exit_type === 'removed' && <span className="text-purple-400">Снят</span>}
                              </td>
                              <td className="py-2 px-1 text-center font-bold text-amber-400">{p.regular_fouls}</td>
                              <td className="py-2 px-1 text-center font-bold text-rose-400">{p.technical_fouls}</td>
                              <td className="py-2 px-1 text-right text-slate-300">{p.protocol_bonus || 0}</td>
                              <td className="py-2 px-1 text-right text-slate-300">{p.judge_bonus || 0}</td>
                              <td className="py-2 px-1 text-right text-rose-300">{p.penalty_points || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="bg-slate-900 border-t border-slate-800 p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {protocol.status === 'completed' ? (
              <span className="text-emerald-400 font-medium flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Протокол завершён</span>
              </span>
            ) : (
              <span>Черновик сохраняется автоматически</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
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
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition flex items-center space-x-1.5 cursor-pointer"
              >
                <FileCheck className="w-4 h-4" />
                <span>Завершить протокол</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowRevertConfirm(true)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-semibold text-xs sm:text-sm transition flex items-center space-x-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Вернуть в черновик</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* MODAL: CONFIRM EXIT TYPE CHANGE WHEN COLOR PROTOCOL EXISTS */}
      {pendingExitTypeConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <h3 className="text-base font-bold">Очистить оставленный протокол?</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              У игрока #{pendingExitTypeConfirm.seatNum} ({pendingExitTypeConfirm.playerName}) есть сохранённый цветовой протокол. Изменение статуса ухода с «Убит» удалит эти записи.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingExitTypeConfirm(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <FileCheck className="w-6 h-6" />
              <h3 className="text-lg font-bold">Завершить протокол игры?</h3>
            </div>

            <div className="text-xs sm:text-sm text-slate-300 space-y-2 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <p>
                Победитель:{' '}
                <strong className={protocol.winner_team === 'red' ? 'text-rose-400' : 'text-slate-100'}>
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
              <p className="text-slate-400 text-xs">
                После завершения игра получит статус «Завершена», и станет доступен запуск следующей игры турнира.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleComplete}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold">Вернуть протокол в черновик?</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              Игра вернётся в статус «Активна», и вы сможете внести любые исправления в протокол.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowRevertConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleRevertToDraft}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Подтверждение смены первоубиенного</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              Выбранный ЛХ и ручной Ci прежнего первоубиенного будут очищены.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCiConfirmModal(false);
                  setPendingFirstKilledId(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Подтверждение смены игрока нулевого круга</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              Выбранные номера ЛХ прежнего игрока будут очищены.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowZeroRoundConfirmModal(false);
                  setPendingZeroRoundVotedId(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
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
    </div>
  );
};
