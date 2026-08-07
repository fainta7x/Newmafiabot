import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileCheck, Moon, Save, Users, Vote, X } from 'lucide-react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import {
  cleanAndSyncVotes,
  createNextRevoteRound,
} from '../../shared/tournamentVoting';
import { ProtocolVotingTab } from './tournaments/protocol/ProtocolVotingTab';
import { ProtocolNightsTab } from './tournaments/protocol/ProtocolNightsTab';
import { ProtocolSummaryTab } from './tournaments/protocol/ProtocolSummaryTab';
import {
  calculateGuessedBlacks,
  getOppositeTeam,
  recalculateVoteRemainder,
  syncAllEventsToResults,
} from './tournaments/protocol/protocolStateUtils';
import {
  getConfirmedPlayerDisciplineUpdates,
  getRegularFoulChange,
  getTechFoulChange,
  type TechFoulType,
} from './tournaments/protocol/protocolDisciplineUtils';

interface EveningGameProtocolModalProps {
  game: ClubGameRecord;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

type Tab = 'players' | 'votes' | 'nights' | 'summary';

const roleLabel = (role: string | null) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Не выбрана';
};

export const EveningGameProtocolModal: React.FC<EveningGameProtocolModalProps> = ({
  game,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const source = game.club_protocol;
  const [protocol, setProtocol] = useState<TournamentGameProtocolData>(() => source?.protocol || ({
    game_id: String(game.id),
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
  } as TournamentGameProtocolData));
  const [playerResults, setPlayerResults] = useState<PlayerResultData[]>(source?.player_results || []);
  const [activeTab, setActiveTab] = useState<Tab>('players');
  const [voteDrafts, setVoteDrafts] = useState<Record<string, string>>({});
  const [highlightedRoundIdx, setHighlightedRoundIdx] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const firstRender = useRef(true);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen || !game.club_protocol) return;
    setProtocol(game.club_protocol.protocol);
    setPlayerResults(game.club_protocol.player_results);
    setSaveState('saved');
    setActiveTab('players');
    firstRender.current = true;
  }, [game.id, isOpen]);

  const save = async (
    nextProtocol: TournamentGameProtocolData = protocol,
    nextResults: PlayerResultData[] = playerResults
  ) => {
    setSaveState('saving');
    try {
      const updated = await clubGamesApi.saveProtocol(game.id, {
        protocol: nextProtocol,
        player_results: nextResults,
      });
      if (updated.club_protocol) {
        setProtocol(updated.club_protocol.protocol);
        setPlayerResults(updated.club_protocol.player_results);
      }
      setSaveState('saved');
      onUpdated(updated);
      return true;
    } catch (err) {
      console.error(err);
      setSaveState('error');
      return false;
    }
  };

  useEffect(() => {
    if (!isOpen || protocol.status === 'completed') return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState('unsaved');
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => save(), 1000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [protocol, playerResults]);

  const updatePlayerResult = (participantId: string, updates: Partial<PlayerResultData>) => {
    setPlayerResults((prev) => prev.map((player) => player.participant_id === participantId ? { ...player, ...updates } : player));
  };

  const changeRegularFoul = (player: PlayerResultData, delta: number) => {
    const change = getRegularFoulChange(player, delta);
    if (change.kind === 'update') updatePlayerResult(player.participant_id, change.updates);
    if (change.kind === 'confirm' && confirm(`Удалить игрока #${player.seat_number} за 4-й фол?`)) {
      const updates = getConfirmedPlayerDisciplineUpdates(player, 'foul_4');
      if (updates) updatePlayerResult(player.participant_id, updates);
    }
  };

  const changeTechFoul = (player: PlayerResultData, type: TechFoulType, delta: number) => {
    const change = getTechFoulChange(player, type, delta);
    if (change.kind === 'update') updatePlayerResult(player.participant_id, change.updates);
    if (change.kind === 'confirm' && confirm(`Это второй технический фол игрока #${player.seat_number}. Удалить игрока?`)) {
      const updates = getConfirmedPlayerDisciplineUpdates(player, 'tech_2', type);
      if (updates) updatePlayerResult(player.participant_id, updates);
    }
  };

  const handlePpk = (player: PlayerResultData) => {
    if (protocol.status === 'completed') return;
    if (!confirm(`Зафиксировать ППК игрока #${player.seat_number}? Игра завершится немедленно.`)) return;
    const winner = getOppositeTeam(player.role);
    if (!winner) {
      alert('Сначала установите роль игрока');
      return;
    }
    setProtocol((prev) => ({
      ...prev,
      end_reason: 'ppk',
      ppk_culprit_participant_id: player.participant_id,
      winner_team: winner,
    }));
  };

  const handleRoundChange = (index: number, updater: (round: any) => any) => {
    setProtocol((prev) => {
      const votes = [...(prev.votes || [])];
      let round = updater({ ...votes[index] });
      round = recalculateVoteRemainder(round);
      if (round.outcome && round.outcome !== 'pending') {
        round.outcome = 'pending';
        round.eliminated_seats = [];
        round.table_leave_votes = undefined;
      }
      votes[index] = round;
      const nextVotes = cleanAndSyncVotes(votes as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleConfirmOutcome = (index: number, calculatedOutcome: string, winners: number[]) => {
    setHighlightedRoundIdx(null);
    setProtocol((prev) => {
      const votes = [...(prev.votes || [])] as any[];
      if (calculatedOutcome === 'needs_revote' || calculatedOutcome === 'tie_revote') {
        const parent = { ...votes[index], outcome: 'tie_revote', eliminated_seats: [] };
        votes[index] = parent;
        votes.splice(index + 1, 0, createNextRevoteRound(parent, winners));
      } else {
        const outcome = calculatedOutcome === 'single_eliminated'
          ? 'single_eliminated'
          : calculatedOutcome === 'all_tied_eliminated'
            ? 'all_tied_eliminated'
            : 'no_elimination';
        votes[index] = {
          ...votes[index],
          outcome,
          eliminated_seats: outcome === 'single_eliminated' ? [winners[0]] : outcome === 'all_tied_eliminated' ? winners : [],
        };
      }
      const nextVotes = cleanAndSyncVotes(votes as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleResetOutcome = (index: number) => {
    setProtocol((prev) => {
      const votes = [...(prev.votes || [])] as any[];
      votes[index] = { ...votes[index], outcome: 'pending', eliminated_seats: [], table_leave_votes: undefined };
      const nextVotes = cleanAndSyncVotes(votes as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleAddVoting = () => {
    setProtocol((prev) => {
      const normalVotes = (prev.votes || []).filter((vote: any) => !vote.is_revote);
      const nextDay = normalVotes.length === 0 ? 0 : Math.max(...normalVotes.map((vote: any) => vote.day_number ?? 0)) + 1;
      return {
        ...prev,
        votes: cleanAndSyncVotes([...(prev.votes || []), {
          round_number: (prev.votes || []).length + 1,
          is_revote: false,
          nominated_seats: [],
          vote_counts: {},
          day_number: nextDay,
          eligible_voters: nextDay === 0 ? 10 : playerResults.filter((p) => p.exit_type === 'alive').length,
          outcome: 'pending',
        }] as any) as any,
      };
    });
  };

  const handleDeleteVoting = (index: number) => {
    setProtocol((prev) => {
      const nextVotes = cleanAndSyncVotes((prev.votes || []).filter((_, i) => i !== index) as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleFirstKilledChange = (participantId: string | null) => {
    setProtocol((prev) => {
      const moves = (prev.best_moves || []).filter((move) => move.source !== 'first_killed');
      if (participantId) moves.push({ participant_id: participantId, source: 'first_killed', seat_numbers: [] });
      const next = { ...prev, first_killed_participant_id: participantId, best_moves: moves };
      const synced = syncAllEventsToResults(prev.votes || [], prev.shots || [], participantId, playerResults, next);
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleZeroRoundVotedChange = (participantId: string | null) => {
    setProtocol((prev) => {
      const moves = (prev.best_moves || []).filter((move) => move.source !== 'zero_round_voted');
      if (participantId) moves.push({ participant_id: participantId, source: 'zero_round_voted', seat_numbers: [] });
      return { ...prev, zero_round_voted_participant_id: participantId, best_moves: moves };
    });
  };

  const toggleBestMoveSeat = (sourceType: 'first_killed' | 'zero_round_voted', participantId: string, seatNumber: number) => {
    setProtocol((prev) => {
      const moves = [...(prev.best_moves || [])];
      const index = moves.findIndex((move) => move.source === sourceType);
      const current = index >= 0 ? moves[index].seat_numbers : [];
      const seats = current.includes(seatNumber)
        ? current.filter((seat) => seat !== seatNumber)
        : current.length < 3
          ? [...current, seatNumber]
          : current;
      const move = { participant_id: participantId, source: sourceType, seat_numbers: seats } as any;
      if (index >= 0) moves[index] = move;
      else moves.push(move);
      return { ...prev, best_moves: moves };
    });
  };

  const handleAddNight = () => {
    setProtocol((prev) => {
      const shots = [...(prev.shots || []), { night_number: (prev.shots || []).length + 1, target_seat: 1, result: 'killed' as const }];
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleDeleteNight = (index: number) => {
    setProtocol((prev) => {
      const shots = (prev.shots || []).filter((_, i) => i !== index).map((shot, i) => ({ ...shot, night_number: i + 1 }));
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleShotChange = (index: number, targetSeat: number, result: 'killed' | 'miss' | 'agreement_failed') => {
    setProtocol((prev) => {
      const shots = [...(prev.shots || [])];
      shots[index] = { ...shots[index], target_seat: targetSeat, result };
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots });
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const roleCounts = useMemo(() => playerResults.reduce<Record<string, number>>((acc, player) => {
    if (player.role) acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {}), [playerResults]);

  const completeGame = async () => {
    if (roleCounts.citizen !== 6 || roleCounts.sheriff !== 1 || roleCounts.mafia !== 2 || roleCounts.don !== 1) {
      alert('Перед завершением установите роли: 6 мирных, 1 Шериф, 2 мафии, 1 Дон.');
      setActiveTab('players');
      return;
    }
    if (!protocol.winner_team) {
      alert('Укажите победившую команду.');
      setActiveTab('summary');
      return;
    }
    const completed = { ...protocol, status: 'completed' as const };
    setProtocol(completed);
    await save(completed, playerResults);
  };

  const reopenDraft = async () => {
    if (!confirm('Вернуть завершённую игру в режим корректировки?')) return;
    const draft = { ...protocol, status: 'draft' as const, completed_at: null };
    setProtocol(draft);
    await save(draft, playerResults);
  };

  if (!isOpen) return null;

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'players', label: 'Игроки', icon: Users },
    { id: 'votes', label: 'Голосование', icon: Vote },
    { id: 'nights', label: 'Ночи и ЛХ', icon: Moon },
    { id: 'summary', label: 'Итог', icon: FileCheck },
  ];

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/95 backdrop-blur-md overflow-y-auto">
      <div className="min-h-full max-w-5xl mx-auto p-3 sm:p-5">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white">Игра #{game.global_game_number}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${protocol.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'}`}>
                  {protocol.status === 'completed' ? 'Завершена' : 'Черновик'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{saveState === 'saving' ? 'сохранение…' : saveState === 'unsaved' ? 'есть изменения' : saveState === 'error' ? 'ошибка сохранения' : 'сохранено'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{game.table_name || 'Стол не указан'}{game.judge_name ? ` • Ведущий: ${game.judge_name}` : ''}</p>
            </div>
            <button type="button" onClick={async () => { if (protocol.status === 'draft' && saveState !== 'saved') await save(); onClose(); }} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 p-2 bg-slate-950/70 border-b border-slate-800 sticky top-0 z-10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`min-h-[44px] rounded-xl text-[10px] sm:text-xs font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${activeTab === tab.id ? 'bg-rose-600 text-white' : 'text-slate-400 hover:bg-slate-900'}`}><Icon className="w-4 h-4" />{tab.label}</button>;
            })}
          </div>

          <div className="p-3 sm:p-5 bg-slate-950/30 min-h-[500px]">
            {activeTab === 'players' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] font-bold">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-300">Мирные: {roleCounts.citizen || 0}/6</div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-emerald-400">Шериф: {roleCounts.sheriff || 0}/1</div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-300">Мафия: {roleCounts.mafia || 0}/2</div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-purple-400">Дон: {roleCounts.don || 0}/1</div>
                </div>

                {playerResults.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => {
                  const techTotal = (player.minor_technical_fouls || 0) + (player.major_technical_fouls || 0);
                  return (
                    <div key={player.participant_id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0"><strong className="text-sm text-white">#{player.seat_number} {player.display_name}</strong><div className="text-[10px] text-slate-500">{roleLabel(player.role)} • {player.exit_type}</div></div>
                        {protocol.status === 'draft' && <button type="button" onClick={() => handlePpk(player)} className="px-2 py-1 rounded-lg border border-rose-900/50 bg-rose-950/30 text-rose-400 text-[9px] font-black">ППК</button>}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="text-[10px] text-slate-400">Роль<select disabled={protocol.status === 'completed'} value={player.role || ''} onChange={(e) => updatePlayerResult(player.participant_id, { role: e.target.value || null })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white"><option value="">—</option><option value="citizen">Мирный</option><option value="sheriff">Шериф</option><option value="mafia">Мафия</option><option value="don">Дон</option></select></label>
                        <label className="text-[10px] text-slate-400">Выход<select disabled={protocol.status === 'completed'} value={player.exit_type} onChange={(e) => updatePlayerResult(player.participant_id, { exit_type: e.target.value as any })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white"><option value="alive">В игре</option><option value="killed">Убит</option><option value="voted_zero_round">Заголосован в нулевой</option><option value="voted_day">Заголосован</option><option value="removed">Удалён</option></select></label>
                        <div className="text-[10px] text-slate-400">Фолы<div className="mt-1 flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-1"><button disabled={protocol.status === 'completed'} onClick={() => changeRegularFoul(player, -1)} className="w-8 h-8">−</button><strong className="text-white">{player.regular_fouls}</strong><button disabled={protocol.status === 'completed'} onClick={() => changeRegularFoul(player, 1)} className="w-8 h-8">+</button></div></div>
                        <div className="text-[10px] text-slate-400">Техи ({techTotal}/2)<div className="mt-1 grid grid-cols-2 gap-1"><button disabled={protocol.status === 'completed'} onClick={() => changeTechFoul(player, 'minor', 1)} className="min-h-[34px] rounded-lg bg-slate-950 border border-slate-800 text-amber-300 text-[9px]">+ малый ({player.minor_technical_fouls || 0})</button><button disabled={protocol.status === 'completed'} onClick={() => changeTechFoul(player, 'major', 1)} className="min-h-[34px] rounded-lg bg-slate-950 border border-slate-800 text-rose-300 text-[9px]">+ большой ({player.major_technical_fouls || 0})</button></div></div>
                      </div>

                      {protocol.status === 'draft' && (
                        <div className="flex flex-wrap gap-1.5">
                          {(player.minor_technical_fouls || 0) > 0 && <button onClick={() => changeTechFoul(player, 'minor', -1)} className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[9px]">− малый тех</button>}
                          {(player.major_technical_fouls || 0) > 0 && <button onClick={() => changeTechFoul(player, 'major', -1)} className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[9px]">− большой тех</button>}
                          <button onClick={() => { if (confirm(`Удалить игрока #${player.seat_number} решением судьи?`)) updatePlayerResult(player.participant_id, { exit_type: 'removed', removal_reason: 'direct' }); }} className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-rose-400 text-[9px]">Удалить судьёй</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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
              />
            )}

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
                calculateGuessedBlacks={(seats) => calculateGuessedBlacks(seats, playerResults)}
              />
            )}

            {activeTab === 'summary' && (
              <ProtocolSummaryTab
                protocol={protocol}
                playerResults={playerResults}
                onWinnerTeamChange={(winner) => setProtocol((prev) => ({ ...prev, winner_team: winner }))}
                onReplacementChange={(replacement) => setProtocol((prev) => ({ ...prev, replacement }))}
                onJudgeNotesChange={(judge_notes) => setProtocol((prev) => ({ ...prev, judge_notes }))}
              />
            )}
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => save()} disabled={saveState === 'saving'} className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Save className="w-4 h-4" />Сохранить</button>
            {protocol.status === 'completed' ? (
              <button type="button" onClick={reopenDraft} className="px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black">Вернуть на корректировку</button>
            ) : (
              <button type="button" onClick={completeGame} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Завершить игру</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
