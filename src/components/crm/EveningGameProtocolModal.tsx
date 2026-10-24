import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { validateProtocolVoting } from '../../lib/protocolVotingValidation.ts';
import { isSupportedTableSize, roleCountsMatchTable, tableRolesLabel } from '../../lib/tableComposition.ts';
import {
  cleanAndSyncVotes as cleanVotes,
  createNextRevoteRound,
} from '../../shared/tournamentVoting';
import {
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
import { describeLegacyRepairs, repairLegacyClubProtocol } from '../../lib/legacyClubProtocol.ts';
import { ProtocolWindow, type ProtocolTab } from './gameProtocol/ProtocolWindow';
import { OverviewView } from './gameProtocol/OverviewView';
import { GameFlowView } from './gameProtocol/GameFlowView';
import { PlayerSheet, PlayersList } from './gameProtocol/PlayersView';
import { ResultView } from './gameProtocol/ResultView';
import { Card } from './gameProtocol/ui';
import { buildCircles, computeChanges, computeIssues, type Change, type ProtocolState } from './gameProtocol/protocolReview';
import type { ProtocolApi } from './gameProtocol/types';

interface EveningGameProtocolModalProps {
  game: ClubGameRecord;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

export const EveningGameProtocolModal: React.FC<EveningGameProtocolModalProps> = ({
  game,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const source = game.club_protocol;
  // A game saved by an older build may hold facts the checks now refuse (a killed player's night recorded as a miss, repeated
  // round numbers); they are put right from the game's own record when the protocol opens, and said so on screen.
  const repairedSource = useMemo(() => source ? repairLegacyClubProtocol(source.protocol, source.player_results) : null, [source]);
  const [repairNotes, setRepairNotes] = useState<string[]>(() => repairedSource ? describeLegacyRepairs(repairedSource.repairs) : []);
  const [protocol, setProtocol] = useState<TournamentGameProtocolData>(() => repairedSource?.protocol || ({
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
  const cleanAndSyncVotes = (votes: Parameters<typeof cleanVotes>[0]) => cleanVotes(votes, playerResults.length);
  // An edit may only change the exits it really changes: a game whose evidence is incomplete keeps the exits it has.
  const evidenceBefore = (before: TournamentGameProtocolData) => ({ votes: before.votes || [], shots: before.shots || [], firstKilledId: before.first_killed_participant_id ?? null });
  const [activeTab, setActiveTab] = useState<ProtocolTab>('overview');
  const [circle, setCircle] = useState(0);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState<Record<number, boolean>>({});
  // The protocol as it was when the window opened: «Вы изменили» is the difference from it.
  const [baseline, setBaseline] = useState<ProtocolState | null>(() => (repairedSource && source ? { protocol: repairedSource.protocol, results: source.player_results } : null));
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completeHint, setCompleteHint] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server last confirmed. The autosave only runs when the editor differs from it, so the server's own
  // echo (a fresh object every time) can never start another save, and an unchanged protocol is never re-sent.
  const snapshot = (nextProtocol: TournamentGameProtocolData, nextResults: PlayerResultData[]) => JSON.stringify({ nextProtocol, nextResults });
  // What the server holds: after an automatic repair the editor differs from it, so a draft saves the repaired record.
  const savedSnapshotRef = useRef<string>(snapshot(source?.protocol || protocol, playerResults));
  const latestRef = useRef({ protocol, playerResults });
  latestRef.current = { protocol, playerResults };
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveSeqRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !game.club_protocol) return;
    const repaired = repairLegacyClubProtocol(game.club_protocol.protocol, game.club_protocol.player_results);
    setProtocol(repaired.protocol);
    setPlayerResults(game.club_protocol.player_results);
    setRepairNotes(describeLegacyRepairs(repaired.repairs));
    savedSnapshotRef.current = snapshot(game.club_protocol.protocol, game.club_protocol.player_results);
    setSaveState('saved');
    setSaveError(null);
    setCompleteHint(null);
    setActiveTab('overview');
    setCircle(0);
    setSelectedSeat(null);
    setReviewed({});
    setBaseline({ protocol: repaired.protocol, results: game.club_protocol.player_results });
  }, [game.id, isOpen]);

  const cancelAutoSave = () => {
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null; }
  };

  // Saves go to the server one after another, and only the newest one may update the screen: an older answer
  // arriving late can no longer put a finished game back to a draft.
  const save = (
    nextProtocol: TournamentGameProtocolData = latestRef.current.protocol,
    nextResults: PlayerResultData[] = latestRef.current.playerResults,
    options: { replaceEditor?: boolean } = {},
  ): Promise<boolean> => {
    cancelAutoSave();
    const seq = ++saveSeqRef.current;
    const sent = snapshot(nextProtocol, nextResults);
    setSaveState('saving');
    setSaveError(null);
    const run = async () => {
      try {
        const updated = await clubGamesApi.saveProtocol(game.id, { protocol: nextProtocol, player_results: nextResults });
        if (seq !== saveSeqRef.current) return true; // a newer save is already on its way and will decide
        const echoed = updated.club_protocol;
        const untouched = snapshot(latestRef.current.protocol, latestRef.current.playerResults) === sent;
        if (echoed) {
          savedSnapshotRef.current = snapshot(echoed.protocol, echoed.player_results);
          if (options.replaceEditor || untouched) {
            setProtocol(echoed.protocol);
            setPlayerResults(echoed.player_results);
          }
          if (options.replaceEditor) setBaseline({ protocol: echoed.protocol, results: echoed.player_results });
        } else {
          savedSnapshotRef.current = sent;
        }
        onUpdated(updated);
        if (options.replaceEditor || untouched) setSaveState('saved');
        else { setSaveState('unsaved'); scheduleAutoSave(); }
        return true;
      } catch (err) {
        console.error(err);
        if (seq === saveSeqRef.current) {
          setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить протокол');
          setSaveState('error');
        }
        return false;
      }
    };
    const result = queueRef.current.then(run, run);
    queueRef.current = result;
    return result;
  };

  const scheduleAutoSave = () => {
    cancelAutoSave();
    autoSaveRef.current = setTimeout(() => { autoSaveRef.current = null; void save(); }, 1000);
  };

  useEffect(() => {
    if (!isOpen || protocol.status === 'completed') return;
    if (snapshot(protocol, playerResults) === savedSnapshotRef.current) {
      cancelAutoSave();
      setSaveState((current) => (current === 'unsaved' ? 'saved' : current));
      return;
    }
    setSaveState((current) => (current === 'saving' ? current : 'unsaved'));
    scheduleAutoSave();
    return cancelAutoSave;
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

  const handleCancelPpk = () => {
    if (protocol.status === 'completed') return;
    if (!confirm('Отменить ППК? Игра снова станет незавершённой, победителя нужно будет указать заново.')) return;
    setProtocol((prev) => ({ ...prev, end_reason: 'normal', ppk_culprit_participant_id: null, winner_team: null }));
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
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleConfirmOutcome = (index: number, calculatedOutcome: string, winners: number[]) => {
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
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleResetOutcome = (index: number) => {
    setProtocol((prev) => {
      const votes = [...(prev.votes || [])] as any[];
      votes[index] = { ...votes[index], outcome: 'pending', eliminated_seats: [], table_leave_votes: undefined };
      const nextVotes = cleanAndSyncVotes(votes as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleAddVoting = (day: number) => {
    setProtocol((prev) => {
      const nextNumber = Math.max(0, ...(prev.votes || []).map((vote: any) => Number(vote.round_number) || 0)) + 1;
      return {
        ...prev,
        votes: cleanAndSyncVotes([...(prev.votes || []), {
          round_number: nextNumber,
          is_revote: false,
          nominated_seats: [],
          vote_counts: {},
          day_number: day,
          eligible_voters: day === 0 ? playerResults.length : playerResults.filter((p) => p.exit_type === 'alive').length,
          outcome: 'pending',
        }].sort((a: any, b: any) => Number(a.day_number ?? 0) - Number(b.day_number ?? 0) || Number(a.round_number ?? 0) - Number(b.round_number ?? 0)) as any) as any,
      };
    });
  };

  const handleDeleteVoting = (index: number) => {
    setProtocol((prev) => {
      const nextVotes = cleanAndSyncVotes((prev.votes || []).filter((_, i) => i !== index) as any) as any;
      const synced = syncAllEventsToResults(nextVotes, prev.shots || [], prev.first_killed_participant_id, playerResults, { ...prev, votes: nextVotes }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleFirstKilledChange = (participantId: string | null) => {
    setProtocol((prev) => {
      const moves = (prev.best_moves || []).filter((move) => move.source !== 'first_killed');
      if (participantId) moves.push({ participant_id: participantId, source: 'first_killed', seat_numbers: [] });
      const next = { ...prev, first_killed_participant_id: participantId, best_moves: moves };
      const synced = syncAllEventsToResults(prev.votes || [], prev.shots || [], participantId, playerResults, next, evidenceBefore(prev));
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
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleDeleteNight = (index: number) => {
    setProtocol((prev) => {
      const shots = (prev.shots || []).filter((_, i) => i !== index).map((shot, i) => ({ ...shot, night_number: i + 1 }));
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  const handleShotChange = (index: number, targetSeat: number, result: 'killed' | 'miss' | 'agreement_failed') => {
    setProtocol((prev) => {
      const shots = [...(prev.shots || [])];
      shots[index] = { ...shots[index], target_seat: targetSeat, result };
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return synced.protocol;
    });
  };

  // The counter follows the table size (8–10 players), the same rule the save check uses.
  const roleCounts = useMemo(() => playerResults.reduce<Record<string, number>>((acc, player) => {
    if (player.role) acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {}), [playerResults]);

  const completeGame = async () => {
    // Say exactly what is missing, on screen (an alert() can be swallowed by a Telegram WebView).
    if (!roleCountsMatchTable(roleCounts, playerResults.length)) {
      setCompleteHint(`Перед подтверждением установите роли: ${isSupportedTableSize(playerResults.length) ? tableRolesLabel(playerResults.length) : '6 мирных, Шериф, 2 мафии и Дон'}.`);
      setActiveTab('players');
      return;
    }
    if (!protocol.winner_team) {
      setCompleteHint('Укажите победившую команду в разделе «Итог».');
      setActiveTab('result');
      return;
    }
    if (protocol.votes?.length) {
      const voting = validateProtocolVoting(protocol.votes, playerResults, protocol.zero_round_voted_participant_id, true, { tableSize: playerResults.length, zeroRoundRule: protocol.zero_round_rule ?? 'tournament' });
      if (voting.errorMsg) {
        setCompleteHint(voting.errorMsg);
        const failed = voting.roundIndexWithError == null ? null : (protocol.votes || [])[voting.roundIndexWithError];
        setCircle(failed ? Number((failed as any).day_number ?? 0) : 0);
        setActiveTab('game');
        return;
      }
    }
    setCompleteHint(null);
    const completed = { ...protocol, status: 'completed' as const };
    await save(completed, playerResults, { replaceEditor: true });
  };

  const reopenDraft = async () => {
    if (!confirm('Вернуть подтверждённую игру на исправление?')) return;
    const draft = { ...protocol, status: 'draft' as const, completed_at: null };
    await save(draft, playerResults, { replaceEditor: true });
  };

  const removeByJudge = (player: PlayerResultData) => {
    if (protocol.status === 'completed') return;
    if (confirm(`Удалить игрока #${player.seat_number} решением судьи?`)) updatePlayerResult(player.participant_id, { exit_type: 'removed', removal_reason: 'direct' });
  };

  const cancelRemoval = (player: PlayerResultData) => {
    if (protocol.status === 'completed') return;
    if (confirm(`Вернуть игрока #${player.seat_number}: отменить удаление судьёй?`)) updatePlayerResult(player.participant_id, { exit_type: 'alive', removal_reason: null });
  };

  const revertChange = (change: Change) => {
    const next = change.revert({ protocol, results: playerResults });
    // Taking back a vote, a shot or the first killed takes back what followed from it (who left the game) as well.
    const derived = /^(round-|shot-|first-killed|zero-voted)/.test(change.key);
    const synced = derived ? syncAllEventsToResults(next.protocol.votes || [], next.protocol.shots || [], next.protocol.first_killed_participant_id ?? null, next.results, next.protocol, evidenceBefore(protocol)) : null;
    setProtocol(synced ? synced.protocol : next.protocol);
    setPlayerResults(synced ? synced.player_results : next.results);
  };

  const zeroRoundRule = protocol.zero_round_rule ?? 'tournament';
  const issues = useMemo(() => computeIssues({ protocol, results: playerResults }, zeroRoundRule), [protocol, playerResults, zeroRoundRule]);
  const changes = useMemo(() => (baseline ? computeChanges(baseline, { protocol, results: playerResults }) : []), [baseline, protocol, playerResults]);
  const circles = useMemo(() => buildCircles(protocol), [protocol]);

  if (!isOpen) return null;

  const locked = protocol.status === 'completed';
  const api: ProtocolApi = {
    protocol, results: playerResults, locked, tableSize: playerResults.length, zeroRoundRule,
    updateResult: updatePlayerResult,
    changeRegularFoul, changeTechFoul,
    causePpk: handlePpk, cancelPpk: handleCancelPpk, removeByJudge, cancelRemoval,
    setWinner: (winner) => setProtocol((prev) => ({ ...prev, winner_team: winner })),
    setJudgeNotes: (notes) => setProtocol((prev) => ({ ...prev, judge_notes: notes })),
    setReplacement: (replacement) => setProtocol((prev) => ({ ...prev, replacement })),
    changeRound: handleRoundChange, confirmOutcome: handleConfirmOutcome, resetOutcome: handleResetOutcome,
    addVoting: handleAddVoting, deleteVoting: handleDeleteVoting,
    setZeroBreakSeat: (seat) => setProtocol((prev) => {
      const retained = (prev.events || []).filter((event) => !(event.kind === 'zero_round_break' && event.round === 1));
      if (seat === null) return { ...prev, events: retained };
      return { ...prev, events: [...retained, {
        seq: retained.reduce((max, event) => Math.max(max, event.seq), 0) + 1,
        at: new Date().toISOString(), round: 1, phase: 'day_voting', kind: 'zero_round_break', seat,
      }] };
    }),
    changeFirstKilled: handleFirstKilledChange, changeZeroRoundVoted: handleZeroRoundVotedChange, toggleBestMoveSeat,
    addNight: handleAddNight, deleteNight: handleDeleteNight, changeShot: handleShotChange,
  };

  const save_label = saveState === 'saving' ? { label: 'Сохраняем…', tone: 'neutral' as const }
    : saveState === 'unsaved' ? { label: 'Есть несохранённые изменения', tone: 'warn' as const }
      : saveState === 'error' ? { label: 'Не сохранилось', tone: 'bad' as const }
        : { label: 'Сохранено', tone: 'good' as const };
  const hint = completeHint || (saveState === 'error' && saveError ? `Не сохранилось: ${saveError}` : null);
  const goto = (tab: ProtocolTab, target?: { circle?: number; seat?: number }) => {
    if (target?.circle != null) setCircle(target.circle);
    if (tab === 'players' && target?.seat != null) setSelectedSeat(target.seat);
    setActiveTab(tab);
  };
  const close = async () => { if (protocol.status === 'draft' && saveState !== 'saved') await save(); onClose(); };

  return (
    <ProtocolWindow
      tab={activeTab}
      onTab={(tab) => { setCompleteHint(null); setActiveTab(tab); }}
      title={`Игра №${game.global_game_number}`}
      subtitle={`${game.table_name || 'Стол не указан'}${game.judge_name ? ` · судья ${game.judge_name}` : ''}`}
      confirmed={locked}
      save={save_label}
      attention={issues.length}
      onClose={() => void close()}
      rail={(
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3 text-[12px] leading-5 text-white/50">
          {issues.length ? `Замечаний: ${issues.length}` : 'Замечаний нет'}<br />
          Изменений: {changes.length}
        </div>
      )}
    >
      {hint ? <p role="alert" className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-[13px] font-medium leading-5 text-amber-100">{hint}</p> : null}
      {repairNotes.length ? (
        <Card tone="info" className="mb-4 text-[13px] leading-5" testId="legacy-repair-note">
          <span className="font-semibold">Исправлено автоматически по записи игры:</span> {repairNotes.join('; ')}. Сохранится вместе с исправлением протокола.
        </Card>
      ) : null}
      {activeTab === 'overview' && (
        <OverviewView api={api} circles={circles} issues={issues} changes={changes} reviewed={reviewed} onToggleReviewed={(index) => setReviewed((prev) => ({ ...prev, [index]: !prev[index] }))} onGoto={goto} onRevert={revertChange} onConfirm={() => void completeGame()} onReopen={() => void reopenDraft()} busy={saveState === 'saving'} />
      )}
      {activeTab === 'game' && (
        <GameFlowView api={api} circles={circles} circleIndex={circle} onCircle={setCircle} reviewed={reviewed} onToggleReviewed={(index) => setReviewed((prev) => ({ ...prev, [index]: !prev[index] }))} issues={issues} />
      )}
      {activeTab === 'players' && (
        <>
          <PlayersList api={api} issues={issues} onOpen={setSelectedSeat} />
          <PlayerSheet api={api} seat={selectedSeat} onClose={() => setSelectedSeat(null)} />
        </>
      )}
      {activeTab === 'result' && <ResultView api={api} />}
    </ProtocolWindow>
  );
};
