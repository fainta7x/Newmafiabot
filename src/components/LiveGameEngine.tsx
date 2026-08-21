import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RotateCcw, Shield } from "lucide-react";
import { GameSlot } from "../types.js";
import {
  VotingRound,
  calculateVoteRemainder,
  createNextRevoteRound,
  determineVotingResult,
} from "../shared/tournamentVoting.js";
import {
  canRegisterFirstKilled,
  getExplicitVoteCounts,
  getSingularZeroRoundElimination,
  liveRoundToTournamentDay,
} from "../lib/liveVoting.js";
import {
  GameDiscipline,
  PendingActionType,
  addMajorTechFoul,
  addMinorTechFoul,
  addRegularFoul,
  confirmAction,
  consumeNextSpeech,
  createInitialGameDiscipline,
  requestDirectRemoval,
  requestPpk,
  resetNextVotingCancelled,
  restoreRemovedPlayer,
} from "../lib/gameDiscipline.js";
import SetupPhase from "./LiveGameEngine/SetupPhase.js";
import EventsPanel from "./LiveGameEngine/EventsPanel.js";
import SeatCard from "./LiveGameEngine/SeatCard.js";
import CenterPanel from "./LiveGameEngine/CenterPanel.js";
import { requestJudgeGameMusicStop } from "./JudgeGameMusicController.js";
import {
  BestMoveProtocolOverlay,
  DisciplineConfirmationOverlay,
  LiveGameToast,
  PlayerActionOverlay,
  RestorableSessionBanner,
} from "./LiveGameEngine/LiveGameOverlays.js";
import { ActivePlayerState, LiveGameEngineProps, NightSubPhase, Phase } from "./LiveGameEngine/types.js";
import {
  LiveSnapshot,
  PendingDisciplineConfirmation,
  PostNightStage,
  VotingStage,
  ZeroNightMusicState,
  cloneLiveSnapshot,
  createEmptyActivePlayer,
  createInitialLiveDiscipline,
  normalizeLiveSnapshotForRestore,
} from "./LiveGameEngine/engineStateModel.js";
import {
  autoFillSetupPlayers,
  getSetupStartValidationError,
  selectSetupPlayer,
  selectSetupRole,
  shuffleSetupRoles,
} from "./LiveGameEngine/setupState.js";
import {
  getNextDaySpeaker,
  markDaySpeakerSpoken,
} from "./LiveGameEngine/daySpeechModel.js";
import {
  canNightTargetGiveFirstKilledBestMove,
  findNightTarget,
  getDonCheckResult,
  getSheriffCheckResult,
  toggleNightShotTarget,
} from "./LiveGameEngine/nightTargetModel.js";
import {
  BestMoveSource,
  LiveProtocolMarkers,
  clearBestMove,
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  setBestMove,
} from "../lib/gameProtocolCore.js";
import { buildVotingFarewellQueue, determineLiveWinner } from "../lib/liveGameFlow.js";

