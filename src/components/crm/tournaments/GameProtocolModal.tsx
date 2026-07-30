import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Clock
} from 'lucide-react';
import {
  api,
  TournamentGame,
  TournamentGameProtocolData,
  PlayerResultData,
  VotingRound,
  ShotEntry
} from '../../../lib/api';

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
    votes: [],
    shots: [],
    replacement: null,
    judge_notes: null,
    best_move_score: 0
  });

  const [playerResults, setPlayerResults] = useState<PlayerResultData[]>([]);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Modals for confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load Protocol Data
  useEffect(() => {
    if (!isOpen || !gameId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getGameProtocol(tournamentId, gameId)
      .then((res) => {
        if (!isMounted) return;
        setGame(res.game);
        setProtocol(res.protocol);
        setPlayerResults(res.player_results);
        setSaveStatus('saved');

        // Restore backup from localStorage if available and draft is newer
        const backupKey = `tournament_protocol_backup_${gameId}`;
        const savedBackup = localStorage.getItem(backupKey);
        if (savedBackup && res.protocol.status === 'draft') {
          try {
            const parsed = JSON.parse(savedBackup);
            if (parsed.updatedAt && new Date(parsed.updatedAt).getTime() > new Date(res.protocol.updated_at || 0).getTime()) {
              if (parsed.protocol) setProtocol(parsed.protocol);
              if (parsed.playerResults) setPlayerResults(parsed.playerResults);
            }
          } catch (_) {}
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Не удалось загрузить протокол');
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
          isFirstRender.current = false;
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tournamentId, gameId]);

  // Debounced Auto-save effect
  useEffect(() => {
    if (isFirstRender.current || loading || !isOpen || protocol.status === 'completed') return;

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
      triggerSave();
    }, 1500);

    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    };
  }, [protocol, playerResults]);

  const triggerSave = async () => {
    if (protocol.status === 'completed') return;

    setSaveStatus('saving');
    setSaveErrorMessage(null);

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
          color_protocol: pr.color_protocol,
          notes: pr.notes
        }))
      };

      const res = await api.saveGameProtocol(tournamentId, gameId, payload);
      setProtocol(res.protocol);
      setPlayerResults(res.player_results);
      setSaveStatus('saved');
      if (onProtocolUpdated) onProtocolUpdated();
    } catch (err: any) {
      setSaveStatus('error');
      setSaveErrorMessage(err.message || 'Ошибка сохранения');
    }
  };

  // Helper to update player result
  const updatePlayerResult = (participantId: string, updates: Partial<PlayerResultData>) => {
    setPlayerResults((prev) =>
      prev.map((pr) => (pr.participant_id === participantId ? { ...pr, ...updates } : pr))
    );
  };

  // Calculate live Best Move Score
  const bestMoveCalculation = useMemo(() => {
    if (!protocol.best_move_seats || protocol.best_move_seats.length === 0) {
      return { guessedBlacks: 0, bonusPoints: 0 };
    }

    let guessedBlacks = 0;
    for (const seatNum of protocol.best_move_seats) {
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
  }, [protocol.best_move_seats, playerResults]);

  // Handle Best Move Seat Selection
  const toggleBestMoveSeat = (seatNumber: number) => {
    setProtocol((prev) => {
      const current = prev.best_move_seats || [];
      if (current.includes(seatNumber)) {
        return { ...prev, best_move_seats: current.filter((s) => s !== seatNumber) };
      } else {
        if (current.length >= 3) return prev; // max 3
        return { ...prev, best_move_seats: [...current, seatNumber].sort((a, b) => a - b) };
      }
    });
  };

  // Handle Complete Protocol
  const handleComplete = async () => {
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
          color_protocol: pr.color_protocol,
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
                    <span className="text-rose-400 font-medium" title={saveErrorMessage || 'Ошибка'}>
                      {saveErrorMessage || 'Ошибка'}
                    </span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
              title="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-rose-500/20 border-b border-rose-500/40 text-rose-300 px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 min-w-[100px] py-3 px-3 text-xs sm:text-sm font-medium flex items-center justify-center space-x-2 border-b-2 transition ${
              activeTab === 'players'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Игроки (10)</span>
          </button>

          <button
            onClick={() => setActiveTab('votes')}
            className={`flex-1 min-w-[100px] py-3 px-3 text-xs sm:text-sm font-medium flex items-center justify-center space-x-2 border-b-2 transition ${
              activeTab === 'votes'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Vote className="w-4 h-4" />
            <span>Голосования ({protocol.votes?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('nights')}
            className={`flex-1 min-w-[100px] py-3 px-3 text-xs sm:text-sm font-medium flex items-center justify-center space-x-2 border-b-2 transition ${
              activeTab === 'nights'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Ночи / ЛХ</span>
          </button>

          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 min-w-[100px] py-3 px-3 text-xs sm:text-sm font-medium flex items-center justify-center space-x-2 border-b-2 transition ${
              activeTab === 'summary'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Итог</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-400">
              <Clock className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-sm">Загрузка данных протокола...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: PLAYERS */}
              {activeTab === 'players' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 bg-slate-800/40 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span>Управляйте фолами, статусом выхода из игры и баллами игроков.</span>
                    <span className="text-amber-400 font-medium">Всего мест: 10</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {playerResults.map((player) => (
                      <div
                        key={player.participant_id}
                        className={`bg-slate-800/60 rounded-xl p-3 border transition ${
                          player.exit_type !== 'alive'
                            ? 'border-slate-700/60 bg-slate-800/30'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-700/60">
                          {/* Player Identity */}
                          <div className="flex items-center space-x-3">
                            <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold text-sm flex items-center justify-center border border-amber-500/30 shrink-0">
                              #{player.seat_number}
                            </span>
                            <div>
                              <div className="font-semibold text-sm text-slate-100">
                                {player.display_name}
                              </div>
                              <div className="text-xs text-slate-400">
                                Роль:{' '}
                                <span className="font-medium text-amber-300">
                                  {player.role === 'citizen' && 'Мирный'}
                                  {player.role === 'sheriff' && 'Шериф'}
                                  {player.role === 'mafia' && 'Мафия'}
                                  {player.role === 'don' && 'Дон'}
                                  {!player.role && 'Не назначена'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Status / Exit Dropdown */}
                          <div className="flex items-center space-x-2">
                            <select
                              value={player.exit_type}
                              disabled={protocol.status === 'completed'}
                              onChange={(e) =>
                                updatePlayerResult(player.participant_id, {
                                  exit_type: e.target.value as any
                                })
                              }
                              className="bg-slate-900 text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                            >
                              <option value="alive">Жив</option>
                              <option value="killed">Убит ночью</option>
                              <option value="voted_zero_round">Заголосован (0 круг)</option>
                              <option value="voted_day">Заголосован днём</option>
                              <option value="removed">Снят судьёй</option>
                            </select>

                            {player.exit_type !== 'alive' && (
                              <input
                                type="number"
                                placeholder="Порядок ухода (1-10)"
                                disabled={protocol.status === 'completed'}
                                value={player.exit_order ?? ''}
                                onChange={(e) =>
                                  updatePlayerResult(player.participant_id, {
                                    exit_order: e.target.value ? parseInt(e.target.value) : null
                                  })
                                }
                                className="w-16 bg-slate-900 text-xs border border-slate-700 rounded-lg px-2 py-1.5 text-center text-slate-200 focus:border-amber-500 focus:outline-none"
                              />
                            )}
                          </div>
                        </div>

                        {/* Fouls and Bonuses */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                          {/* Regular Fouls */}
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block mb-1">Фолы</span>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                disabled={protocol.status === 'completed' || player.regular_fouls <= 0}
                                onClick={() =>
                                  updatePlayerResult(player.participant_id, {
                                    regular_fouls: Math.max(0, player.regular_fouls - 1)
                                  })
                                }
                                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center font-bold disabled:opacity-40"
                              >
                                -
                              </button>
                              <span className="font-bold text-amber-400 w-4 text-center">
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
                                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center font-bold disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Technical Fouls */}
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block mb-1">Тех. фолы</span>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                disabled={protocol.status === 'completed' || player.technical_fouls <= 0}
                                onClick={() =>
                                  updatePlayerResult(player.participant_id, {
                                    technical_fouls: Math.max(0, player.technical_fouls - 1)
                                  })
                                }
                                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center font-bold disabled:opacity-40"
                              >
                                -
                              </button>
                              <span className="font-bold text-rose-400 w-4 text-center">
                                {player.technical_fouls}
                              </span>
                              <button
                                type="button"
                                disabled={protocol.status === 'completed' || player.technical_fouls >= 4}
                                onClick={() =>
                                  updatePlayerResult(player.participant_id, {
                                    technical_fouls: Math.min(4, player.technical_fouls + 1)
                                  })
                                }
                                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center font-bold disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Judge Bonus */}
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block mb-1">Балл судьи</span>
                            <input
                              type="number"
                              step="0.1"
                              disabled={protocol.status === 'completed'}
                              value={player.judge_bonus ?? 0}
                              onChange={(e) =>
                                updatePlayerResult(player.participant_id, {
                                  judge_bonus: parseFloat(e.target.value) || 0
                                })
                              }
                              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs text-center focus:border-amber-500 focus:outline-none"
                            />
                          </div>

                          {/* Penalty Points */}
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block mb-1">Штраф</span>
                            <input
                              type="number"
                              step="0.1"
                              disabled={protocol.status === 'completed'}
                              value={player.penalty_points ?? 0}
                              onChange={(e) =>
                                updatePlayerResult(player.participant_id, {
                                  penalty_points: parseFloat(e.target.value) || 0
                                })
                              }
                              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs text-center focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: VOTES */}
              {activeTab === 'votes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">
                      Протокол дневных голосований
                    </h3>
                    {protocol.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => {
                          const currentVotes = protocol.votes || [];
                          const newRound: VotingRound = {
                            round_number: currentVotes.length + 1,
                            is_revote: false,
                            nominated_seats: [],
                            vote_counts: {}
                          };
                          setProtocol((prev) => ({
                            ...prev,
                            votes: [...(prev.votes || []), newRound]
                          }));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium flex items-center space-x-1.5 transition"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Добавить круг голосования</span>
                      </button>
                    )}
                  </div>

                  {(!protocol.votes || protocol.votes.length === 0) ? (
                    <div className="bg-slate-800/40 rounded-xl p-8 text-center text-slate-400 text-xs space-y-2 border border-slate-800">
                      <Vote className="w-8 h-8 text-slate-600 mx-auto" />
                      <p>Голосования ещё не внесены в протокол.</p>
                      {protocol.status === 'draft' && (
                        <p className="text-amber-400/80">
                          Нажмите «Добавить круг голосования» выше.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {protocol.votes.map((round, rIndex) => (
                        <div
                          key={rIndex}
                          className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-amber-400">
                                Круг #{round.round_number}
                              </span>
                              {round.is_revote && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs border border-purple-500/30">
                                  Переголосование
                                </span>
                              )}
                            </div>

                            {protocol.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProtocol((prev) => ({
                                    ...prev,
                                    votes: (prev.votes || []).filter((_, idx) => idx !== rIndex)
                                  }));
                                }}
                                className="text-slate-500 hover:text-rose-400 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Nominated Seats selector */}
                          <div className="space-y-1.5">
                            <span className="text-xs text-slate-400">Выставленные игроки (номера мест):</span>
                            <div className="flex flex-wrap gap-1.5">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seatNum) => {
                                const isNominated = round.nominated_seats?.includes(seatNum);
                                return (
                                  <button
                                    key={seatNum}
                                    type="button"
                                    disabled={protocol.status === 'completed'}
                                    onClick={() => {
                                      const currentNom = round.nominated_seats || [];
                                      const updatedNom = isNominated
                                        ? currentNom.filter((s) => s !== seatNum)
                                        : [...currentNom, seatNum].sort((a, b) => a - b);

                                      setProtocol((prev) => {
                                        const votesCopy = [...(prev.votes || [])];
                                        votesCopy[rIndex] = {
                                          ...votesCopy[rIndex],
                                          nominated_seats: updatedNom
                                        };
                                        return { ...prev, votes: votesCopy };
                                      });
                                    }}
                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                                      isNominated
                                        ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                                        : 'bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                    }`}
                                  >
                                    #{seatNum}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Vote counts per nominated seat */}
                          {round.nominated_seats && round.nominated_seats.length > 0 && (
                            <div className="pt-2 border-t border-slate-700/40 space-y-2">
                              <span className="text-xs text-slate-400">Распределение голосов:</span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {round.nominated_seats.map((seatNum) => (
                                  <div
                                    key={seatNum}
                                    className="bg-slate-900/80 p-2 rounded-lg border border-slate-700/60 flex items-center justify-between"
                                  >
                                    <span className="text-xs font-semibold text-amber-300">
                                      Игрок #{seatNum}
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="10"
                                      disabled={protocol.status === 'completed'}
                                      value={round.vote_counts?.[seatNum] ?? 0}
                                      onChange={(e) => {
                                        const count = parseInt(e.target.value) || 0;
                                        setProtocol((prev) => {
                                          const votesCopy = [...(prev.votes || [])];
                                          const currentCounts = { ...(votesCopy[rIndex].vote_counts || {}) };
                                          currentCounts[seatNum] = count;
                                          votesCopy[rIndex] = {
                                            ...votesCopy[rIndex],
                                            vote_counts: currentCounts
                                          };
                                          return { ...prev, votes: votesCopy };
                                        });
                                      }}
                                      className="w-12 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-center font-bold text-white focus:border-amber-500 focus:outline-none"
                                    />
                                  </div>
                                ))}
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
                  {/* First Killed & Zero Round Voted */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* First Killed */}
                    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-2">
                      <label className="text-xs font-semibold text-slate-300 block">
                        Первоубиенный игрок (ночь #1):
                      </label>
                      <select
                        value={protocol.first_killed_participant_id || ''}
                        disabled={protocol.status === 'completed'}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setProtocol((prev) => ({
                            ...prev,
                            first_killed_participant_id: val,
                            // if best_move_participant_id was first_killed and now changed, adjust if invalid
                            best_move_participant_id:
                              prev.best_move_source === 'first_killed' ? val : prev.best_move_participant_id
                          }));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- Не выбрано --</option>
                        {playerResults.map((p) => (
                          <option key={p.participant_id} value={p.participant_id}>
                            #{p.seat_number} {p.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Zero Round Voted */}
                    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-2">
                      <label className="text-xs font-semibold text-slate-300 block">
                        Заголосованный в нулевой круг (день #0):
                      </label>
                      <select
                        value={protocol.zero_round_voted_participant_id || ''}
                        disabled={protocol.status === 'completed'}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setProtocol((prev) => ({
                            ...prev,
                            zero_round_voted_participant_id: val,
                            best_move_participant_id:
                              prev.best_move_source === 'zero_round_voted' ? val : prev.best_move_participant_id
                          }));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- Не выбрано --</option>
                        {playerResults.map((p) => (
                          <option key={p.participant_id} value={p.participant_id}>
                            #{p.seat_number} {p.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* BEST MOVE (ЛХ) SECTION */}
                  <div className="bg-slate-800/80 rounded-xl p-4 border border-amber-500/30 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <Award className="w-5 h-5 text-amber-400" />
                        <h3 className="font-bold text-sm text-amber-300">
                          Протокол Лучшего Хода (ЛХ)
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400">
                        Правила: 0-3 уникальных номера (1..10)
                      </span>
                    </div>

                    {/* Recipient Selection */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-300 font-medium block">
                        Получатель Лучшего Хода:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={protocol.status === 'completed'}
                          onClick={() =>
                            setProtocol((prev) => ({
                              ...prev,
                              best_move_participant_id: null,
                              best_move_source: null
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            !protocol.best_move_participant_id
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          Никто
                        </button>

                        {protocol.first_killed_participant_id && (
                          <button
                            type="button"
                            disabled={protocol.status === 'completed'}
                            onClick={() => {
                              const fkId = protocol.first_killed_participant_id;
                              setProtocol((prev) => ({
                                ...prev,
                                best_move_participant_id: fkId,
                                best_move_source: 'first_killed'
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              protocol.best_move_participant_id === protocol.first_killed_participant_id
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            Первоубиенный (#
                            {
                              playerResults.find((p) => p.participant_id === protocol.first_killed_participant_id)
                                ?.seat_number
                            }
                            )
                          </button>
                        )}

                        {protocol.zero_round_voted_participant_id && (
                          <button
                            type="button"
                            disabled={protocol.status === 'completed'}
                            onClick={() => {
                              const zvId = protocol.zero_round_voted_participant_id;
                              setProtocol((prev) => ({
                                ...prev,
                                best_move_participant_id: zvId,
                                best_move_source: 'zero_round_voted'
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              protocol.best_move_participant_id === protocol.zero_round_voted_participant_id
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            Заголосованный в 0 круг (#
                            {
                              playerResults.find((p) => p.participant_id === protocol.zero_round_voted_participant_id)
                                ?.seat_number
                            }
                            )
                          </button>
                        )}
                      </div>

                      {!protocol.first_killed_participant_id && !protocol.zero_round_voted_participant_id && (
                        <p className="text-xs text-amber-400/70 italic pt-1">
                          Укажите первоубиенного или заголосованного в 0 круг выше, чтобы выбрать получателя ЛХ.
                        </p>
                      )}
                    </div>

                    {/* Best Move Numbers Selector */}
                    <div className="space-y-2 pt-2 border-t border-slate-700/60">
                      <span className="text-xs text-slate-300 font-medium block">
                        Выбранные номера в ЛХ (максимум 3):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seatNum) => {
                          const isSelected = protocol.best_move_seats?.includes(seatNum);
                          return (
                            <button
                              key={seatNum}
                              type="button"
                              disabled={
                                protocol.status === 'completed' ||
                                (!isSelected && (protocol.best_move_seats?.length || 0) >= 3)
                              }
                              onClick={() => toggleBestMoveSeat(seatNum)}
                              className={`w-9 h-9 rounded-xl font-bold text-xs transition flex items-center justify-center ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 shadow-lg scale-105 ring-2 ring-amber-400'
                                  : 'bg-slate-900 text-slate-300 hover:bg-slate-700 disabled:opacity-40'
                              }`}
                            >
                              #{seatNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Calculation Score Display */}
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                      <div className="text-xs space-y-0.5">
                        <div className="text-slate-300 font-medium">
                          Угадано чёрных игроков:{' '}
                          <span className="font-bold text-amber-400">
                            {bestMoveCalculation.guessedBlacks} из 3
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          1 чёрный = +0.1, 2 чёрных = +0.3, 3 чёрных = +0.6
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Бонусный балл</span>
                        <span className="text-lg font-bold text-amber-400">
                          +{bestMoveCalculation.bonusPoints}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Night Shots Recorder */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300">
                        Ночные выстрелы (мафия)
                      </h4>
                      {protocol.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentShots = protocol.shots || [];
                            const newShot: ShotEntry = {
                              night_number: currentShots.length + 1,
                              target_seat: 1,
                              result: 'killed'
                            };
                            setProtocol((prev) => ({
                              ...prev,
                              shots: [...(prev.shots || []), newShot]
                            }));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700 text-xs font-medium flex items-center space-x-1 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Добавить ночь</span>
                        </button>
                      )}
                    </div>

                    {(!protocol.shots || protocol.shots.length === 0) ? (
                      <div className="bg-slate-800/30 p-4 rounded-xl text-center text-xs text-slate-500 border border-slate-800">
                        Ночные выстрелы не зарегистрированы.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {protocol.shots.map((shot, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-bold text-amber-400">
                              Ночь #{shot.night_number}
                            </span>

                            <div className="flex items-center space-x-2">
                              <span className="text-slate-400">Цель:</span>
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
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-amber-500 focus:outline-none"
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
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-amber-500 focus:outline-none"
                              >
                                <option value="killed">Убит</option>
                                <option value="miss">Промах</option>
                                <option value="agreement_failed">Несогласование</option>
                              </select>
                            </div>

                            {protocol.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProtocol((prev) => ({
                                    ...prev,
                                    shots: (prev.shots || []).filter((_, idx) => idx !== sIdx)
                                  }));
                                }}
                                className="text-slate-500 hover:text-rose-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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
                            <th className="py-2 px-1 text-right">Судья</th>
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
                              <td className="py-2 px-1 text-right text-slate-300">{p.judge_bonus || 0}</td>
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
                onClick={() => setShowCompleteConfirm(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition flex items-center space-x-1.5"
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
              <p>
                Лучший ход: {protocol.best_move_seats?.length ? `#${protocol.best_move_seats.join(', #')}` : 'Не указан'} (+{bestMoveCalculation.bonusPoints} б.)
              </p>
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
    </div>
  );
};
