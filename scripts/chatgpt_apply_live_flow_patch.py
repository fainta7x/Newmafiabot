from pathlib import Path

path = Path('src/components/LiveGameEngine.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
'''import {
  BestMoveSource,
  LiveProtocolMarkers,
  clearBestMove,
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  setBestMove,
} from "../lib/gameProtocolCore.js";
''',
'''import {
  BestMoveSource,
  LiveProtocolMarkers,
  clearBestMove,
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  setBestMove,
} from "../lib/gameProtocolCore.js";
import { buildVotingFarewellQueue, determineLiveWinner } from "../lib/liveGameFlow.js";
''',
'import live flow helpers',
)

replace_once(
'''  tableLeaveVotesInput: number | null;
  activeSpeakerSlot: number | null;
  customTimerLabel: string | null;
  timeLeft: number;
  timerMax: number;
  isTimerRunning: boolean;
  discipline: GameDiscipline;
};
''',
'''  tableLeaveVotesInput: number | null;
  currentVotingNomineeIndex: number;
  activeSpeakerSlot: number | null;
  customTimerLabel: string | null;
  timeLeft: number;
  timerMax: number;
  isTimerRunning: boolean;
  zeroNightSubPhase: "agreement" | "sheriff" | "seating" | null;
  shotPlayerSlot: number | null;
  donCheckSlot: number | null;
  donCheckResult: boolean | null;
  sheriffCheckSlot: number | null;
  sheriffCheckResult: string | null;
  nightLogs: { round: number; log: string }[];
  votingFarewellQueue: number[];
  votingFarewellIndex: number;
  discipline: GameDiscipline;
};
''',
'extend snapshot type',
)

replace_once(
'''  const [votingStage, setVotingStage] = useState<VotingStage>('setup');
  const [revoteSpeakerIndex, setRevoteSpeakerIndex] = useState(0);
  const [tableLeaveVotesInput, setTableLeaveVotesInput] = useState<number | null>(null);

  const [shotPlayerSlot, setShotPlayerSlot] = useState<number | null>(null);
''',
'''  const [votingStage, setVotingStage] = useState<VotingStage>('setup');
  const [revoteSpeakerIndex, setRevoteSpeakerIndex] = useState(0);
  const [tableLeaveVotesInput, setTableLeaveVotesInput] = useState<number | null>(null);
  const [votingFarewellQueue, setVotingFarewellQueue] = useState<number[]>([]);
  const [votingFarewellIndex, setVotingFarewellIndex] = useState(0);

  const [shotPlayerSlot, setShotPlayerSlot] = useState<number | null>(null);
''',
'farewell state',
)

replace_once(
'''  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMuted, setIsMuted] = useState(false);
''',
'''  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameFinishedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
''',
'game finished guard',
)

replace_once(
'''    votingStage,
    revoteSpeakerIndex,
    tableLeaveVotesInput,
    activeSpeakerSlot,
    customTimerLabel,
    timeLeft,
    timerMax,
    isTimerRunning,
    discipline: JSON.parse(JSON.stringify(discipline)),
''',
'''    votingStage,
    revoteSpeakerIndex,
    tableLeaveVotesInput,
    currentVotingNomineeIndex,
    activeSpeakerSlot,
    customTimerLabel,
    timeLeft,
    timerMax,
    isTimerRunning,
    zeroNightSubPhase,
    shotPlayerSlot,
    donCheckSlot,
    donCheckResult,
    sheriffCheckSlot,
    sheriffCheckResult,
    nightLogs: JSON.parse(JSON.stringify(nightLogs)),
    votingFarewellQueue: [...votingFarewellQueue],
    votingFarewellIndex,
    discipline: JSON.parse(JSON.stringify(discipline)),
''',
'extend takeSnapshot',
)