export default function LiveGameEngine({ players, initialJudgeId, onGameFinished, onCancel, onPhaseChange, rolesHidden, onRolesHiddenChange }: LiveGameEngineProps) {
  const [judgeId, setJudgeId] = useState(initialJudgeId);
  const [phase, setPhase] = useState<Phase>("setup");
  const [roundNumber, setRoundNumber] = useState(1);
  const [nightSubPhase, setNightSubPhase] = useState<NightSubPhase>("intro");
  const [postNightStage, setPostNightStage] = useState<PostNightStage>('none');
  const [activePlayers, setActivePlayers] = useState<ActivePlayerState[]>(
    Array.from({ length: 10 }, (_, index) => createEmptyActivePlayer(index + 1))
  );
  const [discipline, setDiscipline] = useState<GameDiscipline>(createInitialLiveDiscipline);
  const [actionPlayerSlot, setActionPlayerSlot] = useState<number | null>(null);
  const [pendingDisciplineConfirmation, setPendingDisciplineConfirmation] = useState<PendingDisciplineConfirmation | null>(null);

  const [protocolMarkers, setProtocolMarkers] = useState<LiveProtocolMarkers>(createEmptyLiveProtocolMarkers());
  const [activeBestMoveSource, setActiveBestMoveSource] = useState<BestMoveSource | null>(null);
  const [activeBestMoveSlot, setActiveBestMoveSlot] = useState<number | null>(null);
  const [pendingBestMoveSeats, setPendingBestMoveSeats] = useState<number[]>([]);

  const [toast, setToast] = useState<{ message: string; type: "error" | "warning" | "success" | "info" } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerMax, setTimerMax] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activeSpeakerSlot, setActiveSpeakerSlot] = useState<number | null>(null);
  const [customTimerLabel, setCustomTimerLabel] = useState<string | null>(null);
  const [zeroNightSubPhase, setZeroNightSubPhase] = useState<"agreement" | "sheriff" | "seating" | null>(null);
  const [zeroNightMusicState, setZeroNightMusicState] = useState<ZeroNightMusicState>('pending');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameFinishedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);

  const [nominations, setNominations] = useState<number[]>([]);
  const [nominationsMap, setNominationsMap] = useState<Record<number, number>>({});
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [votesByPlayer, setVotesByPlayer] = useState<Record<number, number>>({});
  const [currentVotingNomineeIndex, setCurrentVotingNomineeIndex] = useState(0);
  const [votingRounds, setVotingRounds] = useState<VotingRound[]>([]);
  const [activeVotingRoundIndex, setActiveVotingRoundIndex] = useState(0);
  const [votingStage, setVotingStage] = useState<VotingStage>('setup');
  const [revoteSpeakerIndex, setRevoteSpeakerIndex] = useState(0);
  const [tableLeaveVotesInput, setTableLeaveVotesInput] = useState<number | null>(null);
  const [votingFarewellQueue, setVotingFarewellQueue] = useState<number[]>([]);
  const [votingFarewellIndex, setVotingFarewellIndex] = useState(0);

  const [shotPlayerSlot, setShotPlayerSlot] = useState<number | null>(null);
  const [donCheckSlot, setDonCheckSlot] = useState<number | null>(null);
  const [donCheckResult, setDonCheckResult] = useState<boolean | null>(null);
  const [sheriffCheckSlot, setSheriffCheckSlot] = useState<number | null>(null);
  const [sheriffCheckResult, setSheriffCheckResult] = useState<string | null>(null);
  const [nightLogs, setNightLogs] = useState<{ round: number; log: string }[]>([]);
  const [protocolNotes, setProtocolNotes] = useState("");

  const [historyStack, setHistoryStack] = useState<LiveSnapshot[]>([]);
  const [restorableSession, setRestorableSession] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [showRolesOnTable, setShowRolesOnTable] = useState(true);
  const rolesAreVisible = rolesHidden === undefined ? showRolesOnTable : !rolesHidden;
  const toggleRolesOnTable = () => {
    const nextVisible = !rolesAreVisible;
    setShowRolesOnTable(nextVisible);
    onRolesHiddenChange?.(!nextVisible);
  };

  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  const showToast = (message: string, type: "error" | "warning" | "success" | "info" = "info") => {
    setToast({ message, type });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 3200);
  };

  const playBeep = (freq: number, duration: number) => {
    if (isMuted) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.004, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {}
  };

  useEffect(() => {
    if (!isTimerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          setIsTimerRunning(false);
          playBeep(1000, 0.4);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerRunning, isMuted]);

  const takeSnapshot = (): LiveSnapshot => cloneLiveSnapshot({
    activePlayers,
    nominations,
    nominationsMap,
    phase,
    roundNumber,
    nightSubPhase,
    postNightStage,
    protocolMarkers,
    activeBestMoveSource,
    activeBestMoveSlot,
    pendingBestMoveSeats,
    votingRounds,
    activeVotingRoundIndex,
    votesByPlayer,
    votes,
    votingStage,
    revoteSpeakerIndex,
    tableLeaveVotesInput,
    currentVotingNomineeIndex,
    activeSpeakerSlot,
    customTimerLabel,
    timeLeft,
    timerMax,
    isTimerRunning,
    zeroNightSubPhase,
    zeroNightMusicState,
    shotPlayerSlot,
    donCheckSlot,
    donCheckResult,
    sheriffCheckSlot,
    sheriffCheckResult,
    nightLogs,
    votingFarewellQueue,
    votingFarewellIndex,
    discipline,
  });

  const saveSnapshot = () => setHistoryStack((previous) => [...previous.slice(-19), takeSnapshot()]);

  const restoreSnapshot = (snapshot: LiveSnapshot) => {
    const restored = normalizeLiveSnapshotForRestore(snapshot);
    setActivePlayers(restored.activePlayers);
    setNominations(restored.nominations);
    setNominationsMap(restored.nominationsMap);
    setPhase(restored.phase);
    setRoundNumber(restored.roundNumber);
    setNightSubPhase(restored.nightSubPhase);
    setPostNightStage(restored.postNightStage);
    setProtocolMarkers(restored.protocolMarkers);
    setActiveBestMoveSource(restored.activeBestMoveSource);
    setActiveBestMoveSlot(restored.activeBestMoveSlot);
    setPendingBestMoveSeats(restored.pendingBestMoveSeats);
    setVotingRounds(restored.votingRounds);
    setActiveVotingRoundIndex(restored.activeVotingRoundIndex);
    setVotesByPlayer(restored.votesByPlayer);
    setVotes(restored.votes);
    setVotingStage(restored.votingStage);
    setRevoteSpeakerIndex(restored.revoteSpeakerIndex);
    setTableLeaveVotesInput(restored.tableLeaveVotesInput);
    setCurrentVotingNomineeIndex(restored.currentVotingNomineeIndex);
    setActiveSpeakerSlot(restored.activeSpeakerSlot);
    setCustomTimerLabel(restored.customTimerLabel);
    setTimeLeft(restored.timeLeft);
    setTimerMax(restored.timerMax);
    setIsTimerRunning(restored.isTimerRunning);
    setZeroNightSubPhase(restored.zeroNightSubPhase);
    setZeroNightMusicState(restored.zeroNightMusicState);
    setShotPlayerSlot(restored.shotPlayerSlot);
    setDonCheckSlot(restored.donCheckSlot);
    setDonCheckResult(restored.donCheckResult);
    setSheriffCheckSlot(restored.sheriffCheckSlot);
    setSheriffCheckResult(restored.sheriffCheckResult);
    setNightLogs(restored.nightLogs);
    setVotingFarewellQueue(restored.votingFarewellQueue);
    setVotingFarewellIndex(restored.votingFarewellIndex);
    setDiscipline(restored.discipline);
  };

  const handleUndoAction = () => {
    const snapshot = historyStack[historyStack.length - 1];
    if (!snapshot) return showToast("История действий пуста", "warning");
    restoreSnapshot(snapshot);
    setHistoryStack((previous) => previous.slice(0, -1));
    showToast("Последнее действие отменено", "info");
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mafia_live_session");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.phase && parsed.phase !== 'setup' && parsed.activePlayers?.length === 10) setRestorableSession(parsed);
    } catch {}
  }, []);

  useEffect(() => {
    if (phase === 'setup') return;
    const data = {
      ...takeSnapshot(),
      nightLogs,
      shotPlayerSlot,
      donCheckSlot,
      donCheckResult,
      sheriffCheckSlot,
      sheriffCheckResult,
      savedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    try { localStorage.setItem("mafia_live_session", JSON.stringify(data)); } catch {}
  }, [
    activePlayers, nominations, nominationsMap, phase, roundNumber, nightSubPhase, postNightStage, protocolMarkers,
    activeBestMoveSource, activeBestMoveSlot, pendingBestMoveSeats, votingRounds, activeVotingRoundIndex,
    votesByPlayer, votes, votingStage, revoteSpeakerIndex, tableLeaveVotesInput, currentVotingNomineeIndex, nightLogs,
    shotPlayerSlot, donCheckSlot, donCheckResult, sheriffCheckSlot, sheriffCheckResult,
    activeSpeakerSlot, customTimerLabel, timeLeft, timerMax, isTimerRunning, discipline,
    zeroNightSubPhase, zeroNightMusicState, votingFarewellQueue, votingFarewellIndex,
  ]);

  const handleRestoreSession = () => {
    if (!restorableSession) return;
    const restored = normalizeLiveSnapshotForRestore(restorableSession as LiveSnapshot);
    const recoverySnapshot = restored.phase === 'zero_night' && restored.zeroNightMusicState === 'playing'
      ? { ...restored, zeroNightMusicState: 'pending' as const }
      : restored;
    if (restored.phase === 'zero_night') requestJudgeGameMusicStop();
    restoreSnapshot(recoverySnapshot);
    setNightLogs(restorableSession.nightLogs || []);
    setShotPlayerSlot(restorableSession.shotPlayerSlot ?? null);
    setDonCheckSlot(restorableSession.donCheckSlot ?? null);
    setDonCheckResult(restorableSession.donCheckResult ?? null);
    setSheriffCheckSlot(restorableSession.sheriffCheckSlot ?? null);
    setSheriffCheckResult(restorableSession.sheriffCheckResult ?? null);
    setRestorableSession(null);
    showToast("Прерванная игра восстановлена", "success");
  };

  const handleDiscardSavedSession = () => {
    localStorage.removeItem("mafia_live_session");
    setRestorableSession(null);
  };

  const syncDisciplinePlayer = (state: GameDiscipline, slot: number) => {
    const d = state.players[String(slot)];
    if (!d) return;
    setActivePlayers((previous) => previous.map((p) => {
      if (p.slot_num !== slot) return p;
      const removalLabel = d.removedReason === '4th_foul'
        ? `Удалён: 4-й фол (Д${roundNumber})`
        : d.removedReason === '2nd_tech'
          ? `Удалён: 2-й техфол (Д${roundNumber})`
          : d.removedReason === 'direct'
            ? `Удалён судьёй (Д${roundNumber})`
            : p.eliminated_phase;
      return {
        ...p,
        fouls: d.regularFouls,
        minor_tech_fouls: d.minorTechFouls,
        major_tech_fouls: d.majorTechFouls,
        has_foul_penalty: d.has30SecPenalty,
        kick: d.isRemoved || p.kick,
        ppk: d.ppkCaused || p.ppk,
        removal_reason: d.removedReason,
        alive: d.isRemoved ? false : p.alive,
        exit_reason: d.isRemoved ? 'removed' : p.exit_reason,
        eliminated_phase: d.isRemoved ? removalLabel : p.eliminated_phase,
      };
    }));
  };

  const handleAdjustTime = (amount: number) => setTimeLeft((value) => Math.max(0, value + amount));

  const handleStartTimer = (slot: number, duration = 60) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive) return;
    if (player.mute_this_round) {
      markPlayerSpoken(slot);
      return showToast(`Игрок #${slot} пропускает речь`, "warning");
    }

    saveSnapshot();
    const consumed = consumeNextSpeech(discipline, String(slot));
    const actual = consumed.duration ?? duration;
    if (consumed.newState !== discipline) {
      setDiscipline(consumed.newState);
      syncDisciplinePlayer(consumed.newState, slot);
    }

    setActiveSpeakerSlot(slot);
    setCustomTimerLabel(null);
    setTimerMax(actual);
    setTimeLeft(actual);
    setIsTimerRunning(true);
  };

  const handleStartZeroNightTimer = (sub: "agreement" | "sheriff" | "seating") => {
    saveSnapshot();
    const durations = { agreement: 75, sheriff: 10, seating: 40 };
    const labels = { agreement: "Договорка мафии", sheriff: "Вызов шерифа", seating: "Свободная посадка" };
    setZeroNightSubPhase(sub);
    setCustomTimerLabel(labels[sub]);
    setActiveSpeakerSlot(null);
    setTimerMax(durations[sub]);
    setTimeLeft(durations[sub]);
    setIsTimerRunning(true);
  };

  const nextSpeaker = getNextDaySpeaker(activePlayers, roundNumber);

  const markPlayerSpoken = (slot: number) => {
    saveSnapshot();
    setActivePlayers((previous) => markDaySpeakerSpoken(previous, slot));
    setActiveSpeakerSlot(null);
    setIsTimerRunning(false);
  };

  const handleStartNextSpeaker = () => { if (nextSpeaker) handleStartTimer(nextSpeaker.slot_num, 60); };

  const handleAutoFillSetupPlayers = () => {
    setActivePlayers((previous) => autoFillSetupPlayers(previous, players));
  };

  const handleAutoFillSetupRoles = () => {
    setActivePlayers((previous) => shuffleSetupRoles(previous));
  };

  const handleSelectSetupPlayer = (slot: number, userId: number) => {
    setActivePlayers((previous) => selectSetupPlayer(previous, players, slot, userId));
  };

  const handleSelectSetupRole = (slot: number, role: ActivePlayerState['role']) => {
    setActivePlayers((previous) => selectSetupRole(previous, slot, role));
  };

  const validateSetupAndStart = () => {
    const validationError = getSetupStartValidationError(judgeId, activePlayers);
    if (validationError) return showToast(validationError, "error");
    saveSnapshot();
    setDiscipline(createInitialGameDiscipline(activePlayers.map((p) => ({
      id: String(p.slot_num),
      team: p.team === 'Чёрные' ? 'black' : 'red',
    }))));
    localStorage.removeItem("mafia_live_session");
    setZeroNightMusicState('pending');
    setPhase('zero_night');
  };

  const handleNominateCandidate = (slot: number) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive || phase !== 'day_speeches') return;
    saveSnapshot();
    if (nominations.includes(slot)) {
      setNominations((previous) => previous.filter((value) => value !== slot));
      setNominationsMap((previous) => { const next = { ...previous }; delete next[slot]; return next; });
      return;
    }
    const nominator = activeSpeakerSlot || 0;
    if (nominator <= 0) return showToast("Выставление возможно только во время речи игрока", "warning");
    if (Object.values(nominationsMap).includes(nominator)) {
      return showToast(`Игрок #${nominator} уже выставлял кандидата в эту речь`, "warning");
    }
    setNominations((previous) => [...previous, slot]);
    setNominationsMap((previous) => ({ ...previous, [slot]: nominator }));
    showToast(`#${slot} выставлен ${nominations.length + 1}-м на речи #${nominator}`, "success");
  };

  const removeRegularFoul = (slot: number) => {
    const id = String(slot);
    const current = discipline.players[id];
    if (!current || current.regularFouls <= 0 || current.isRemoved) return;
    saveSnapshot();
    const regularFouls = current.regularFouls - 1;
    const next: GameDiscipline = {
      ...discipline,
      players: {
        ...discipline.players,
        [id]: { ...current, regularFouls, has30SecPenalty: regularFouls === 3 ? current.has30SecPenalty : false },
      },
    };
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
    showToast(`С игрока #${slot} снят фол`, "info");
  };

  const requestDisciplineConfirmation = (slot: number, action: PendingActionType) => {
    setActionPlayerSlot(null);
    setPendingDisciplineConfirmation({ slot, action });
  };

  const addRegularFoulFromMenu = (slot: number) => {
    const id = String(slot);
    const next = addRegularFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'removal_4th_foul') {
      requestDisciplineConfirmation(slot, pending);
      return;
    }
    if (next === discipline) return;
    saveSnapshot();
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const addTechFoulFromMenu = (slot: number, kind: 'minor' | 'major') => {
    const id = String(slot);
    const next = kind === 'minor' ? addMinorTechFoul(discipline, id) : addMajorTechFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'minor_tech_causing_removal' || pending === 'major_tech_causing_removal') {
      requestDisciplineConfirmation(slot, pending);
      return;
    }
    if (next === discipline) return;
    saveSnapshot();
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const directRemoveFromMenu = (slot: number) => {
    requestDisciplineConfirmation(slot, 'direct_removal');
  };

  const confirmPendingDisciplineAction = () => {
    const pending = pendingDisciplineConfirmation;
    if (!pending) return;
    const id = String(pending.slot);
    let next = discipline;

    if (pending.action === 'removal_4th_foul') next = addRegularFoul(next, id);
    else if (pending.action === 'minor_tech_causing_removal') next = addMinorTechFoul(next, id);
    else if (pending.action === 'major_tech_causing_removal') next = addMajorTechFoul(next, id);
    else if (pending.action === 'direct_removal') next = requestDirectRemoval(next, id);
    else if (pending.action === 'ppk') next = requestPpk(next, id);

    if (next.players[id]?.pendingAction !== pending.action) {
      setPendingDisciplineConfirmation(null);
      showToast('Действие уже недоступно — состояние игрока изменилось', 'warning');
      return;
    }

    saveSnapshot();
    next = confirmAction(next, id);
    const removalApplied = pending.action !== 'ppk' && Boolean(next.players[id]?.isRemoved);
    const currentVotingIsCancelled = removalApplied && phase === 'day_voting';
    const committedDiscipline = currentVotingIsCancelled ? resetNextVotingCancelled(next) : next;
    setDiscipline(committedDiscipline);
    syncDisciplinePlayer(committedDiscipline, pending.slot);
    setPendingDisciplineConfirmation(null);

    if (pending.action === 'ppk') {
      const winner = next.ppkWinnerTeam === 'red' ? 'Красные' : 'Чёрные';
      handleEndGameWithWinner(winner, 'ppk', pending.slot);
      return;
    }

    if (currentVotingIsCancelled) {
      setNightLogs((previous) => [...previous, {
        round: roundNumber,
        log: `Д${roundNumber}: текущее голосование отменено из-за удаления игрока #${pending.slot}.`,
      }]);
      showToast(`Голосование отменено: игрок #${pending.slot} удалён`, 'warning');
      startNightPhase();
    }
  };

  const handleFoulChange = (slot: number, direction: "up" | "down") => {
    if (direction === 'up') addRegularFoulFromMenu(slot);
    else removeRegularFoul(slot);
  };

  const eliminatePlayer = (slot: number, reason: string, exitReason: NonNullable<ActivePlayerState['exit_reason']>) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive) return;
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot
      ? { ...p, alive: false, eliminated_phase: reason, exit_reason: exitReason }
      : p));
  };

  const restorePlayer = (slot: number) => {
    saveSnapshot();
    const id = String(slot);
    const next = restoreRemovedPlayer(discipline, id);
    const restored = next.players[id];
    if (next !== discipline) setDiscipline(next);
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot
      ? {
          ...p,
          alive: true,
          kick: false,
          removal_reason: null,
          eliminated_phase: '',
          exit_reason: 'alive',
          is_pu: false,
          best_move_guesses: [],
          fouls: restored?.regularFouls ?? p.fouls,
          minor_tech_fouls: restored?.minorTechFouls ?? p.minor_tech_fouls,
          major_tech_fouls: restored?.majorTechFouls ?? p.major_tech_fouls,
          has_foul_penalty: restored?.has30SecPenalty ?? false,
        }
      : p));
    setProtocolMarkers((previous) => clearBestMove(previous, slot));
    if (activeBestMoveSlot === slot) {
      setActiveBestMoveSource(null);
      setActiveBestMoveSlot(null);
      setPendingBestMoveSeats([]);
    }
    setActionPlayerSlot(null);
  };

  const updateCurrentRoundVotes = (assignments: Record<number, number>) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const eligibleSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    const explicitCounts = getExplicitVoteCounts(current.nominated_seats, assignments, eligibleSeats);
    setVotes(explicitCounts);
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex
      ? { ...round, vote_counts: explicitCounts }
      : round));
  };

  const handleFinalizeVote = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const lastNominee = current.nominated_seats[current.nominated_seats.length - 1];
    if (!lastNominee) return;
    saveSnapshot();
    const eligibleSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    setVotesByPlayer((previous) => {
      const next = { ...previous };
      eligibleSeats.forEach((slot) => {
        if (next[slot] === undefined) next[slot] = lastNominee;
      });
      const explicitCounts = getExplicitVoteCounts(current.nominated_seats, next, eligibleSeats);
      const finalCounts = calculateVoteRemainder(
        current.nominated_seats,
        current.eligible_voters ?? eligibleSeats.length,
        explicitCounts,
      );
      setVotes(finalCounts);
      setVotingRounds((rounds) => rounds.map((round, index) => index === activeVotingRoundIndex
        ? { ...round, vote_counts: finalCounts }
        : round));
      return next;
    });
  };

  const selectVotingNomineeIndex = (index: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    setCurrentVotingNomineeIndex(Math.max(0, Math.min(index, current.nominated_seats.length - 1)));
  };

  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    const voter = activePlayers.find((p) => p.slot_num === voterSlot);
    if (!current || !voter?.alive) return;
    const nominee = current.nominated_seats[currentVotingNomineeIndex];
    if (!nominee) return;
    saveSnapshot();
    setVotesByPlayer((previous) => {
      const next = { ...previous };
      if (next[voterSlot] === nominee) delete next[voterSlot];
      else next[voterSlot] = nominee;
      updateCurrentRoundVotes(next);
      return next;
    });
  };

  const handleAllocateVotes = (nominee: number, desiredCount: number) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !current.nominated_seats.includes(nominee)) return;
    const eligible = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    saveSnapshot();
    setVotesByPlayer((previous) => {
      const next = { ...previous };
      const assigned = eligible.filter((slot) => next[slot] === nominee);
      const desired = Math.max(0, Math.min(desiredCount, eligible.length));
      if (desired < assigned.length) assigned.slice(desired).forEach((slot) => delete next[slot]);
      else if (desired > assigned.length) {
        const free = eligible.filter((slot) => next[slot] === undefined);
        free.slice(0, desired - assigned.length).forEach((slot) => { next[slot] = nominee; });
      }
      updateCurrentRoundVotes(next);
      return next;
    });
  };

  const handleTransitionToVoting = () => {
    saveSnapshot();
    if (discipline.isNextVotingCancelled) {
      setDiscipline(resetNextVotingCancelled(discipline));
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: голосование отменено из-за удаления игрока.` }]);
      showToast("Ближайшее голосование отменено из-за удаления", "warning");
      startNightPhase();
      return;
    }
    if (nominations.length === 0) return startNightPhase();
    if (roundNumber === 1 && nominations.length === 1) {
      const onlyNominee = nominations[0];
      setNightLogs((previous) => [...previous, {
        round: roundNumber,
        log: `Д1: в нулевом круге выставлена только одна кандидатура #${onlyNominee}; голосование не проводится, наступает ночь.`,
      }]);
      showToast(`Нулевой круг: одна кандидатура #${onlyNominee} — сразу ночь`, "info");
      startNightPhase();
      return;
    }
    const eligibleSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    const eligible = eligibleSeats.length;
    const explicit = getExplicitVoteCounts(nominations, {}, eligibleSeats);
    const initialRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [...nominations],
      vote_counts: explicit,
      day_number: liveRoundToTournamentDay(roundNumber),
      eligible_voters: eligible,
      parent_round_number: null,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };
    setVotingRounds([initialRound]);
    setActiveVotingRoundIndex(0);
    setVotes(explicit);
    setVotesByPlayer({});
    setCurrentVotingNomineeIndex(0);
    setVotingStage('collecting');
    setTableLeaveVotesInput(null);
    setPhase('day_voting');
  };

  const handleResolveVoting = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const result = determineVotingResult(current);
    if (result.outcome === 'pending') return showToast(result.description, 'warning');
    saveSnapshot();
    setVotingStage('round_result');
  };

  const openBestMoveProtocol = (source: BestMoveSource, slot: number, initialSeats: number[] = []) => {
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
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    saveSnapshot();
    const exitReason: NonNullable<ActivePlayerState['exit_reason']> = current.day_number === 0 ? 'voted_zero_round' : 'voted_day';
    eliminatePlayer(slot, `Голосование (День ${roundNumber})`, exitReason);
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex
      ? { ...round, outcome: 'single_eliminated', eliminated_seats: [slot] }
      : round));

    const farewellQueue = buildVotingFarewellQueue([slot], current.nominated_seats);
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
  };

  const handleGoToRevoteSpeeches = (winners: number[]) => {
    if (!winners.length) return;
    saveSnapshot();
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex ? { ...round, outcome: 'tie_revote' } : round));
    setVotingStage('revote_speeches');
    setRevoteSpeakerIndex(0);
    handleStartTimer(winners[0], 30);
  };

  const handleLaunchNextRevote = (winners: number[]) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current || !winners.length) return;
    saveSnapshot();
    const child = createNextRevoteRound({ ...current, outcome: 'tie_revote' }, winners);
    child.round_number = votingRounds.length + 1;
    const eligibleSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    child.vote_counts = getExplicitVoteCounts(child.nominated_seats, {}, eligibleSeats);
    setVotingRounds((previous) => [...previous, child]);
    setActiveVotingRoundIndex(votingRounds.length);
    setVotes(child.vote_counts);
    setVotesByPlayer({});
    setCurrentVotingNomineeIndex(0);
    setRevoteSpeakerIndex(0);
    setTableLeaveVotesInput(null);
    setVotingStage('collecting');
    setActiveSpeakerSlot(null);
    setIsTimerRunning(false);
  };

  const handleConfirmAutoNoElimination = () => {
    saveSnapshot();
    setVotingStage('resolved');
    setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: повторная ничья более половины стола — никто не покидает стол.` }]);
    startNightPhase();
  };

  const handleConfirmTableDecision = (tableVotes: number, winners: number[]) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const eligible = current.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
    const votesCount = Math.max(0, Math.min(eligible, tableVotes));
    const updated: VotingRound = { ...current, table_leave_votes: votesCount };
    const result = determineVotingResult(updated);
    if (result.outcome !== 'requires_table_decision' || !result.resolvedOutcome) return showToast('Не удалось определить решение стола', 'error');
    saveSnapshot();
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex ? {
      ...updated,
      outcome: result.resolvedOutcome,
      eliminated_seats: [...result.eliminatedSeats],
    } : round));

    if (result.resolvedOutcome === 'all_tied_eliminated') {
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
  };

  const startNightPhase = () => {
    setNominations([]);
    setNominationsMap({});
    setVotingRounds([]);
    setVotes({});
    setVotesByPlayer({});
    setVotingStage('setup');
    setCurrentVotingNomineeIndex(0);
    setActiveSpeakerSlot(null);
    setActionPlayerSlot(null);
    setIsTimerRunning(false);
    setActivePlayers((previous) => previous.map((p) => ({ ...p, nominated_this_round: false, has_spoken_this_round: false, mute_this_round: false })));
    setPhase('night');
    setNightSubPhase('intro');
    setPostNightStage('none');
    setShotPlayerSlot(null);
    setDonCheckSlot(null);
    setDonCheckResult(null);
    setSheriffCheckSlot(null);
    setSheriffCheckResult(null);
    setCustomTimerLabel('Запуск ночи');
    setTimerMax(15);
    setTimeLeft(15);
  };

  const getNightTarget = () => findNightTarget(activePlayers, shotPlayerSlot);

  const targetCanGiveFirstKilledBestMove = () => canNightTargetGiveFirstKilledBestMove(
    getNightTarget(),
    protocolMarkers.firstKilledSlot,
    roundNumber,
  );

  const handleStartFirstKilledBestMove = () => {
    const target = getNightTarget();
    if (!target || !targetCanGiveFirstKilledBestMove()) {
      setNightSubPhase('morning');
      setCustomTimerLabel(null);
      setIsTimerRunning(false);
      return;
    }

    let nextMarkers = protocolMarkers;
    if (nextMarkers.firstKilledSlot === null) {
      nextMarkers = registerFirstKilled(nextMarkers, target.slot_num);
      setProtocolMarkers(nextMarkers);
    }

    setActivePlayers((previous) => previous.map((p) => p.slot_num === target.slot_num ? { ...p, is_pu: true } : p));
    setNightSubPhase('best_move');
    setCustomTimerLabel(null);
    setIsTimerRunning(false);
    const savedSeats = nextMarkers.bestMoveSource === 'first_killed' && nextMarkers.bestMoveSourceSlot === target.slot_num
      ? nextMarkers.bestMoveSeats
      : [];
    openBestMoveProtocol('first_killed', target.slot_num, savedSeats);
  };

  const handleAdvanceNightSubPhase = (sub: NightSubPhase) => {
    saveSnapshot();
    setNightSubPhase(sub);
    const labels: Partial<Record<NightSubPhase, string>> = {
      intro: 'Запуск ночи', shooting: 'Стрельба мафии', don: 'Проверка Дона', sheriff: 'Проверка Шерифа', morning: 'Итоги ночи',
    };
    if (sub === 'morning' || sub === 'best_move') {
      setCustomTimerLabel(null);
      setIsTimerRunning(false);
      return;
    }
    setCustomTimerLabel(labels[sub] || null);
    setTimerMax(15);
    setTimeLeft(15);
    setIsTimerRunning(true);
  };

  const finishNightToDay = () => {
    saveSnapshot();
    setRoundNumber((value) => value + 1);
    setPhase('day_speeches');
    setNightSubPhase('intro');
    setPostNightStage('none');
    setCustomTimerLabel(null);
    setActiveSpeakerSlot(null);
    setActionPlayerSlot(null);
    setIsTimerRunning(false);
    setShotPlayerSlot(null);
    setDonCheckSlot(null);
    setDonCheckResult(null);
    setSheriffCheckSlot(null);
    setSheriffCheckResult(null);
  };

  const startFarewellSpeech = (slot: number) => {
    setPostNightStage('farewell');
    setActiveSpeakerSlot(slot);
    setCustomTimerLabel(`Прощальная речь #${slot}`);
    setTimerMax(60);
    setTimeLeft(60);
    setIsTimerRunning(true);
  };

  const startDeathProtocol = () => {
    if (shotPlayerSlot === null) return finishNightToDay();
    saveSnapshot();
    setPostNightStage('death_protocol');
    setActiveSpeakerSlot(shotPlayerSlot);
    setCustomTimerLabel(`Протокол убитого #${shotPlayerSlot}`);
    setTimerMax(15);
    setTimeLeft(15);
    setIsTimerRunning(true);
  };

  const handleResolveNight = () => {
    saveSnapshot();
    const logs: string[] = [];
    let killedSlot: number | null = null;

    if (shotPlayerSlot) {
      const target = getNightTarget();
      if (target?.alive) {
        killedSlot = shotPlayerSlot;
        eliminatePlayer(shotPlayerSlot, `Убит ночью (Ночь ${roundNumber})`, 'killed');
        logs.push(`Н${roundNumber}: выстрел в #${shotPlayerSlot} — убит.`);
        if (protocolMarkers.firstKilledSlot === null && canRegisterFirstKilled(roundNumber, target.role, true)) {
          const nextMarkers = registerFirstKilled(protocolMarkers, shotPlayerSlot);
          setProtocolMarkers(nextMarkers);
          setActivePlayers((previous) => previous.map((p) => p.slot_num === shotPlayerSlot ? { ...p, is_pu: true } : p));
        }
      } else logs.push(`Н${roundNumber}: выстрел в #${shotPlayerSlot} — промах.`);
    } else logs.push(`Н${roundNumber}: промах мафии.`);

    if (donCheckSlot) logs.push(`Дон: #${donCheckSlot} — ${donCheckResult ? 'Шериф' : 'не Шериф'}.`);
    if (sheriffCheckSlot) logs.push(`Шериф: #${sheriffCheckSlot} — ${sheriffCheckResult || '—'}.`);
    setNightLogs((previous) => [...previous, { round: roundNumber, log: logs.join(' ') }]);

    if (killedSlot !== null) {
      startFarewellSpeech(killedSlot);
      return;
    }
    finishNightToDay();
  };

  const isFarewellSpeechActive = () => activeSpeakerSlot !== null && (
    (phase === 'night' && postNightStage === 'farewell') ||
    (phase === 'day_voting' && votingFarewellQueue.length > 0)
  );

  const handleSeatClick = (slot: number) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player) return;
    if (isFarewellSpeechActive()) {
      if (slot === activeSpeakerSlot) setActionPlayerSlot(slot);
      return;
    }
    if (phase === 'night') {
      if (postNightStage !== 'none' || !player.alive) return;
      saveSnapshot();
      if (nightSubPhase === 'shooting') setShotPlayerSlot((value) => toggleNightShotTarget(value, slot));
      else if (nightSubPhase === 'don') { setDonCheckSlot(slot); setDonCheckResult(getDonCheckResult(player)); }
      else if (nightSubPhase === 'sheriff') { setSheriffCheckSlot(slot); setSheriffCheckResult(getSheriffCheckResult(player)); }
      return;
    }
    if (phase === 'day_voting' && votingStage === 'collecting') {
      handleInteractiveVoteToggle(slot);
      return;
    }
    if (phase === 'day_speeches') {
      setActionPlayerSlot(slot);
    }
  };

  const getNextStepInfo = () => {
    if (phase === 'setup') return { label: 'Запустить игру', onClick: validateSetupAndStart };
    if (phase === 'zero_night') {
      if (!zeroNightSubPhase) return { label: 'Договорка · 75с', onClick: () => handleStartZeroNightTimer('agreement') };
      if (zeroNightSubPhase === 'agreement') return { label: 'Вызов шерифа · 10с', onClick: () => handleStartZeroNightTimer('sheriff') };
      if (zeroNightSubPhase === 'sheriff') return { label: 'Посадка · 40с', onClick: () => handleStartZeroNightTimer('seating') };
      return { label: 'Разбудить город', onClick: () => { setZeroNightMusicState('pending'); setPhase('day_speeches'); setCustomTimerLabel(null); setIsTimerRunning(false); } };
    }
    if (phase === 'day_speeches') {
      if (activeSpeakerSlot) return { label: `Завершить речь #${activeSpeakerSlot}`, onClick: () => markPlayerSpoken(activeSpeakerSlot) };
      if (nextSpeaker) return { label: `Речь #${nextSpeaker.slot_num}`, onClick: handleStartNextSpeaker };
      return { label: 'К голосованию', onClick: handleTransitionToVoting };
    }
    if (phase === 'day_voting') {
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
    if (phase === 'night') {
      if (postNightStage === 'farewell') return { label: 'Протокол убитого · 15с', onClick: startDeathProtocol };
      if (postNightStage === 'death_protocol') {
        const winnerAfterNight = determineLiveWinner(activePlayers);
        if (winnerAfterNight) {
          return { label: 'Завершить игру', onClick: () => handleEndGameWithWinner(winnerAfterNight) };
        }
        return { label: 'К дневным речам', onClick: finishNightToDay };
      }
      if (nightSubPhase === 'intro') return { label: 'Стрельба мафии', onClick: () => handleAdvanceNightSubPhase('shooting') };
      if (nightSubPhase === 'shooting') return { label: 'Проверка Дона', onClick: () => handleAdvanceNightSubPhase('don') };
      if (nightSubPhase === 'don') return { label: 'Проверка Шерифа', onClick: () => handleAdvanceNightSubPhase('sheriff') };
      if (nightSubPhase === 'sheriff') {
        if (targetCanGiveFirstKilledBestMove()) return { label: 'ЛХ первого убитого', onClick: handleStartFirstKilledBestMove };
        return { label: 'Итоги ночи', onClick: () => handleAdvanceNightSubPhase('morning') };
      }
      if (nightSubPhase === 'best_move') return null;
      if (nightSubPhase === 'morning') return { label: 'Зафиксировать ночь', onClick: handleResolveNight };
    }
    return null;
  };

  const getPrevStepAction = () => {
    if (!historyStack.length) return null;
    return { label: 'Назад', onClick: handleUndoAction };
  };

  const getSeatColor = (slot: number) => {
    const colors: Record<number, string> = {
      1: 'bg-blue-600 text-white border-blue-500', 2: 'bg-amber-600 text-white border-amber-500',
      3: 'bg-yellow-500 text-slate-950 border-yellow-400', 4: 'bg-rose-600 text-white border-rose-500',
      5: 'bg-teal-600 text-white border-teal-500', 6: 'bg-cyan-600 text-white border-cyan-500',
      7: 'bg-pink-600 text-white border-pink-500', 8: 'bg-purple-600 text-white border-purple-500',
      9: 'bg-amber-800 text-white border-amber-700', 10: 'bg-lime-600 text-slate-950 border-lime-500',
    };
    return colors[slot] || 'bg-slate-700 text-white border-slate-600';
  };

  const winTeam = determineLiveWinner(activePlayers);

  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные", endReason: 'normal' | 'ppk' = 'normal', ppkSlot: number | null = null) => {
    if (gameFinishedRef.current) return;
    gameFinishedRef.current = true;
    const slots: GameSlot[] = activePlayers.map((p) => ({
      slot_num: p.slot_num,
      user_id: p.user_id,
      nickname: p.nickname,
      role: p.role,
      team: p.team,
      bonus_points: p.bonus_points,
      lh_points: p.lh_points,
      will_protocol_points: p.will_protocol_points,
      will_opinion_points: p.will_opinion_points,
      dc_points: p.dc_points,
      kick: p.kick,
      ppk: p.ppk || p.slot_num === ppkSlot,
      fouls: p.fouls,
      pu: p.is_pu,
      alive: p.alive,
      status_reason: p.alive ? 'Жив' : p.eliminated_phase || 'Покинул стол',
      base_points: 0,
      elo_change: 0,
      exit_reason: p.exit_reason,
      minor_tech_fouls: p.minor_tech_fouls || 0,
      major_tech_fouls: p.major_tech_fouls || 0,
      removal_reason: p.removal_reason || null,
    } as any));
    localStorage.removeItem("mafia_live_session");
    onGameFinished({
      winning_team: winner,
      protocol_text: `Спортивная игра ФСМ. Победили ${winner}.${protocolNotes.trim() ? ` Примечания: ${protocolNotes.trim()}` : ''}`,
      slots,
      judge_id: judgeId,
      protocol_markers: protocolMarkers,
      end_reason: endReason,
    } as any);
  };

  useEffect(() => {
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
    requestDisciplineConfirmation(slot, 'ppk');
  };

  const handleEditPlayerNote = (player: ActivePlayerState) => {
    const note = window.prompt(`Заметка ведущего для #${player.slot_num}:`, player.note || '');
    if (note !== null) setActivePlayers((previous) => previous.map((item) => item.slot_num === player.slot_num ? { ...item, note: note.trim() } : item));
    setActionPlayerSlot(null);
  };

  const handleToggleBestMoveSeat = (slot: number) => {
    setPendingBestMoveSeats((previous) => previous.includes(slot)
      ? previous.filter((value) => value !== slot)
      : previous.length < 3 ? [...previous, slot] : previous);
  };

  const handleConfirmBestMoveProtocol = () => {
    if (!activeBestMoveSource || activeBestMoveSlot === null) return;
    saveSnapshot();
    const source = activeBestMoveSource;
    const slot = activeBestMoveSlot;
    const next = setBestMove(protocolMarkers, source, pendingBestMoveSeats);
    setProtocolMarkers(next);
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, best_move_guesses: [...pendingBestMoveSeats] } : p));
    setActiveBestMoveSource(null);
    setActiveBestMoveSlot(null);
    setPendingBestMoveSeats([]);
    if (source === 'zero_round_voted' && votingFarewellQueue.length > 0) {
      beginVotingFarewell(votingFarewellQueue, 0);
    } else if (phase === 'night' && nightSubPhase === 'best_move' && source === 'first_killed') {
      setNightSubPhase('morning');
      setCustomTimerLabel(null);
      setIsTimerRunning(false);
    }
  };

  const legacyBestMoveGuesses: number[] = [];
  const deprecatedNoop = () => {};

  const renderTable = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4 max-w-7xl mx-auto w-full px-1 py-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((slot) => (
        <SeatCard
          key={slot}
          slotNum={slot}
          activePlayers={activePlayers}
          setActivePlayers={setActivePlayers}
          activeSpeakerSlot={activeSpeakerSlot}
          setActiveSpeakerSlot={setActiveSpeakerSlot}
          nominations={currentVotingNominees()}
          phase={phase}
          postNightStage={postNightStage}
          shotPlayerSlot={shotPlayerSlot}
          donCheckSlot={donCheckSlot}
          sheriffCheckSlot={sheriffCheckSlot}
          bestMoveGuesses={legacyBestMoveGuesses}
          hideBestMoveGlow={false}
          nominationsMap={nominationsMap}
          setNominationsMap={setNominationsMap}
          showToast={(message, type) => showToast(message, type || 'info')}
          playBeep={playBeep}
          votes={votes}
          handleAllocateVotes={handleAllocateVotes}
          showRolesOnTable={rolesAreVisible}
          shootoutNominees={[]}
          isTimerRunning={isTimerRunning}
          setIsTimerRunning={setIsTimerRunning}
          timeLeft={timeLeft}
          handleStartTimer={handleStartTimer}
          handleNominateCandidate={handleNominateCandidate}
          handleSeatClick={handleSeatClick}
          handleFoulChange={handleFoulChange}
          onRequestDirectRemoval={directRemoveFromMenu}
          markPlayerSpoken={markPlayerSpoken}
          setBestMovePlayerSlot={deprecatedNoop}
          setBestMoveGuesses={deprecatedNoop}
          nightSubPhase={nightSubPhase}
          roundNumber={roundNumber}
          getSeatColor={getSeatColor}
          votesByPlayer={votesByPlayer}
          currentVotingNomineeIndex={currentVotingNomineeIndex}
          isInteractiveVoting={phase === 'day_voting' && votingStage === 'collecting'}
          votingSubPhase={votingStage}
          shootoutSubPhase="disabled"
          bothLeaveVotes={[]}
        />
      ))}
      <CenterPanel {...centerPanelProps()} />
    </div>
  );

  function currentVotingNominees() {
    return phase === 'day_voting' ? (votingRounds[activeVotingRoundIndex]?.nominated_seats || nominations) : nominations;
  }

  function centerPanelProps() {
    return {
      phase,
      roundNumber,
      nominations: currentVotingNominees(),
      activePlayers,
      nextSpeaker,
      activeSpeakerSlot,
      setActiveSpeakerSlot,
      timeLeft,
      setTimeLeft,
      zeroNightSubPhase,
      zeroNightMusicState,
      setZeroNightMusicState,
      customTimerLabel,
      isTimerRunning,
      setIsTimerRunning,
      timerMax,
      handleAdjustTime,
      handleStartZeroNightTimer,
      donCheckSlot,
      donCheckResult,
      sheriffCheckSlot,
      sheriffCheckResult,
      votes,
      votesByPlayer,
      currentVotingNomineeIndex,
      selectVotingNomineeIndex,
      handleInteractiveAutoRemainder: handleFinalizeVote,
      handleAllocateVotes,
      handleResolveVoting,
      nightSubPhase,
      shotPlayerSlot,
      getPrevStepAction,
      getNextStepInfo,
      onCancel,
      handleAdvanceNightSubPhase,
      handleResolveNight,
      isMuted,
      setIsMuted,
      votingRounds,
      activeVotingRoundIndex,
      votingStage,
      setVotingStage,
      revoteSpeakerIndex,
      setRevoteSpeakerIndex,
      tableLeaveVotesInput,
      setTableLeaveVotesInput,
      handleConfirmSingleElimination,
      handleGoToRevoteSpeeches,
      handleLaunchNextRevote,
      handleConfirmAutoNoElimination,
      handleConfirmTableDecision,
      handleStartNextSpeaker,
    };
  }

  const actionPlayer = actionPlayerSlot === null ? null : activePlayers.find((p) => p.slot_num === actionPlayerSlot) || null;
  const farewellActionOpen = isFarewellSpeechActive() && actionPlayerSlot === activeSpeakerSlot;
  const actionDiscipline = actionPlayerSlot === null ? null : discipline.players[String(actionPlayerSlot)] || null;
  const nominationBlockedBySpeaker = Boolean(
    actionPlayerSlot !== null &&
    activeSpeakerSlot &&
    !nominations.includes(actionPlayerSlot) &&
    Object.values(nominationsMap).includes(activeSpeakerSlot)
  );
  const pendingConfirmationPlayer = pendingDisciplineConfirmation === null
    ? null
    : activePlayers.find((player) => player.slot_num === pendingDisciplineConfirmation.slot) || null;
  const bestMovePlayerNickname = activeBestMoveSlot === null
    ? ''
    : activePlayers.find((player) => player.slot_num === activeBestMoveSlot)?.nickname || 'Игрок';
  const requiresTableSeatVoting = phase === 'day_voting' &&
    (votingStage === 'collecting' || votingStage === 'table_decision');
  const effectiveViewMode = requiresTableSeatVoting ? 'table' : viewMode;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-32 sm:pb-24 select-none">
      <DisciplineConfirmationOverlay
        pending={pendingDisciplineConfirmation}
        player={pendingConfirmationPlayer}
        onCancel={() => setPendingDisciplineConfirmation(null)}
        onConfirm={confirmPendingDisciplineAction}
      />
      <PlayerActionOverlay
        player={phase === 'day_speeches' || farewellActionOpen ? actionPlayer : null}
        mode={farewellActionOpen ? 'farewell' : 'standard'}
        disciplinePlayer={actionDiscipline}
        activeSpeakerSlot={activeSpeakerSlot}
        nominations={nominations}
        nominationBlockedBySpeaker={nominationBlockedBySpeaker}
        onClose={() => setActionPlayerSlot(null)}
        onAddRegularFoul={addRegularFoulFromMenu}
        onRemoveRegularFoul={removeRegularFoul}
        onAddTechFoul={addTechFoulFromMenu}
        onToggleNomination={handleNominateCandidate}
        onDirectRemove={directRemoveFromMenu}
        onPpk={handlePpkFromMenu}
        onEditNote={handleEditPlayerNote}
        onRestorePlayer={restorePlayer}
      />
      <BestMoveProtocolOverlay
        source={activeBestMoveSource}
        slot={activeBestMoveSlot}
        nickname={bestMovePlayerNickname}
        pendingSeats={pendingBestMoveSeats}
        onToggleSeat={handleToggleBestMoveSeat}
        onReset={() => setPendingBestMoveSeats([])}
        onConfirm={handleConfirmBestMoveProtocol}
      />
      <LiveGameToast toast={toast} />
      <RestorableSessionBanner
        visible={phase === 'setup' && Boolean(restorableSession)}
        savedAt={restorableSession?.savedAt}
        onRestore={handleRestoreSession}
        onDiscard={handleDiscardSavedSession}
      />

      {phase === 'setup' ? (
        <SetupPhase
          players={players}
          judgeId={judgeId}
          setJudgeId={setJudgeId}
          activePlayers={activePlayers}
          handleAutoFillSetupPlayers={handleAutoFillSetupPlayers}
          handleAutoFillSetupRoles={handleAutoFillSetupRoles}
          handleSelectSetupPlayer={handleSelectSetupPlayer}
          handleSelectSetupRole={handleSelectSetupRole}
          validateSetupAndStart={validateSetupAndStart}
          onCancel={onCancel}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2 items-center bg-slate-900/60 p-3 border border-slate-800 rounded-2xl">
            <span className="text-[10px] text-slate-300 font-black uppercase flex items-center gap-1.5"><Shield className="w-4 h-4 text-rose-500" />Панель судейства</span>
            <div className="flex gap-2">
              <button type="button" onClick={handleUndoAction} disabled={!historyStack.length} className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-bold disabled:opacity-30"><RotateCcw className="w-3 h-3 inline mr-1" />Отмена ({historyStack.length})</button>
              <button type="button" onClick={toggleRolesOnTable} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold">{rolesAreVisible ? <EyeOff className="w-3 h-3 inline mr-1" /> : <Eye className="w-3 h-3 inline mr-1" />}{rolesAreVisible ? 'Скрыть роли' : 'Показать роли'}</button>
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'table' ? 'list' : 'table')}
                disabled={requiresTableSeatVoting}
                title={requiresTableSeatVoting ? 'Во время голосования используется стол' : undefined}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {requiresTableSeatVoting ? 'Стол для голосования' : viewMode === 'table' ? 'Список' : 'Стол'}
              </button>
            </div>
          </div>

          {effectiveViewMode === 'table' ? renderTable() : (
            <div className="space-y-3">
              <CenterPanel {...centerPanelProps()} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activePlayers.map((p) => <div key={p.slot_num} className={`p-3 rounded-xl border ${p.alive ? 'bg-slate-900/50 border-slate-800' : 'bg-rose-950/20 border-rose-950 opacity-70'}`}><div className="flex justify-between items-center"><strong className="text-sm text-white">#{p.slot_num} {p.nickname}</strong><span className="text-[10px] text-slate-500">{p.alive ? 'Жив' : p.eliminated_phase}</span></div>{!p.alive && <button type="button" onClick={() => restorePlayer(p.slot_num)} className="mt-2 px-2 py-1 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 text-[9px] font-bold">Вернуть за стол</button>}</div>)}
              </div>
            </div>
          )}

          <EventsPanel
            phase={phase}
            nightLogs={nightLogs}
            protocolNotes={protocolNotes}
            setProtocolNotes={setProtocolNotes}
            activePlayers={activePlayers}
            winTeam={winTeam}
            handleEndGameWithWinner={handleEndGameWithWinner}
            onUndoLastLog={() => setNightLogs((previous) => previous.slice(0, -1))}
          />
        </div>
      )}
    </div>
  );
}
