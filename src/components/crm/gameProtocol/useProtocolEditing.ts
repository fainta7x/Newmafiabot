import type { Dispatch, SetStateAction } from 'react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../../lib/api';
import { cleanAndSyncVotes as cleanVotes, createNextRevoteRound } from '../../../shared/tournamentVoting';
import { getOppositeTeam, recalculateVoteRemainder, syncAllEventsToResults } from '../tournaments/protocol/protocolStateUtils';
import { getConfirmedPlayerDisciplineUpdates, getRegularFoulChange, getTechFoulChange, type TechFoulType } from '../tournaments/protocol/protocolDisciplineUtils';
import type { Change } from './protocolReview';
import type { ProtocolApi } from './types';

type Options = {
  protocol: TournamentGameProtocolData;
  setProtocol: Dispatch<SetStateAction<TournamentGameProtocolData>>;
  playerResults: PlayerResultData[];
  setPlayerResults: Dispatch<SetStateAction<PlayerResultData[]>>;
  /** A guard may take over a change that needs the judge's confirmation (a tournament asks before it drops compensation points). Return true to stop the change. */
  guards?: { updateResult?: (participantId: string, updates: Partial<PlayerResultData>) => boolean; firstKilled?: (participantId: string | null) => boolean; zeroRoundVoted?: (participantId: string | null) => boolean };
};

/**
 * Everything the protocol window may do to a game, for the club protocol and the tournament protocol alike: one set of
 * edits, one set of consequences (who left the game follows from the votes, the shots and the first killed). Where the
 * game is loaded from and saved to stays with the caller.
 */
export const useProtocolEditing = ({ protocol, setProtocol, playerResults, setPlayerResults, guards }: Options) => {
  const cleanAndSyncVotes = (votes: Parameters<typeof cleanVotes>[0]) => cleanVotes(votes, playerResults.length);
  // An edit may only change the exits it really changes: a game whose evidence is incomplete keeps the exits it has.
  const evidenceBefore = (before: TournamentGameProtocolData) => ({ votes: before.votes || [], shots: before.shots || [], firstKilledId: before.first_killed_participant_id ?? null });

  const updatePlayerResult = (participantId: string, updates: Partial<PlayerResultData>) => {
    if (guards?.updateResult?.(participantId, updates)) return;
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

  // «Без оценок» is a scoring tag only: unlike handleRoundChange it keeps the confirmed result, revotes and exits.
  const handleRoundNoScoring = (index: number, noScoring: boolean) => {
    setProtocol((prev) => {
      const votes = [...(prev.votes || [])] as any[];
      if (!votes[index]) return prev;
      const round = { ...votes[index] };
      if (noScoring) round.no_scoring = true; else delete round.no_scoring;
      votes[index] = round;
      return { ...prev, votes };
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

  const handleFirstKilledChange = (participantId: string | null, mapResults?: (results: PlayerResultData[]) => PlayerResultData[]) => {
    setProtocol((prev) => {
      const moves = (prev.best_moves || []).filter((move) => move.source !== 'first_killed');
      if (participantId) moves.push({ participant_id: participantId, source: 'first_killed', seat_numbers: [] });
      const next = { ...prev, first_killed_participant_id: participantId, best_moves: moves };
      const synced = syncAllEventsToResults(prev.votes || [], prev.shots || [], participantId, playerResults, next, evidenceBefore(prev));
      setPlayerResults(mapResults ? mapResults(synced.player_results) : synced.player_results);
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
      const shots = [...(prev.shots || []), { night_number: (prev.shots || []).length + 1, target_seat: 0, result: 'miss' as const }];
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
      shots[index] = { ...shots[index], target_seat: targetSeat, result,
        ...(result === 'killed' ? { miss_reason: null, miss_responsible_seats: [] } : {}) };
      // The replay and the analysis read the shot from the chronology: keep its «выстрел» event of that night in step.
      const night = Number(shots[index].night_number) || index + 1;
      const events = Array.isArray(prev.events) && prev.events.length
        ? [...prev.events.filter((event) => !(event.kind === 'shot_target' && event.phase === 'night' && event.round === night)),
          { seq: prev.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1, at: new Date().toISOString(), round: night, phase: 'night', kind: 'shot_target', target: targetSeat }]
        : prev.events;
      const synced = syncAllEventsToResults(prev.votes || [], shots, prev.first_killed_participant_id, playerResults, { ...prev, shots }, evidenceBefore(prev));
      setPlayerResults(synced.player_results);
      return { ...synced.protocol, events };
    });
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

  const members = {
    updateResult: updatePlayerResult,
    changeRegularFoul, changeTechFoul,
    causePpk: handlePpk, cancelPpk: handleCancelPpk, removeByJudge, cancelRemoval,
    setWinner: (winner: 'red' | 'black' | null) => setProtocol((prev) => ({ ...prev, winner_team: winner })),
    setJudgeNotes: (notes: string) => setProtocol((prev) => ({ ...prev, judge_notes: notes })),
    setReplacement: (replacement: any | null) => setProtocol((prev) => ({ ...prev, replacement })),
    changeRound: handleRoundChange, setRoundNoScoring: handleRoundNoScoring, confirmOutcome: handleConfirmOutcome, resetOutcome: handleResetOutcome,
    addVoting: handleAddVoting, deleteVoting: handleDeleteVoting,
    setEvents: (updater: (events: any[]) => any[]) => setProtocol((prev) => ({ ...prev, events: updater(Array.isArray(prev.events) ? prev.events : []) })),
    setZeroBreakSeat: (seat: number | null) => setProtocol((prev) => {
      const retained = (prev.events || []).filter((event) => !(event.kind === 'zero_round_break' && event.round === 1));
      if (seat === null) return { ...prev, events: retained };
      return { ...prev, events: [...retained, {
        seq: retained.reduce((max, event) => Math.max(max, event.seq), 0) + 1,
        at: new Date().toISOString(), round: 1, phase: 'day_voting', kind: 'zero_round_break', seat,
      }] };
    }),
    changeFirstKilled: (participantId: string | null) => { if (!guards?.firstKilled?.(participantId)) handleFirstKilledChange(participantId); },
    changeZeroRoundVoted: (participantId: string | null) => { if (!guards?.zeroRoundVoted?.(participantId)) handleZeroRoundVotedChange(participantId); },
    toggleBestMoveSeat,
    addNight: handleAddNight, deleteNight: handleDeleteNight, changeShot: handleShotChange,
    assessMiss: (index: number, reason: 'error' | 'intentional' | null, responsible: number[]) => setProtocol((prev) => ({
      ...prev, shots: (prev.shots || []).map((shot, i) => i === index && shot.result !== 'killed'
        ? { ...shot, miss_reason: reason, miss_responsible_seats: reason === 'error' ? [...responsible] : [] } : shot),
    })),
  } satisfies Partial<ProtocolApi>;

  return { members, updatePlayerResult, revertChange, applyFirstKilled: handleFirstKilledChange, applyZeroRoundVoted: handleZeroRoundVotedChange };
};