replace_once(
'''    setVotingStage(snapshot.votingStage || 'setup');
    setRevoteSpeakerIndex(snapshot.revoteSpeakerIndex || 0);
    setTableLeaveVotesInput(snapshot.tableLeaveVotesInput ?? null);
    setActiveSpeakerSlot(snapshot.activeSpeakerSlot ?? null);
    setCustomTimerLabel(snapshot.customTimerLabel ?? null);
    setTimeLeft(snapshot.timeLeft ?? 60);
    setTimerMax(snapshot.timerMax ?? 60);
    setIsTimerRunning(Boolean(snapshot.isTimerRunning));
    setDiscipline(snapshot.discipline || initialDiscipline());
''',
'''    setVotingStage(snapshot.votingStage || 'setup');
    setRevoteSpeakerIndex(snapshot.revoteSpeakerIndex || 0);
    setTableLeaveVotesInput(snapshot.tableLeaveVotesInput ?? null);
    setCurrentVotingNomineeIndex(snapshot.currentVotingNomineeIndex || 0);
    setActiveSpeakerSlot(snapshot.activeSpeakerSlot ?? null);
    setCustomTimerLabel(snapshot.customTimerLabel ?? null);
    setTimeLeft(snapshot.timeLeft ?? 60);
    setTimerMax(snapshot.timerMax ?? 60);
    setIsTimerRunning(Boolean(snapshot.isTimerRunning));
    setZeroNightSubPhase(snapshot.zeroNightSubPhase ?? null);
    setShotPlayerSlot(snapshot.shotPlayerSlot ?? null);
    setDonCheckSlot(snapshot.donCheckSlot ?? null);
    setDonCheckResult(snapshot.donCheckResult ?? null);
    setSheriffCheckSlot(snapshot.sheriffCheckSlot ?? null);
    setSheriffCheckResult(snapshot.sheriffCheckResult ?? null);
    setNightLogs(snapshot.nightLogs || []);
    setVotingFarewellQueue(snapshot.votingFarewellQueue || []);
    setVotingFarewellIndex(snapshot.votingFarewellIndex || 0);
    setDiscipline(snapshot.discipline || initialDiscipline());
''',
'extend restoreSnapshot',
)

replace_once(
'''    activeBestMoveSource, activeBestMoveSlot, pendingBestMoveSeats, votingRounds, activeVotingRoundIndex,
    votesByPlayer, votes, votingStage, revoteSpeakerIndex, tableLeaveVotesInput, nightLogs,
    shotPlayerSlot, donCheckSlot, donCheckResult, sheriffCheckSlot, sheriffCheckResult,
    activeSpeakerSlot, customTimerLabel, timeLeft, timerMax, isTimerRunning, discipline,
''',
'''    activeBestMoveSource, activeBestMoveSlot, pendingBestMoveSeats, votingRounds, activeVotingRoundIndex,
    votesByPlayer, votes, votingStage, revoteSpeakerIndex, tableLeaveVotesInput, currentVotingNomineeIndex, nightLogs,
    shotPlayerSlot, donCheckSlot, donCheckResult, sheriffCheckSlot, sheriffCheckResult,
    activeSpeakerSlot, customTimerLabel, timeLeft, timerMax, isTimerRunning, discipline,
    zeroNightSubPhase, votingFarewellQueue, votingFarewellIndex,
''',
'autosave dependencies',
)

replace_once(
'''  const handleStartTimer = (slot: number, duration = 60) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive) return;
    if (player.mute_this_round) {
      markPlayerSpoken(slot);
      return showToast(`Игрок #${slot} пропускает речь`, "warning");
    }

    const consumed = consumeNextSpeech(discipline, String(slot));
''',
'''  const handleStartTimer = (slot: number, duration = 60) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive) return;
    if (player.mute_this_round) {
      markPlayerSpoken(slot);
      return showToast(`Игрок #${slot} пропускает речь`, "warning");
    }

    saveSnapshot();
    const consumed = consumeNextSpeech(discipline, String(slot));
''',
'snapshot speech start',
)

replace_once(
'''  const handleStartZeroNightTimer = (sub: "agreement" | "sheriff" | "seating") => {
    const durations = { agreement: 75, sheriff: 10, seating: 40 };
''',
'''  const handleStartZeroNightTimer = (sub: "agreement" | "sheriff" | "seating") => {
    saveSnapshot();
    const durations = { agreement: 75, sheriff: 10, seating: 40 };
''',
'snapshot zero night timer',
)

