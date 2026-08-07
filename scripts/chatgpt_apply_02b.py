from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f'{label}: start marker not found')
    j = text.find(end, i + len(start))
    if j < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:i] + replacement + text[j:]


# ---------------------------------------------------------------------------
# 1. Pure protocol rules
# ---------------------------------------------------------------------------
protocol_path = 'src/lib/gameProtocolCore.ts'
protocol = read(protocol_path)
protocol = replace_once(
    protocol,
    "export function registerFirstKilled(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {\n  if (state.firstKilledSlot !== null) {",
    "export function isValidProtocolSlot(slot: number): boolean {\n  return Number.isInteger(slot) && slot >= 1 && slot <= 10;\n}\n\nexport function registerFirstKilled(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {\n  if (!isValidProtocolSlot(slot) || state.firstKilledSlot !== null) {",
    'protocol: first killed validation',
)
protocol = replace_once(
    protocol,
    "export function registerZeroRoundVoted(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {\n  if (state.zeroRoundVotedSlot !== null) {",
    "export function registerZeroRoundVoted(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {\n  if (!isValidProtocolSlot(slot) || state.zeroRoundVotedSlot !== null) {",
    'protocol: zero round validation',
)
protocol = replace_once(
    protocol,
    "  for (const seat of seats) {\n    if (seat < 1 || seat > 10) return false;\n  }",
    "  for (const seat of seats) {\n    if (!isValidProtocolSlot(seat)) return false;\n  }",
    'protocol: best move validation',
)
write(protocol_path, protocol)


# ---------------------------------------------------------------------------
# 2. Live voting pure helpers
# ---------------------------------------------------------------------------
live_voting_path = 'src/lib/liveVoting.ts'
live_voting = r'''/**
 * Pure helpers for ordinary live-game voting/protocol flow.
 * Tournament outcome rules remain in src/shared/tournamentVoting.ts.
 */

export type LiveProtocolRole = 'Мирный' | 'Шериф' | 'Мафия' | 'Дон';

/** Live round 1 is the tournament protocol zero round (day_number 0). */
export function liveRoundToTournamentDay(roundNumber: number): number {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return 0;
  return roundNumber - 1;
}

/**
 * PU / first-killed source is only an eligible red role actually killed on Night 1.
 */
export function isEligibleFirstKilled(
  roundNumber: number,
  role: LiveProtocolRole,
  wasKilled: boolean
): boolean {
  return wasKilled && roundNumber === 1 && (role === 'Мирный' || role === 'Шериф');
}

/**
 * A singular zero-round Best Move source exists only when the final resolved
 * zero-round voting chain eliminates exactly one player.
 */
export function getSingularZeroRoundElimination(
  dayNumber: number,
  eliminatedSeats: number[]
): number | null {
  if (dayNumber !== 0 || eliminatedSeats.length !== 1) return null;
  const [slot] = eliminatedSeats;
  return Number.isInteger(slot) && slot >= 1 && slot <= 10 ? slot : null;
}

/** Count explicit player choices. One voter key can contribute at most one vote. */
export function buildExplicitVoteCounts(
  nominatedSeats: number[],
  votesByPlayer: Record<number, number>,
  eligibleVoterSlots: number[]
): Record<number, number> {
  const counts: Record<number, number> = {};
  nominatedSeats.forEach((seat) => { counts[seat] = 0; });

  const eligible = new Set(eligibleVoterSlots);
  for (const [voterRaw, nominee] of Object.entries(votesByPlayer)) {
    const voter = Number(voterRaw);
    if (!eligible.has(voter) || !nominatedSeats.includes(nominee)) continue;
    counts[nominee] = (counts[nominee] || 0) + 1;
  }
  return counts;
}

/**
 * Detect when a sequential vote is mathematically decided before automatic
 * remainder is assigned to the last candidate.
 */
export function isVoteDecided(
  nominatedSeats: number[],
  explicitVoteCounts: Record<number, number>,
  eligibleVoters: number
): boolean {
  if (nominatedSeats.length === 0 || eligibleVoters <= 0) return false;

  const allocated = nominatedSeats.reduce(
    (sum, seat) => sum + Number(explicitVoteCounts[seat] || 0),
    0
  );
  const remaining = Math.max(0, eligibleVoters - allocated);

  const values = nominatedSeats.map((seat) => Number(explicitVoteCounts[seat] || 0));
  const highest = Math.max(...values);
  const leaders = values.filter((value) => value === highest).length;
  if (leaders !== 1) return false;

  const sorted = [...values].sort((a, b) => b - a);
  const secondHighest = sorted[1] ?? 0;
  return highest > Math.max(secondHighest, remaining);
}
'''
write(live_voting_path, live_voting)


# ---------------------------------------------------------------------------
# 3. Live engine types: retire duplicate night Best Move phase
# ---------------------------------------------------------------------------
types_path = 'src/components/LiveGameEngine/types.ts'
types = read(types_path)
types = replace_once(
    types,
    'export type NightSubPhase = "intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning";',
    'export type NightSubPhase = "intro" | "shooting" | "don" | "sheriff" | "morning";',
    'types: NightSubPhase',
)
write(types_path, types)


# ---------------------------------------------------------------------------
# 4. LiveGameEngine: protocol parity and dynamic voting corrections
# ---------------------------------------------------------------------------
engine_path = 'src/components/LiveGameEngine.tsx'
engine = read(engine_path)

engine = replace_once(
    engine,
    'import { isVoteDecided } from "../lib/liveVoting.js";',
    'import { liveRoundToTournamentDay, isEligibleFirstKilled, getSingularZeroRoundElimination } from "../lib/liveVoting.js";',
    'engine: liveVoting import',
)
engine = engine.replace('"intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning"', '"intro" | "shooting" | "don" | "sheriff" | "morning"')
engine = replace_once(
    engine,
    '  const [onConfirmBestMove, setOnConfirmBestMove] = useState<(() => void) | null>(null);\n',
    '',
    'engine: remove callback state',
)