replace_once(
'''  const markPlayerSpoken = (slot: number) => {
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, has_spoken_this_round: true } : p));
''',
'''  const markPlayerSpoken = (slot: number) => {
    saveSnapshot();
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, has_spoken_this_round: true } : p));
''',
'snapshot finish speech',
)

replace_once(
'''    setDiscipline(createInitialGameDiscipline(activePlayers.map((p) => ({
      id: String(p.slot_num),
      team: p.team === 'Чёрные' ? 'black' : 'red',
    }))));
    localStorage.removeItem("mafia_live_session");
''',
'''    saveSnapshot();
    setDiscipline(createInitialGameDiscipline(activePlayers.map((p) => ({
      id: String(p.slot_num),
      team: p.team === 'Чёрные' ? 'black' : 'red',
    }))));
    localStorage.removeItem("mafia_live_session");
''',
'snapshot game start',
)

replace_once(
'''  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    const voter = activePlayers.find((p) => p.slot_num === voterSlot);
    if (!current || !voter?.alive) return;
    const nominee = current.nominated_seats[currentVotingNomineeIndex];
    if (!nominee) return;
    setVotesByPlayer((previous) => {
''',
'''  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    const voter = activePlayers.find((p) => p.slot_num === voterSlot);
    if (!current || !voter?.alive) return;
    const nominee = current.nominated_seats[currentVotingNomineeIndex];
    if (!nominee) return;
    saveSnapshot();
    setVotesByPlayer((previous) => {
''',
'snapshot card vote',
)

replace_once(
'''  const handleAllocateVotes = (nominee: number, desiredCount: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !current.nominated_seats.includes(nominee)) return;
    const eligible = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    setVotesByPlayer((previous) => {
''',
'''  const handleAllocateVotes = (nominee: number, desiredCount: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !current.nominated_seats.includes(nominee)) return;
    const eligible = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    saveSnapshot();
    setVotesByPlayer((previous) => {
''',
'snapshot manual vote',
)

replace_once(
'''  const handleInteractiveAutoRemainder = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
''',
'''  const handleInteractiveAutoRemainder = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    saveSnapshot();
''',
'snapshot remainder',
)

replace_once(
'''  const handleTransitionToVoting = () => {
    if (discipline.isNextVotingCancelled) {
''',
'''  const handleTransitionToVoting = () => {
    saveSnapshot();
    if (discipline.isNextVotingCancelled) {
''',
'snapshot transition to voting',
)

replace_once(
'''  const handleResolveVoting = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const result = determineVotingResult(current);
    if (result.outcome === 'pending') return showToast(result.description, 'warning');
    setVotingStage('round_result');
  };
''',
'''  const handleResolveVoting = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const result = determineVotingResult(current);
    if (result.outcome === 'pending') return showToast(result.description, 'warning');
    saveSnapshot();
    setVotingStage('round_result');
  };
''',
'snapshot resolve vote',
)

replace_once(
'''  const openBestMoveProtocol = (source: BestMoveSource, slot: number, initialSeats: number[] = []) => {
    setActiveBestMoveSource(source);
    setActiveBestMoveSlot(slot);
    setPendingBestMoveSeats([...initialSeats]);
  };

  const handleConfirmSingleElimination = (slot: number) => {
''',
'''  const openBestMoveProtocol = (source: BestMoveSource, slot: number, initialSeats: number[] = []) => {
    setActiveBestMoveSource(source);
    setActiveBestMoveSlot(slot);
    setPendingBestMoveSeats([...initialSeats]);
  };

  const beginVotingFarewell = (queue: number[], index = 0) => {
    if (!queue.length || index >= queue.length) {
      setVotingFarewellQueue([]);
      setVotingFarewellIndex(0);
      setActiveSpeakerSlot(null);
      setCustomTimerLabel(null);
      setIsTimerRunning(false);
      startNightPhase();
      return;
    }
    const slot = queue[index];
    setVotingFarewellQueue(queue);
    setVotingFarewellIndex(index);
    setVotingStage('resolved');
    setActiveSpeakerSlot(slot);
    setCustomTimerLabel(`Прощальная речь #${slot}`);
    setTimerMax(60);
    setTimeLeft(60);
    setIsTimerRunning(true);
  };

  const advanceVotingFarewell = () => {
    saveSnapshot();
    const nextIndex = votingFarewellIndex + 1;
    if (nextIndex < votingFarewellQueue.length) {
      beginVotingFarewell(votingFarewellQueue, nextIndex);
      return;
    }
    setVotingFarewellQueue([]);
    setVotingFarewellIndex(0);
    setActiveSpeakerSlot(null);
    setCustomTimerLabel(null);
    setIsTimerRunning(false);
    startNightPhase();
  };

  const handleConfirmSingleElimination = (slot: number) => {
''',
'farewell queue helpers',
)

replace_once(
'''    const zeroRoundSlot = getSingularZeroRoundElimination(current.day_number ?? -1, [slot]);
    if (zeroRoundSlot !== null && protocolMarkers.zeroRoundVotedSlot === null) {
      const next = registerZeroRoundVoted(protocolMarkers, zeroRoundSlot);
      setProtocolMarkers(next);
      openBestMoveProtocol('zero_round_voted', zeroRoundSlot);
    }

    setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: голосованием стол покинул игрок #${slot}.` }]);
    setVotingStage('resolved');
    startNightPhase();
''',
'''    const farewellQueue = buildVotingFarewellQueue([slot], current.nominated_seats);
    const zeroRoundSlot = getSingularZeroRoundElimination(current.day_number ?? -1, [slot]);
    if (zeroRoundSlot !== null && protocolMarkers.zeroRoundVotedSlot === null) {
      const next = registerZeroRoundVoted(protocolMarkers, zeroRoundSlot);
      setProtocolMarkers(next);
      setVotingFarewellQueue(farewellQueue);
      setVotingFarewellIndex(0);
      setActiveSpeakerSlot(null);
      setCustomTimerLabel(null);
      setIsTimerRunning(false);
      openBestMoveProtocol('zero_round_voted', zeroRoundSlot);
    } else {
      beginVotingFarewell(farewellQueue);
    }

    setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: голосованием стол покинул игрок #${slot}; перед ночью — прощальная минута.` }]);
    setVotingStage('resolved');
''',
'single elimination farewell',
)

replace_once(
'''  const handleLaunchNextRevote = (winners: number[]) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !winners.length) return;
    const child = createNextRevoteRound({ ...current, outcome: 'tie_revote' }, winners);
''',
'''  const handleLaunchNextRevote = (winners: number[]) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !winners.length) return;
    saveSnapshot();
    const child = createNextRevoteRound({ ...current, outcome: 'tie_revote' }, winners);
''',
'snapshot next revote',
)

replace_once(
'''  const handleConfirmAutoNoElimination = () => {
    setVotingStage('resolved');
''',
'''  const handleConfirmAutoNoElimination = () => {
    saveSnapshot();
    setVotingStage('resolved');
''',
'snapshot no elimination',
)

replace_once(
'''    if (result.resolvedOutcome === 'all_tied_eliminated') {
      const exitReason: NonNullable<ActivePlayerState['exit_reason']> = current.day_number === 0 ? 'voted_zero_round' : 'voted_day';
      result.eliminatedSeats.forEach((slot) => eliminatePlayer(slot, `Решение стола (День ${roundNumber})`, exitReason));
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; спорные ${winners.map((s) => `#${s}`).join(', ')} покинули стол.` }]);
    } else {
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; большинство не набрано, все остаются.` }]);
    }
    setVotingStage('resolved');
    startNightPhase();
''',
'''    if (result.resolvedOutcome === 'all_tied_eliminated') {
      const exitReason: NonNullable<ActivePlayerState['exit_reason']> = current.day_number === 0 ? 'voted_zero_round' : 'voted_day';
      result.eliminatedSeats.forEach((slot) => eliminatePlayer(slot, `Решение стола (День ${roundNumber})`, exitReason));
      const farewellQueue = buildVotingFarewellQueue(result.eliminatedSeats, current.nominated_seats);
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; спорные ${winners.map((s) => `#${s}`).join(', ')} покинули стол. Прощальные минуты: ${farewellQueue.map((s) => `#${s}`).join(', ')}.` }]);
      setVotingStage('resolved');
      beginVotingFarewell(farewellQueue);
      return;
    }

    setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; большинство не набрано, все остаются.` }]);
    setVotingStage('resolved');
    startNightPhase();
''',
'multiple elimination farewells',
)