# Save pending protocol overlay in undo history.
engine = replace_once(
    engine,
    '    protocolMarkers: LiveProtocolMarkers;\n    votingRounds: VotingRound[];',
    '    protocolMarkers: LiveProtocolMarkers;\n    activeBestMoveSource: BestMoveSource | null;\n    activeBestMoveSlot: number | null;\n    pendingBestMoveSeats: number[];\n    votingRounds: VotingRound[];',
    'engine: history type overlay',
)
engine = replace_once(
    engine,
    '        protocolMarkers: JSON.parse(JSON.stringify(protocolMarkers)),\n        votingRounds: JSON.parse(JSON.stringify(votingRounds)),',
    '        protocolMarkers: JSON.parse(JSON.stringify(protocolMarkers)),\n        activeBestMoveSource,\n        activeBestMoveSlot,\n        pendingBestMoveSeats: [...pendingBestMoveSeats],\n        votingRounds: JSON.parse(JSON.stringify(votingRounds)),',
    'engine: snapshot overlay',
)
engine = replace_once(
    engine,
    '    setProtocolMarkers(last.protocolMarkers || createEmptyLiveProtocolMarkers());\n    setVotingRounds(last.votingRounds || []);',
    '    setProtocolMarkers(last.protocolMarkers || createEmptyLiveProtocolMarkers());\n    setActiveBestMoveSource(last.activeBestMoveSource || null);\n    setActiveBestMoveSlot(last.activeBestMoveSlot ?? null);\n    setPendingBestMoveSeats(last.pendingBestMoveSeats || []);\n    setVotingRounds(last.votingRounds || []);',
    'engine: undo overlay',
)

# Autosave/restore pending overlay.
engine = replace_once(
    engine,
    '          protocolMarkers,\n          votingRounds,',
    '          protocolMarkers,\n          activeBestMoveSource,\n          activeBestMoveSlot,\n          pendingBestMoveSeats,\n          votingRounds,',
    'engine: autosave overlay',
)
engine = replace_once(
    engine,
    '    protocolMarkers,\n    votingRounds,',
    '    protocolMarkers,\n    activeBestMoveSource,\n    activeBestMoveSlot,\n    pendingBestMoveSeats,\n    votingRounds,',
    'engine: autosave deps overlay',
)
engine = replace_once(
    engine,
    '      setProtocolMarkers(restorableSession.protocolMarkers || createEmptyLiveProtocolMarkers());\n      setVotingRounds(restorableSession.votingRounds || []);',
    '      setProtocolMarkers(restorableSession.protocolMarkers || createEmptyLiveProtocolMarkers());\n      setActiveBestMoveSource(restorableSession.activeBestMoveSource || null);\n      setActiveBestMoveSlot(restorableSession.activeBestMoveSlot ?? null);\n      setPendingBestMoveSeats(restorableSession.pendingBestMoveSeats || []);\n      setVotingRounds(restorableSession.votingRounds || []);',
    'engine: restore overlay',
)

# Clear stale protocol metadata if a correction revives the source player.
insert_marker = '  const handleDiscardSavedSession = () => {\n    localStorage.removeItem("mafia_live_session");\n    setRestorableSession(null);\n    showToast("Сохраненная сессия сброшена", "info");\n  };\n'
stale_effect = insert_marker + r'''

  useEffect(() => {
    const staleSlots = [protocolMarkers.firstKilledSlot, protocolMarkers.zeroRoundVotedSlot]
      .filter((slot): slot is number => slot !== null)
      .filter((slot) => activePlayers.find((p) => p.slot_num === slot)?.alive);

    if (staleSlots.length === 0) return;

    setProtocolMarkers((prev) => staleSlots.reduce((next, slot) => clearBestMove(next, slot), prev));
    setActivePlayers((prev) => prev.map((p) =>
      staleSlots.includes(p.slot_num)
        ? { ...p, is_pu: false, best_move_guesses: [] }
        : p
    ));

    if (activeBestMoveSlot !== null && staleSlots.includes(activeBestMoveSlot)) {
      setActiveBestMoveSource(null);
      setActiveBestMoveSlot(null);
      setPendingBestMoveSeats([]);
    }
  }, [
    activePlayers,
    protocolMarkers.firstKilledSlot,
    protocolMarkers.zeroRoundVotedSlot,
    activeBestMoveSlot,
  ]);
'''
engine = replace_once(engine, insert_marker, stale_effect, 'engine: stale protocol cleanup')

# Night next/prev navigation: sheriff goes directly to morning.
old_next_sheriff = r'''      if (nightSubPhase === "sheriff") {
        const isFirstNight = roundNumber === 1;
        if (isFirstNight) {
          return {
            label: "Далее: Лучший ход",
            onClick: () => handleAdvanceNightSubPhase("best_move")
          };
        } else {
          return {
            label: "Далее: Итоги Ночи",
            onClick: () => handleAdvanceNightSubPhase("morning")
          };
        }
      }
      if (nightSubPhase === "best_move") {
        return {
          label: "Далее: Итоги Ночи",
          onClick: () => handleAdvanceNightSubPhase("morning")
        };
      }
'''
new_next_sheriff = r'''      if (nightSubPhase === "sheriff") {
        return {
          label: "Далее: Итоги Ночи",
          onClick: () => handleAdvanceNightSubPhase("morning")
        };
      }
'''
engine = replace_once(engine, old_next_sheriff, new_next_sheriff, 'engine: next night nav')
old_prev = r'''      if (nightSubPhase === "best_move") {
        return {
          label: "Шериф",
          onClick: () => handleAdvanceNightSubPhase("sheriff")
        };
      }
      if (nightSubPhase === "morning") {
        const isFirstNight = roundNumber === 1;
        return {
          label: isFirstNight ? "Лучший ход" : "Шериф",
          onClick: () => handleAdvanceNightSubPhase(isFirstNight ? "best_move" : "sheriff")
        };
      }
'''
new_prev = r'''      if (nightSubPhase === "morning") {
        return {
          label: "Шериф",
          onClick: () => handleAdvanceNightSubPhase("sheriff")
        };
      }
'''
engine = replace_once(engine, old_prev, new_prev, 'engine: prev night nav')

# Interactive vote: reassigning is a correction, not an error. Self-voting naturally works.
engine = replace_between(
    engine,
    '  const handleInteractiveVoteToggle = (voterSlot: number) => {',
    '  const markPlayerSpoken = (slotNum: number) => {',
    r'''  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nominatedSeats = currentRound.nominated_seats;
    const currentNominee = nominatedSeats[currentVotingNomineeIndex];
    if (!currentNominee) return;

    setVotesByPlayer((prev) => {
      const copy = { ...prev };
      if (copy[voterSlot] === currentNominee) {
        delete copy[voterSlot];
      } else {
        // One voter key = one vote. Re-clicking another candidate is an explicit correction.
        copy[voterSlot] = currentNominee;
      }

      const alivePlayers = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
      Object.keys(copy).forEach((slotStr) => {
        const slot = Number(slotStr);
        if (!alivePlayers.includes(slot)) delete copy[slot];
      });

      updateCurrentRoundVotes(copy);
      return copy;
    });
    playBeep(523, 0.05);
  };

''',
    'engine: interactive voting correction',
)

# Start main voting with tournament day_number 0 on live round 1 and an already-computed remainder.
engine = replace_between(
    engine,
    '  const handleTransitionToVoting = () => {',
    '  const handleAllocateVotes = (nominee: number, count: number) => {',
    r'''  const handleTransitionToVoting = () => {
    if (nominations.length === 0) {
      showToast("Нет кандидатов. Переходим в Ночь.", "info");
      startNightPhase();
      return;
    }

    const eligibleVoters = activePlayers.filter((p) => p.alive).length;
    const emptyCounts = nominations.reduce<Record<number, number>>((acc, seat) => {
      acc[seat] = 0;
      return acc;
    }, {});
    const initialCounts = calculateVoteRemainder(nominations, eligibleVoters, emptyCounts);

    const initialRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [...nominations],
      vote_counts: initialCounts,
      day_number: liveRoundToTournamentDay(roundNumber),
      eligible_voters: eligibleVoters,
      parent_round_number: null,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };

    setVotingRounds([initialRound]);
    setActiveVotingRoundIndex(0);
    setVotesByPlayer({});
    setVotes(initialCounts);
    setCurrentVotingNomineeIndex(0);
    setIsInteractiveVoting(true);
    setVotingStage('collecting');
    setTableLeaveVotesInput(null);
    setPhase("day_voting");
    setVotingSubPhase("voting_active");
    setBothLeaveVotes([]);
  };

''',
    'engine: transition to voting',
)