replace_once(
'''  const handleAdvanceNightSubPhase = (sub: NightSubPhase) => {
    setNightSubPhase(sub);
''',
'''  const handleAdvanceNightSubPhase = (sub: NightSubPhase) => {
    saveSnapshot();
    setNightSubPhase(sub);
''',
'snapshot night subphase',
)

replace_once(
'''  const finishNightToDay = () => {
    setRoundNumber((value) => value + 1);
''',
'''  const finishNightToDay = () => {
    saveSnapshot();
    setRoundNumber((value) => value + 1);
''',
'snapshot finish night',
)

replace_once(
'''  const startDeathProtocol = () => {
    if (shotPlayerSlot === null) return finishNightToDay();
    setPostNightStage('death_protocol');
''',
'''  const startDeathProtocol = () => {
    if (shotPlayerSlot === null) return finishNightToDay();
    saveSnapshot();
    setPostNightStage('death_protocol');
''',
'snapshot death protocol',
)

replace_once(
'''  const handleSeatClick = (slot: number) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player) return;
    if (phase === 'night') {
      if (postNightStage !== 'none' || !player.alive) return;
      if (nightSubPhase === 'shooting') setShotPlayerSlot((value) => value === slot ? null : slot);
      else if (nightSubPhase === 'don') { setDonCheckSlot(slot); setDonCheckResult(player.role === 'Шериф'); }
      else if (nightSubPhase === 'sheriff') { setSheriffCheckSlot(slot); setSheriffCheckResult(player.team === 'Чёрные' ? 'ЧЁРНЫЙ!' : 'Красный'); }
      return;
    }
''',
'''  const handleSeatClick = (slot: number) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player) return;
    if (phase === 'night') {
      if (postNightStage !== 'none' || !player.alive) return;
      saveSnapshot();
      if (nightSubPhase === 'shooting') setShotPlayerSlot((value) => value === slot ? null : slot);
      else if (nightSubPhase === 'don') { setDonCheckSlot(slot); setDonCheckResult(player.role === 'Шериф'); }
      else if (nightSubPhase === 'sheriff') { setSheriffCheckSlot(slot); setSheriffCheckResult(player.team === 'Чёрные' ? 'ЧЁРНЫЙ!' : 'Красный'); }
      return;
    }
''',
'snapshot night seat click',
)

replace_once(
'''    if (phase === 'day_voting') return null;
''',
'''    if (phase === 'day_voting') {
      if (votingFarewellQueue.length > 0 && activeSpeakerSlot !== null) {
        const hasNext = votingFarewellIndex + 1 < votingFarewellQueue.length;
        const nextSlot = votingFarewellQueue[votingFarewellIndex + 1];
        return {
          label: hasNext ? `Прощальная #${nextSlot}` : 'Завершить прощальные',
          onClick: advanceVotingFarewell,
        };
      }
      return null;
    }
''',
'voting farewell next action',
)

replace_once(
'''  const getPrevStepAction = () => {
    if (phase === 'zero_night') return { label: 'Настройка', onClick: () => setPhase('setup') };
    if (phase === 'day_speeches' && roundNumber === 1) return { label: 'Нулевая ночь', onClick: () => setPhase('zero_night') };
    if (phase === 'day_speeches' && roundNumber > 1) return { label: 'Ночь', onClick: () => { setRoundNumber((r) => Math.max(1, r - 1)); setPhase('night'); setNightSubPhase('morning'); } };
    if (phase === 'night') {
      if (postNightStage === 'death_protocol') return { label: 'Прощальная', onClick: backToFarewellSpeech };
      if (postNightStage === 'farewell') return null;
      if (nightSubPhase === 'shooting') return { label: 'Старт ночи', onClick: () => handleAdvanceNightSubPhase('intro') };
      if (nightSubPhase === 'don') return { label: 'Стрельба', onClick: () => handleAdvanceNightSubPhase('shooting') };
      if (nightSubPhase === 'sheriff') return { label: 'Дон', onClick: () => handleAdvanceNightSubPhase('don') };
      if (nightSubPhase === 'morning') {
        if (targetCanGiveFirstKilledBestMove() && shotPlayerSlot !== null && protocolMarkers.firstKilledSlot === shotPlayerSlot) {
          return { label: 'ЛХ', onClick: handleStartFirstKilledBestMove };
        }
        return { label: 'Шериф', onClick: () => handleAdvanceNightSubPhase('sheriff') };
      }
    }
    return null;
  };
''',
'''  const getPrevStepAction = () => {
    if (!historyStack.length) return null;
    return { label: 'Назад', onClick: handleUndoAction };
  };
''',
'global undo back action',
)