# Result handlers / arbitrary revote chain / table decision from tournament engine.
engine = replace_between(
    engine,
    '  const handleConfirmSingleElimination = (slotNum: number) => {',
    '  const handleAutoFillSetupPlayers = () => {',
    r'''  const handleConfirmSingleElimination = (slotNum: number) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const exitReason = currentRound.day_number === 0 ? 'voted_zero_round' : 'voted_day';
    eliminatePlayer(slotNum, `Голосование (День ${roundNumber})`, exitReason);

    setVotingRounds((prev) => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'single_eliminated',
          eliminated_seats: [slotNum],
        };
      }
      return copy;
    });

    const singularZeroRoundSlot = getSingularZeroRoundElimination(
      currentRound.day_number ?? liveRoundToTournamentDay(roundNumber),
      [slotNum]
    );
    if (singularZeroRoundSlot !== null && protocolMarkers.zeroRoundVotedSlot === null) {
      const nextMarkers = registerZeroRoundVoted(protocolMarkers, singularZeroRoundSlot);
      setProtocolMarkers(nextMarkers);
      setActiveBestMoveSource('zero_round_voted');
      setActiveBestMoveSlot(singularZeroRoundSlot);
      setPendingBestMoveSeats([]);
    }

    setNightLogs((prev) => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Голосование. Стол покинул игрок #${slotNum} (${votes[slotNum] || 0} голосов).`,
    }]);

    setVotingStage('resolved');
    startNightPhase();
  };

  const handleGoToRevoteSpeeches = (winners: number[]) => {
    setVotingRounds((prev) => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'tie_revote',
        };
      }
      return copy;
    });

    setNightLogs((prev) => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Голосование. Ничья между игроками ${winners.map((n) => `#${n}`).join(', ')}. Требуется переголосование.`,
    }]);

    setVotingStage('revote_speeches');
    setRevoteSpeakerIndex(0);
    setTableLeaveVotesInput(null);
    if (winners[0]) handleStartTimer(winners[0], 30);
  };

  const handleLaunchNextRevote = (winners: number[]) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound || winners.length === 0) return;

    const nextRound = createNextRevoteRound(currentRound, winners);
    nextRound.round_number = votingRounds.length + 1;
    const eligibleVoters = nextRound.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
    const initialCounts = calculateVoteRemainder(nextRound.nominated_seats, eligibleVoters, nextRound.vote_counts);
    nextRound.vote_counts = initialCounts;

    const nextIndex = votingRounds.length;
    setVotingRounds((prev) => [...prev, nextRound]);
    setActiveVotingRoundIndex(nextIndex);
    setVotesByPlayer({});
    setVotes(initialCounts);
    setCurrentVotingNomineeIndex(0);
    setIsInteractiveVoting(true);
    setVotingStage('collecting');
    setRevoteSpeakerIndex(0);
    setTableLeaveVotesInput(null);
    setActiveSpeakerSlot(null);
    setIsTimerRunning(false);

    setNightLogs((prev) => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Переголосование #${nextRound.round_number} между ${winners.map((n) => `#${n}`).join(', ')}.`,
    }]);
  };

  const handleConfirmAutoNoElimination = () => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;
    const result = determineVotingResult(currentRound);
    if (result.outcome !== 'auto_no_elimination') {
      showToast('Текущий раунд не допускает автоматическое завершение без выбывания.', 'warning');
      return;
    }

    setVotingRounds((prev) => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'no_elimination',
          eliminated_seats: [],
        };
      }
      return copy;
    });

    setNightLogs((prev) => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Повторная ничья затронула больше половины голосующих. Никто не покидает стол.`,
    }]);
    setVotingStage('resolved');
    startNightPhase();
  };

  const handleConfirmTableDecision = (winners: number[]) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const eligibleVoters = currentRound.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
    const votesCount = Math.max(0, Math.min(eligibleVoters, tableLeaveVotesInput ?? 0));
    const updatedRound: VotingRound = {
      ...currentRound,
      table_leave_votes: votesCount,
    };
    const result = determineVotingResult(updatedRound);

    if (result.outcome !== 'requires_table_decision' || !result.resolvedOutcome) {
      showToast('Не удалось определить итог голосования стола.', 'warning');
      return;
    }

    setVotingRounds((prev) => {
      const copy = [...prev];
      copy[activeVotingRoundIndex] = {
        ...updatedRound,
        outcome: result.resolvedOutcome,
        eliminated_seats: [...result.eliminatedSeats],
      };
      return copy;
    });

    const exitReason = currentRound.day_number === 0 ? 'voted_zero_round' : 'voted_day';
    result.eliminatedSeats.forEach((slot) => {
      eliminatePlayer(slot, `Решение стола (День ${roundNumber})`, exitReason);
    });

    // Multiple zero-round eliminations deliberately have no singular Best Move source.
    const singularZeroRoundSlot = getSingularZeroRoundElimination(
      currentRound.day_number ?? liveRoundToTournamentDay(roundNumber),
      result.eliminatedSeats
    );
    if (singularZeroRoundSlot !== null && protocolMarkers.zeroRoundVotedSlot === null) {
      const nextMarkers = registerZeroRoundVoted(protocolMarkers, singularZeroRoundSlot);
      setProtocolMarkers(nextMarkers);
      setActiveBestMoveSource('zero_round_voted');
      setActiveBestMoveSlot(singularZeroRoundSlot);
      setPendingBestMoveSeats([]);
    }

    setNightLogs((prev) => [...prev, {
      round: roundNumber,
      log: result.eliminatedSeats.length > 0
        ? `Д${roundNumber}: Решение стола — ${votesCount} за уход. Покидают стол: ${result.eliminatedSeats.map((n) => `#${n}`).join(', ')}.`
        : `Д${roundNumber}: Решение стола — ${votesCount} за уход. Большинство не набрано, все остаются.`,
    }]);

    setVotingStage('resolved');
    startNightPhase();
  };

  // Legacy signatures remain temporarily for SeatCard/prop compatibility only.
  // They do not decide voting outcomes anymore.
  const handleResolveShootoutVotes = (_act: "eliminate_one" | "eliminate_all" | "no_one_leaves", _slot?: number) => {};
  const handleStartReVoting = () => {};

''',
    'engine: dynamic voting result handlers',
)

# Generic elimination must never decide PU / Best Move source.
engine = replace_between(
    engine,
    '  const eliminatePlayer = (slotNum: number, reason: string, isMultipleElimination: boolean = false) => {',
    '  const handleSeatClick = (slotNum: number) => {',
    r'''  const eliminatePlayer = (
    slotNum: number,
    reason: string,
    exitReasonOverride?: 'killed' | 'voted_zero_round' | 'voted_day' | 'removed'
  ) => {
    saveSnapshot();
    const player = activePlayers.find((p) => p.slot_num === slotNum);
    if (!player) return;

    const extReason = exitReasonOverride ?? getExitReason(reason, roundNumber);
    setActivePlayers((prev) => prev.map((p) =>
      p.slot_num === slotNum
        ? { ...p, alive: false, eliminated_phase: reason, exit_reason: extReason }
        : p
    ));

    showToast(`Игрок #${slotNum} (${player.nickname}) покидает стол!`, "info");
    handleStartTimer(slotNum, 60);
  };

''',
    'engine: generic elimination',
)

# Remove old clickable night Best Move branch.
old_best_move_click = r'''      } else if (nightSubPhase === "best_move") {
        setBestMoveGuesses(prev => {
          if (prev.includes(slotNum)) {
            return prev.filter(g => g !== slotNum);
          }
          if (prev.length < 3) {
            return [...prev, slotNum];
          }
          return prev;
        });
        playBeep(659, 0.1);
'''
engine = replace_once(engine, old_best_move_click, '', 'engine: remove old night best move click')