# backToFarewellSpeech is obsolete once Back is a true snapshot undo everywhere.
old_back = '''  const backToFarewellSpeech = () => {
    if (shotPlayerSlot === null) return;
    setPostNightStage('farewell');
    setActiveSpeakerSlot(shotPlayerSlot);
    setCustomTimerLabel(`Прощальная речь #${shotPlayerSlot}`);
    setTimerMax(60);
    setTimeLeft(60);
    setIsTimerRunning(false);
  };

'''
if old_back not in text:
    raise RuntimeError('remove old local back: missing block')
text = text.replace(old_back, '', 1)

replace_once(
'''  const winTeam = (() => {
    const alive = activePlayers.filter((p) => p.alive);
    const red = alive.filter((p) => p.team === 'Красные').length;
    const black = alive.filter((p) => p.team === 'Чёрные').length;
    return black === 0 ? 'Красные' as const : black >= red ? 'Чёрные' as const : null;
  })();
''',
'''  const winTeam = determineLiveWinner(activePlayers);
''',
'use shared winner helper',
)

replace_once(
'''  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные", endReason: 'normal' | 'ppk' = 'normal', ppkSlot: number | null = null) => {
    const slots: GameSlot[] = activePlayers.map((p) => ({
''',
'''  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные", endReason: 'normal' | 'ppk' = 'normal', ppkSlot: number | null = null) => {
    if (gameFinishedRef.current) return;
    gameFinishedRef.current = true;
    const slots: GameSlot[] = activePlayers.map((p) => ({
''',
'guard game finish',
)

replace_once(
'''  const handlePpkFromMenu = (slot: number) => {
''',
'''  useEffect(() => {
    if (phase === 'setup' || gameFinishedRef.current) return;
    const winner = determineLiveWinner(activePlayers);
    if (!winner) return;

    const requiredFinalActionInProgress =
      activeBestMoveSource !== null ||
      votingFarewellQueue.length > 0 ||
      postNightStage !== 'none';
    if (requiredFinalActionInProgress) return;

    handleEndGameWithWinner(winner);
  }, [activePlayers, phase, activeBestMoveSource, votingFarewellQueue.length, postNightStage]);

  const handlePpkFromMenu = (slot: number) => {
''',
'auto winner effect',
)

replace_once(
'''              <button type="button" onClick={() => {
                const source = activeBestMoveSource;
                const slot = activeBestMoveSlot;
                const next = setBestMove(protocolMarkers, source, pendingBestMoveSeats);
''',
'''              <button type="button" onClick={() => {
                saveSnapshot();
                const source = activeBestMoveSource;
                const slot = activeBestMoveSlot;
                const next = setBestMove(protocolMarkers, source, pendingBestMoveSeats);
''',
'snapshot best move confirm',
)

replace_once(
'''                if (phase === 'night' && nightSubPhase === 'best_move' && source === 'first_killed') {
                  setNightSubPhase('morning');
                  setCustomTimerLabel(null);
                  setIsTimerRunning(false);
                }
''',
'''                if (source === 'zero_round_voted' && votingFarewellQueue.length > 0) {
                  beginVotingFarewell(votingFarewellQueue, 0);
                } else if (phase === 'night' && nightSubPhase === 'best_move' && source === 'first_killed') {
                  setNightSubPhase('morning');
                  setCustomTimerLabel(null);
                  setIsTimerRunning(false);
                }
''',
'continue after zero round best move',
)

path.write_text(text, encoding='utf-8')
print('LiveGameEngine.tsx patched successfully')