# Night phase no longer has a duplicate Best Move step.
engine = replace_between(
    engine,
    '  const handleAdvanceNightSubPhase = (nextSub: "intro" | "shooting" | "don" | "sheriff" | "morning") => {',
    '  const startNightPhase = () => {',
    r'''  const handleAdvanceNightSubPhase = (nextSub: "intro" | "shooting" | "don" | "sheriff" | "morning") => {
    setNightSubPhase(nextSub);
    let duration = 15;
    let label = "";
    if (nextSub === "intro") {
      label = "Запуск ночи";
    } else if (nextSub === "shooting") {
      label = "Стрельба Мафии";
    } else if (nextSub === "don") {
      label = "Проверка Дона";
    } else if (nextSub === "sheriff") {
      label = "Проверка Шерифа";
    } else if (nextSub === "morning") {
      setIsTimerRunning(false);
      setCustomTimerLabel(null);
      return;
    }

    setCustomTimerLabel(label);
    setTimerMax(duration);
    setTimeLeft(duration);
    setIsTimerRunning(true);
    playBeep(523.25, 0.1);
  };

''',
    'engine: night subphases',
)
engine = engine.replace('    setBestMoveGuesses([]);\n', '')

# Resolve Night 1 PU explicitly; miss/black kill never creates a later PU.
engine = replace_between(
    engine,
    '  const handleResolveNight = () => {',
    '  const handleUndoLastLog = () => {',
    r'''  const handleResolveNight = () => {
    const logs: string[] = [];
    if (shotPlayerSlot) {
      const p = activePlayers.find((pl) => pl.slot_num === shotPlayerSlot);
      if (p && p.alive) {
        eliminatePlayer(shotPlayerSlot, `Убит ночью (Ночь ${roundNumber})`, 'killed');
        logs.push(`Выстрел в #${shotPlayerSlot} -> Убит.`);

        if (
          protocolMarkers.firstKilledSlot === null &&
          isEligibleFirstKilled(roundNumber, p.role, true)
        ) {
          const nextMarkers = registerFirstKilled(protocolMarkers, shotPlayerSlot);
          setProtocolMarkers(nextMarkers);
          setActivePlayers((prev) => prev.map((pl) => ({
            ...pl,
            is_pu: pl.slot_num === shotPlayerSlot,
          })));
          setActiveBestMoveSource('first_killed');
          setActiveBestMoveSlot(shotPlayerSlot);
          setPendingBestMoveSeats([]);
        }
      } else {
        logs.push(`Выстрел в #${shotPlayerSlot} -> Промах.`);
      }
    } else {
      logs.push("Промах мафии.");
    }

    if (donCheckSlot) {
      const p = activePlayers.find((pl) => pl.slot_num === donCheckSlot);
      if (p) logs.push(`Дон проверил #${donCheckSlot} -> ${p.role === "Шериф" ? "Шериф!" : "Не шериф"}`);
    }
    if (sheriffCheckSlot) {
      const p = activePlayers.find((pl) => pl.slot_num === sheriffCheckSlot);
      if (p) logs.push(`Шериф проверил #${sheriffCheckSlot} -> ${p.team === "Чёрные" ? "ЧЁРНЫЙ!" : "Красный"}`);
    }

    setNightLogs((prev) => [...prev, { round: roundNumber, log: logs.join(" | ") }]);
    setRoundNumber((r) => r + 1);
    setPhase("day_speeches");
    showToast("Наступило утро! Город просыпается.", "success");
  };

''',
    'engine: resolve night PU',
)

# Remove obsolete callback on overlay confirmation.
engine = re.sub(
    r'\n\s*if \(onConfirmBestMove\) \{\n\s*onConfirmBestMove\(\);\n\s*setOnConfirmBestMove\(null\);\n\s*\}',
    '',
    engine,
    count=1,
)
if 'onConfirmBestMove' in engine:
    raise RuntimeError('engine: stale onConfirmBestMove remains')

write(engine_path, engine)


# ---------------------------------------------------------------------------
# 5. CenterPanel: replace corrupted/legacy voting UI with one coherent UI
# ---------------------------------------------------------------------------
center_path = 'src/components/LiveGameEngine/CenterPanel.tsx'
center = read(center_path)
center = replace_once(
    center,
    'import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";',
    'import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";\nimport { buildExplicitVoteCounts, isVoteDecided } from "../../lib/liveVoting.js";',
    'center: voting helpers import',
)
center = replace_once(
    center,
    '  handleConfirmTableDecision?: (leavesTable: boolean, winners: number[]) => void;',
    '  handleConfirmTableDecision?: (winners: number[]) => void;',
    'center: table decision signature',
)
center = replace_once(
    center,
    '          {(["intro", "shooting", "don", "sheriff", "best_move", "morning"] as const).map((sub) => {\n            if (sub === "best_move" && roundNumber > 1) return null;\n\n            const labels: Record<string, string> = {\n              intro: "Старт",\n              shooting: "Стрельба 🔫",\n              don: "Дон 🎩",\n              sheriff: "Шериф 🌟",\n              best_move: "ЛХ 🏆",\n              morning: "Утро 🌅",\n            };',
    '          {(["intro", "shooting", "don", "sheriff", "morning"] as const).map((sub) => {\n            const labels: Record<string, string> = {\n              intro: "Старт",\n              shooting: "Стрельба 🔫",\n              don: "Дон 🎩",\n              sheriff: "Шериф 🌟",\n              morning: "Утро 🌅",\n            };',
    'center: night selector',
)

# Revote timer needs its own continuation instead of generic day-speech PAS.
quick_pas_marker = '            {/* Quick PAS / End Speech Button during active speeches */}\n'
revote_timer_block = r'''            {votingStage === 'revote_speeches' && activeSpeakerSlot !== null && (
              <button
                type="button"
                onClick={() => {
                  const currentRound = votingRounds[activeVotingRoundIndex];
                  if (!currentRound) return;
                  const winners = determineVotingResult(currentRound).winners;
                  setIsTimerRunning(false);
                  if (revoteSpeakerIndex < winners.length - 1) {
                    const nextIndex = revoteSpeakerIndex + 1;
                    setRevoteSpeakerIndex?.(nextIndex);
                    handleStartTimer(winners[nextIndex], 30);
                  } else {
                    setActiveSpeakerSlot(null);
                    handleLaunchNextRevote?.(winners);
                  }
                }}
                className="w-full mt-1.5 py-2.5 bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg border border-amber-400/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {(() => {
                  const currentRound = votingRounds[activeVotingRoundIndex];
                  const winners = currentRound ? determineVotingResult(currentRound).winners : [];
                  return revoteSpeakerIndex < winners.length - 1 ? 'Следующий спорный игрок →' : 'К переголосованию 🗳️';
                })()}
              </button>
            )}

'''
center = replace_once(center, quick_pas_marker, revote_timer_block + quick_pas_marker, 'center: revote timer controls')
center = replace_once(
    center,
    '{activeSpeakerSlot !== null && nextStep && (',
    "{activeSpeakerSlot !== null && nextStep && votingStage !== 'revote_speeches' && (",
    'center: generic PAS guard',
)

voting_ui = r'''            {phase === "day_voting" && (
              <div className="space-y-3 w-full text-center">
                {votingStage === 'collecting' && (() => {
                  const currentRound = votingRounds[activeVotingRoundIndex];
                  if (!currentRound) return null;

                  const nominatedSeats = currentRound.nominated_seats;
                  const eligibleSlots = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
                  const eligibleVoters = currentRound.eligible_voters ?? eligibleSlots.length;
                  const explicitCounts = buildExplicitVoteCounts(nominatedSeats, votesByPlayer, eligibleSlots);
                  const explicitAllocated = Object.values(explicitCounts).reduce((sum, count) => sum + count, 0);
                  const remaining = Math.max(0, eligibleVoters - explicitAllocated);
                  const activeNominee = nominatedSeats[currentVotingNomineeIndex];
                  const decided = isVoteDecided(nominatedSeats, explicitCounts, eligibleVoters);

                  return (
                    <div className="space-y-2.5">
                      <div>
                        <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                          {currentRound.is_revote ? `Переголосование #${currentRound.round_number}` : 'Основное голосование'}
                        </span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase">
                          Голосующих: {eligibleVoters} · Этап {activeVotingRoundIndex + 1} из {votingRounds.length}
                        </span>
                      </div>

                      {decided && (
                        <div className="max-w-[220px] mx-auto rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-[9px] font-black uppercase text-emerald-300">
                          ✓ Голосование решено
                        </div>
                      )}

                      <div className="space-y-1 max-w-[220px] mx-auto">
                        {nominatedSeats.map((seat, index) => (
                          <button
                            key={seat}
                            type="button"
                            onClick={() => selectVotingNomineeIndex(index)}
                            className={`w-full flex items-center justify-between rounded-lg border px-2 py-1.5 text-[10px] font-bold cursor-pointer ${
                              index === currentVotingNomineeIndex
                                ? 'border-amber-500 bg-amber-950/35 text-amber-200'
                                : 'border-slate-800 bg-slate-950 text-slate-300'
                            }`}
                          >
                            <span>{index + 1}. Игрок #{seat}</span>
                            <span className="font-mono text-rose-400">{votes[seat] ?? 0}</span>
                          </button>
                        ))}
                      </div>

                      <div className="max-w-[220px] mx-auto rounded-xl border border-slate-800 bg-slate-950/80 p-2 text-[9px] text-slate-400">
                        <div className="font-bold text-slate-300">
                          Сейчас считаем за #{activeNominee ?? '—'}
                        </div>
                        <div className="mt-1">
                          Нажимайте на карточки голосующих. Повторный выбор другого кандидата корректирует голос.
                        </div>
                        <div className="mt-1 font-mono">
                          Явно введено: {explicitAllocated}/{eligibleVoters} · Остаток последнему: {remaining}
                        </div>
                      </div>

                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={currentVotingNomineeIndex <= 0}
                          onClick={() => selectVotingNomineeIndex(Math.max(0, currentVotingNomineeIndex - 1))}
                          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-[9px] font-bold text-slate-300 disabled:opacity-30 cursor-pointer"
                        >
                          ← Назад
                        </button>
                        {currentVotingNomineeIndex < nominatedSeats.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-[9px] font-black text-white cursor-pointer"
                          >
                            Далее →
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResolveVoting}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-[9px] font-black uppercase text-white cursor-pointer"
                          >
                            Подвести итог 🗳️
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {votingStage === 'round_result' && (() => {
                  const currentRound = votingRounds[activeVotingRoundIndex];
                  if (!currentRound) return null;
                  const result = determineVotingResult(currentRound);
                  const eligibleVoters = currentRound.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
                  const majorityRequired = Math.floor(eligibleVoters / 2) + 1;

                  return (
                    <div className="space-y-2.5">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                        {currentRound.is_revote ? 'Результат переголосования' : 'Результат голосования'}
                      </span>

                      <div className="space-y-1 max-w-[220px] mx-auto">
                        {currentRound.nominated_seats.map((seat) => (
                          <div key={seat} className="flex justify-between rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] font-bold">
                            <span>Игрок #{seat}</span>
                            <span className="font-mono text-rose-400">{currentRound.vote_counts[seat] ?? 0}</span>
                          </div>
                        ))}
                      </div>

                      {result.outcome === 'single_eliminated' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmSingleElimination?.(result.winners[0])}
                          className="w-full max-w-[220px] mx-auto rounded-xl bg-rose-600 py-2 text-[10px] font-black uppercase text-white cursor-pointer"
                        >
                          Подтвердить уход #{result.winners[0]}
                        </button>
                      )}

                      {result.outcome === 'needs_revote' && (
                        <div className="space-y-2">
                          <p className="max-w-[220px] mx-auto rounded-xl border border-amber-500/30 bg-amber-950/30 p-2 text-[9px] text-amber-200">
                            Ничья: {result.winners.map((seat) => `#${seat}`).join(', ')}. Следующее переголосование — только среди этих игроков.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleGoToRevoteSpeeches?.(result.winners)}
                            className="w-full max-w-[220px] mx-auto rounded-xl bg-amber-600 py-2 text-[10px] font-black uppercase text-white cursor-pointer"
                          >
                            Речи по 30 секунд 🎙️
                          </button>
                        </div>
                      )}

                      {result.outcome === 'requires_table_decision' && (
                        <div className="space-y-2 max-w-[220px] mx-auto">
                          <p className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-2 text-[9px] text-amber-200">
                            Повторная ничья того же состава: {result.winners.map((seat) => `#${seat}`).join(', ')}.
                            Введите число голосов ЗА уход всех спорных игроков.
                          </p>
                          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                            <div className="text-[8px] font-bold uppercase text-slate-400">
                              За уход: {tableLeaveVotesInput ?? 0} из {eligibleVoters} · Нужно {majorityRequired}
                            </div>
                            <div className="mt-2 flex items-center justify-center gap-3">
                              <button
                                type="button"
                                onClick={() => setTableLeaveVotesInput?.(Math.max(0, (tableLeaveVotesInput ?? 0) - 1))}
                                className="h-8 w-10 rounded-lg border border-slate-800 bg-slate-900 font-black text-slate-300 cursor-pointer"
                              >−</button>
                              <span className="w-8 font-mono text-lg font-black text-amber-400">{tableLeaveVotesInput ?? 0}</span>
                              <button
                                type="button"
                                onClick={() => setTableLeaveVotesInput?.(Math.min(eligibleVoters, (tableLeaveVotesInput ?? 0) + 1))}
                                className="h-8 w-10 rounded-lg border border-slate-800 bg-slate-900 font-black text-amber-300 cursor-pointer"
                              >+</button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConfirmTableDecision?.(result.winners)}
                            className="w-full rounded-xl bg-rose-600 py-2 text-[9px] font-black uppercase text-white cursor-pointer"
                          >
                            Подтвердить голосование стола
                          </button>
                        </div>
                      )}

                      {result.outcome === 'auto_no_elimination' && (
                        <div className="space-y-2">
                          <p className="max-w-[220px] mx-auto rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-2 text-[9px] text-emerald-200">
                            Повторная ничья затронула больше половины голосующих. По правилу никто не покидает стол.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleConfirmAutoNoElimination?.()}
                            className="w-full max-w-[220px] mx-auto rounded-xl bg-emerald-600 py-2 text-[9px] font-black uppercase text-white cursor-pointer"
                          >
                            Подтвердить и перейти в ночь
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {votingStage === 'revote_speeches' && activeSpeakerSlot === null && (() => {
                  const currentRound = votingRounds[activeVotingRoundIndex];
                  if (!currentRound) return null;
                  const winners = determineVotingResult(currentRound).winners;
                  const slot = winners[revoteSpeakerIndex];
                  return (
                    <div className="space-y-2">
                      <span className="text-xs font-black uppercase text-amber-400">Речи спорных игроков</span>
                      <p className="text-[9px] text-slate-400">Игрок #{slot} · {revoteSpeakerIndex + 1} из {winners.length}</p>
                      <button
                        type="button"
                        onClick={() => slot && handleStartTimer(slot, 30)}
                        className="w-full max-w-[220px] mx-auto rounded-xl bg-amber-600 py-2 text-[10px] font-black uppercase text-white cursor-pointer"
                      >
                        Начать 30 секунд
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

'''
center = replace_between(
    center,
    '            {phase === "day_voting" && (',
    '            {phase === "night" && (',
    voting_ui,
    'center: replace voting UI',
)

# Remove old night Best Move body if it survived outside replaced voting area.
if '{nightSubPhase === "best_move" && (' in center:
    center = replace_between(
        center,
        '                {nightSubPhase === "best_move" && (',
        '                {nightSubPhase === "morning" && (',
        '                {nightSubPhase === "morning" && (',
        'center: remove old night best move body',
    )

write(center_path, center)


# ---------------------------------------------------------------------------
# 6. Tests
# ---------------------------------------------------------------------------
protocol_test_path = 'src/tests/gameProtocolCore.test.ts'
protocol_test = read(protocol_test_path)
protocol_test = replace_once(
    protocol_test,
    "  registerZeroRoundVoted,\n  isBestMoveAvailable,",
    "  registerZeroRoundVoted,\n  isValidProtocolSlot,\n  isBestMoveAvailable,",
    'protocol tests: import validator',
)
protocol_test = replace_once(
    protocol_test,
    "  it('4. Checks Best Move availability correctly', () => {",
    r'''  it('4. Rejects invalid protocol marker slots', () => {
    const empty = createEmptyLiveProtocolMarkers();
    for (const invalid of [0, 11, -1, 2.5, Number.NaN]) {
      expect(isValidProtocolSlot(invalid)).toBe(false);
      expect(registerFirstKilled(empty, invalid)).toBe(empty);
      expect(registerZeroRoundVoted(empty, invalid)).toBe(empty);
    }
    expect(isValidProtocolSlot(1)).toBe(true);
    expect(isValidProtocolSlot(10)).toBe(true);
  });

  it('5. Checks Best Move availability correctly', () => {''',
    'protocol tests: invalid slots',
)
write(protocol_test_path, protocol_test)

live_test = r'''import { describe, expect, it } from 'vitest';
import {
  buildExplicitVoteCounts,
  getSingularZeroRoundElimination,
  isEligibleFirstKilled,
  isVoteDecided,
  liveRoundToTournamentDay,
} from '../lib/liveVoting';
import {
  calculateVoteRemainder,
  createNextRevoteRound,
  determineVotingResult,
  VotingRound,
} from '../shared/tournamentVoting';

const round = (
  nominated: number[],
  counts: Record<number, number>,
  eligible: number,
  isRevote = false,
  tableLeaveVotes: number | null = null,
): VotingRound => ({
  round_number: 1,
  is_revote: isRevote,
  nominated_seats: nominated,
  vote_counts: counts,
  day_number: 0,
  eligible_voters: eligible,
  parent_round_number: null,
  outcome: 'pending',
  eliminated_seats: [],
  table_leave_votes: tableLeaveVotes,
});

describe('live voting parity helpers', () => {
  it('maps live round 1 to tournament zero round', () => {
    expect(liveRoundToTournamentDay(1)).toBe(0);
    expect(liveRoundToTournamentDay(2)).toBe(1);
  });

  it('allows PU only for citizen/sheriff killed on Night 1', () => {
    expect(isEligibleFirstKilled(1, 'Мирный', true)).toBe(true);
    expect(isEligibleFirstKilled(1, 'Шериф', true)).toBe(true);
    expect(isEligibleFirstKilled(1, 'Мафия', true)).toBe(false);
    expect(isEligibleFirstKilled(1, 'Дон', true)).toBe(false);
    expect(isEligibleFirstKilled(2, 'Мирный', true)).toBe(false);
    expect(isEligibleFirstKilled(1, 'Мирный', false)).toBe(false);
  });

  it('creates singular zero-round source only for one final elimination', () => {
    expect(getSingularZeroRoundElimination(0, [4])).toBe(4);
    expect(getSingularZeroRoundElimination(0, [])).toBeNull();
    expect(getSingularZeroRoundElimination(0, [4, 5])).toBeNull();
    expect(getSingularZeroRoundElimination(1, [4])).toBeNull();
  });

  it('one candidate receives all eligible votes', () => {
    expect(calculateVoteRemainder([3], 10, { 3: 0 })).toEqual({ 3: 10 });
  });

  it('last candidate receives the remainder', () => {
    expect(calculateVoteRemainder([2, 5], 10, { 2: 4, 5: 0 })).toEqual({ 2: 4, 5: 6 });
  });

  it('self-vote is representable and one voter key counts once', () => {
    const counts = buildExplicitVoteCounts([3, 5], { 3: 3, 4: 3, 5: 5 }, [3, 4, 5]);
    expect(counts).toEqual({ 3: 2, 5: 1 });
    const reassigned = buildExplicitVoteCounts([3, 5], { 3: 5, 4: 3 }, [3, 4]);
    expect(reassigned).toEqual({ 3: 1, 5: 1 });
  });

  it('detects decided vote from explicit votes only', () => {
    expect(isVoteDecided([2, 5], { 2: 6, 5: 0 }, 10)).toBe(true);
    expect(isVoteDecided([2, 5], { 2: 5, 5: 0 }, 10)).toBe(false);
    expect(isVoteDecided([2, 5], { 2: 3, 5: 3 }, 10)).toBe(false);
  });

  it('unique leader resolves to one elimination', () => {
    const result = determineVotingResult(round([2, 5], { 2: 6, 5: 4 }, 10));
    expect(result.outcome).toBe('single_eliminated');
    expect(result.eliminatedSeats).toEqual([2]);
  });

  it('5/5 main tie -> revote; repeated 5/5 -> table decision', () => {
    const main = round([2, 5], { 2: 5, 5: 5 }, 10);
    const mainResult = determineVotingResult(main);
    expect(mainResult.outcome).toBe('needs_revote');
    const child = createNextRevoteRound(main, mainResult.winners);
    child.vote_counts = { 2: 5, 5: 5 };
    expect(determineVotingResult(child).outcome).toBe('requires_table_decision');
  });

  it('3/3/3/1 -> 5/5/0 -> another child only for two leaders', () => {
    const main = round([1, 2, 3, 4], { 1: 3, 2: 3, 3: 3, 4: 1 }, 10);
    const firstResult = determineVotingResult(main);
    expect(firstResult.winners).toEqual([1, 2, 3]);
    const child = createNextRevoteRound(main, firstResult.winners);
    child.vote_counts = { 1: 5, 2: 5, 3: 0 };
    const childResult = determineVotingResult(child);
    expect(childResult.outcome).toBe('needs_revote');
    expect(childResult.winners).toEqual([1, 2]);
    const grandchild = createNextRevoteRound(child, childResult.winners);
    expect(grandchild.nominated_seats).toEqual([1, 2]);
  });

  it('exactly half the voters may reach table decision', () => {
    expect(determineVotingResult(round([1, 2, 3, 4], { 1: 2, 2: 2, 3: 2, 4: 2 }, 8, true)).outcome)
      .toBe('requires_table_decision');
    expect(determineVotingResult(round([1, 2], { 1: 3, 2: 3 }, 6, true)).outcome)
      .toBe('requires_table_decision');
  });

  it('more than half repeated tie automatically eliminates nobody', () => {
    const result = determineVotingResult(round([1, 2, 3, 4, 5, 6, 7], {
      1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
    }, 7, true));
    expect(result.outcome).toBe('auto_no_elimination');
    expect(result.eliminatedSeats).toEqual([]);
  });

  it('table vote majority is decided by tournamentVoting', () => {
    const leaves = determineVotingResult(round([2, 5], { 2: 5, 5: 5 }, 10, true, 6));
    expect(leaves.resolvedOutcome).toBe('all_tied_eliminated');
    expect(leaves.eliminatedSeats).toEqual([2, 5]);

    const stays = determineVotingResult(round([2, 5], { 2: 5, 5: 5 }, 10, true, 5));
    expect(stays.resolvedOutcome).toBe('no_elimination');
    expect(stays.eliminatedSeats).toEqual([]);
  });
});
'''
write('src/tests/liveVoting.test.ts', live_test)

print('PATCH 02B source edits applied successfully')
