import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RotateCcw, Shield } from "lucide-react";
import { Player, GameSlot } from "../types.js";
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
import SetupPhase from "./LiveGameEngine/SetupPhase.js";
import EventsPanel from "./LiveGameEngine/EventsPanel.js";
import SeatCard from "./LiveGameEngine/SeatCard.js";
import CenterPanel from "./LiveGameEngine/CenterPanel.js";
import { ActivePlayerState, NightSubPhase, Phase } from "./LiveGameEngine/types.js";
import {
  BestMoveSource,
  LiveProtocolMarkers,
  clearBestMove,
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  setBestMove,
} from "../lib/gameProtocolCore.js";

interface LiveGameEngineProps {
  players: Player[];
  initialJudgeId: number;
  onGameFinished: (gameData: {
    winning_team: "Красные" | "Чёрные";
    protocol_text: string;
    slots: GameSlot[];
    judge_id: number;
  }) => void;
  onCancel: () => void;
  onPhaseChange?: (phase: string) => void;
}

type VotingStage = 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';
type PostNightStage = 'none' | 'farewell' | 'death_protocol';

type LiveSnapshot = {
  activePlayers: ActivePlayerState[];
  nominations: number[];
  nominationsMap: Record<number, number>;
  phase: Phase;
  roundNumber: number;
  nightSubPhase: NightSubPhase;
  postNightStage: PostNightStage;
  protocolMarkers: LiveProtocolMarkers;
  activeBestMoveSource: BestMoveSource | null;
  activeBestMoveSlot: number | null;
  pendingBestMoveSeats: number[];
  votingRounds: VotingRound[];
  activeVotingRoundIndex: number;
  votesByPlayer: Record<number, number>;
  votes: Record<number, number>;
  votingStage: VotingStage;
  revoteSpeakerIndex: number;
  tableLeaveVotesInput: number | null;
  activeSpeakerSlot: number | null;
  customTimerLabel: string | null;
  timeLeft: number;
  timerMax: number;
  isTimerRunning: boolean;
};

const emptyPlayer = (slot: number): ActivePlayerState => ({
  slot_num: slot,
  user_id: 0,
  nickname: "",
  role: "Мирный",
  team: "Красные",
  fouls: 0,
  alive: true,
  nominated_this_round: false,
  has_spoken_this_round: false,
  mute_this_round: false,
  is_pu: false,
  best_move_guesses: [],
  kick: false,
  ppk: false,
  bonus_points: 0,
  lh_points: 0,
  will_protocol_points: 0,
  will_opinion_points: 0,
  dc_points: 0,
  eliminated_phase: "",
  has_foul_penalty: false,
  exit_reason: "alive",
});

export default function LiveGameEngine({ players, initialJudgeId, onGameFinished, onCancel, onPhaseChange }: LiveGameEngineProps) {
  const [judgeId, setJudgeId] = useState(initialJudgeId);
  const [phase, setPhase] = useState<Phase>("setup");
  const [roundNumber, setRoundNumber] = useState(1);
  const [nightSubPhase, setNightSubPhase] = useState<NightSubPhase>("intro");
  const [postNightStage, setPostNightStage] = useState<PostNightStage>('none');
  const [activePlayers, setActivePlayers] = useState<ActivePlayerState[]>(
    Array.from({ length: 10 }, (_, index) => emptyPlayer(index + 1))
  );

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const takeSnapshot = (): LiveSnapshot => ({
    activePlayers: JSON.parse(JSON.stringify(activePlayers)),
    nominations: [...nominations],
    nominationsMap: { ...nominationsMap },
    phase,
    roundNumber,
    nightSubPhase,
    postNightStage,
    protocolMarkers: JSON.parse(JSON.stringify(protocolMarkers)),
    activeBestMoveSource,
    activeBestMoveSlot,
    pendingBestMoveSeats: [...pendingBestMoveSeats],
    votingRounds: JSON.parse(JSON.stringify(votingRounds)),
    activeVotingRoundIndex,
    votesByPlayer: { ...votesByPlayer },
    votes: { ...votes },
    votingStage,
    revoteSpeakerIndex,
    tableLeaveVotesInput,
    activeSpeakerSlot,
    customTimerLabel,
    timeLeft,
    timerMax,
    isTimerRunning,
  });

  const saveSnapshot = () => setHistoryStack((previous) => [...previous.slice(-19), takeSnapshot()]);

  const restoreSnapshot = (snapshot: LiveSnapshot) => {
    setActivePlayers(snapshot.activePlayers);
    setNominations(snapshot.nominations);
    setNominationsMap(snapshot.nominationsMap || {});
    setPhase(snapshot.phase);
    setRoundNumber(snapshot.roundNumber);
    setNightSubPhase(snapshot.nightSubPhase);
    setPostNightStage(snapshot.postNightStage || 'none');
    setProtocolMarkers(snapshot.protocolMarkers || createEmptyLiveProtocolMarkers());
    setActiveBestMoveSource(snapshot.activeBestMoveSource || null);
    setActiveBestMoveSlot(snapshot.activeBestMoveSlot ?? null);
    setPendingBestMoveSeats(snapshot.pendingBestMoveSeats || []);
    setVotingRounds(snapshot.votingRounds || []);
    setActiveVotingRoundIndex(snapshot.activeVotingRoundIndex || 0);
    setVotesByPlayer(snapshot.votesByPlayer || {});
    setVotes(snapshot.votes || {});
    setVotingStage(snapshot.votingStage || 'setup');
    setRevoteSpeakerIndex(snapshot.revoteSpeakerIndex || 0);
    setTableLeaveVotesInput(snapshot.tableLeaveVotesInput ?? null);
    setActiveSpeakerSlot(snapshot.activeSpeakerSlot ?? null);
    setCustomTimerLabel(snapshot.customTimerLabel ?? null);
    setTimeLeft(snapshot.timeLeft ?? 60);
    setTimerMax(snapshot.timerMax ?? 60);
    setIsTimerRunning(Boolean(snapshot.isTimerRunning));
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
      if (parsed?.phase && parsed.phase !== 'setup' && parsed.activePlayers?.length === 10) {
        setRestorableSession(parsed);
      }
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
    votesByPlayer, votes, votingStage, revoteSpeakerIndex, tableLeaveVotesInput, nightLogs,
    shotPlayerSlot, donCheckSlot, donCheckResult, sheriffCheckSlot, sheriffCheckResult,
    activeSpeakerSlot, customTimerLabel, timeLeft, timerMax, isTimerRunning,
  ]);

  const handleRestoreSession = () => {
    if (!restorableSession) return;
    restoreSnapshot(restorableSession as LiveSnapshot);
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

  const handleAdjustTime = (amount: number) => setTimeLeft((value) => Math.max(0, value + amount));

  const handleStartTimer = (slot: number, duration = 60) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player?.alive) return;
    if (player.mute_this_round) {
      markPlayerSpoken(slot);
      return showToast(`Игрок #${slot} пропускает речь`, "warning");
    }
    const actual = player.has_foul_penalty || player.fouls === 3 ? 30 : duration;
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, has_foul_penalty: false } : p));
    setActiveSpeakerSlot(slot);
    setCustomTimerLabel(null);
    setTimerMax(actual);
    setTimeLeft(actual);
    setIsTimerRunning(true);
  };

  const handleStartZeroNightTimer = (sub: "agreement" | "sheriff" | "seating") => {
    const durations = { agreement: 75, sheriff: 10, seating: 40 };
    const labels = { agreement: "Договорка мафии", sheriff: "Вызов шерифа", seating: "Свободная посадка" };
    setZeroNightSubPhase(sub);
    setCustomTimerLabel(labels[sub]);
    setActiveSpeakerSlot(null);
    setTimerMax(durations[sub]);
    setTimeLeft(durations[sub]);
    setIsTimerRunning(true);
  };

  const getSpeakerQueue = () => {
    const start = ((roundNumber - 1) % 10) + 1;
    const ordered: ActivePlayerState[] = [];
    for (let offset = 0; offset < 10; offset++) {
      const slot = ((start - 1 + offset) % 10) + 1;
      const player = activePlayers.find((p) => p.slot_num === slot);
      if (player) ordered.push(player);
    }
    return ordered.filter((p) => p.alive && !p.has_spoken_this_round);
  };

  const nextSpeaker = getSpeakerQueue()[0] || null;

  const markPlayerSpoken = (slot: number) => {
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, has_spoken_this_round: true } : p));
    setActiveSpeakerSlot(null);
    setIsTimerRunning(false);
  };

  const handleStartNextSpeaker = () => { if (nextSpeaker) handleStartTimer(nextSpeaker.slot_num, 60); };

  const handleAutoFillSetupPlayers = () => {
    setActivePlayers((previous) => previous.map((slot, index) => players[index]
      ? { ...slot, user_id: players[index].user_id, nickname: players[index].nickname }
      : slot));
  };

  const handleAutoFillSetupRoles = () => {
    const roles: ActivePlayerState['role'][] = ["Мирный","Мирный","Мирный","Мирный","Мирный","Мирный","Шериф","Мафия","Мафия","Дон"];
    for (let index = roles.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [roles[index], roles[target]] = [roles[target], roles[index]];
    }
    setActivePlayers((previous) => previous.map((p, index) => {
      const role = roles[index];
      return { ...p, role, team: role === 'Мафия' || role === 'Дон' ? 'Чёрные' : 'Красные' };
    }));
  };

  const handleSelectSetupPlayer = (slot: number, userId: number) => {
    const source = players.find((p) => p.user_id === userId);
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, user_id: userId, nickname: source?.nickname || '' } : p));
  };

  const handleSelectSetupRole = (slot: number, role: ActivePlayerState['role']) => {
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot
      ? { ...p, role, team: role === 'Мафия' || role === 'Дон' ? 'Чёрные' : 'Красные' }
      : p));
  };

  const validateSetupAndStart = () => {
    if (!judgeId) return showToast("Выберите ведущего", "error");
    if (activePlayers.some((p) => !p.user_id)) return showToast("Заполните все 10 мест", "error");
    const assigned = activePlayers.map((p) => p.user_id);
    if (new Set(assigned).size !== 10) return showToast("Один игрок не может сидеть на двух местах", "error");
    const roleCounts = activePlayers.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.role]: (acc[p.role] || 0) + 1 }), {});
    if (roleCounts['Мирный'] !== 6 || roleCounts['Шериф'] !== 1 || roleCounts['Мафия'] !== 2 || roleCounts['Дон'] !== 1) {
      return showToast("Нужны роли ФСМ: 6 мирных, Шериф, 2 мафии и Дон", "error");
    }
    localStorage.removeItem("mafia_live_session");
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
    if (nominator > 0 && Object.values(nominationsMap).includes(nominator)) {
      return showToast(`Игрок #${nominator} уже выставлял кандидата в эту речь`, "warning");
    }
    setNominations((previous) => [...previous, slot]);
    setNominationsMap((previous) => ({ ...previous, [slot]: nominator }));
  };

  const handleFoulChange = (slot: number, direction: "up" | "down") => {
    saveSnapshot();
    setActivePlayers((previous) => previous.map((p) => {
      if (p.slot_num !== slot) return p;
      const fouls = Math.max(0, Math.min(4, p.fouls + (direction === 'up' ? 1 : -1)));
      if (fouls === 4) {
        return { ...p, fouls, alive: false, kick: true, is_pu: false, exit_reason: 'removed', eliminated_phase: `Фолы (День ${roundNumber})` };
      }
      return { ...p, fouls, has_foul_penalty: fouls === 3, alive: p.fouls === 4 && fouls < 4 ? true : p.alive, kick: false, exit_reason: p.fouls === 4 && fouls < 4 ? 'alive' : p.exit_reason, eliminated_phase: p.fouls === 4 && fouls < 4 ? '' : p.eliminated_phase };
    }));
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
    setActivePlayers((previous) => previous.map((p) => p.slot_num === slot
      ? { ...p, alive: true, eliminated_phase: '', exit_reason: 'alive', is_pu: false, best_move_guesses: [] }
      : p));
    setProtocolMarkers((previous) => clearBestMove(previous, slot));
    if (activeBestMoveSlot === slot) {
      setActiveBestMoveSource(null);
      setActiveBestMoveSlot(null);
      setPendingBestMoveSeats([]);
    }
  };

  const updateCurrentRoundVotes = (assignments: Record<number, number>) => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const eligibleSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    const explicit = getExplicitVoteCounts(current.nominated_seats, assignments, eligibleSeats);
    const finalCounts = calculateVoteRemainder(current.nominated_seats, current.eligible_voters ?? eligibleSeats.length, explicit);
    setVotes(finalCounts);
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex ? { ...round, vote_counts: finalCounts } : round));
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
    setVotesByPlayer((previous) => {
      const next = { ...previous };
      const assigned = eligible.filter((slot) => next[slot] === nominee);
      const desired = Math.max(0, Math.min(desiredCount, eligible.length));
      if (desired < assigned.length) {
        assigned.slice(desired).forEach((slot) => delete next[slot]);
      } else if (desired > assigned.length) {
        const free = eligible.filter((slot) => next[slot] === undefined);
        free.slice(0, desired - assigned.length).forEach((slot) => { next[slot] = nominee; });
      }
      updateCurrentRoundVotes(next);
      return next;
    });
  };

  const handleInteractiveAutoRemainder = () => {
    const current = votingRounds[activeVotingRoundIndex];
    if (!current) return;
    const last = current.nominated_seats[current.nominated_seats.length - 1];
    if (!last) return;
    const eligible = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    setVotesByPlayer((previous) => {
      const next = { ...previous };
      eligible.forEach((slot) => { if (next[slot] === undefined) next[slot] = last; });
      updateCurrentRoundVotes(next);
      return next;
    });
  };

  const handleTransitionToVoting = () => {
    if (nominations.length === 0) return startNightPhase();
    const eligible = activePlayers.filter((p) => p.alive).length;
    const explicit: Record<number, number> = Object.fromEntries(nominations.map((slot) => [slot, 0]));
    const initialRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [...nominations],
      vote_counts: calculateVoteRemainder(nominations, eligible, explicit),
      day_number: liveRoundToTournamentDay(roundNumber),
      eligible_voters: eligible,
      parent_round_number: null,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };
    setVotingRounds([initialRound]);
    setActiveVotingRoundIndex(0);
    setVotes(initialRound.vote_counts);
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
    setVotingStage('round_result');
  };

  const openBestMoveProtocol = (source: BestMoveSource, slot: number, initialSeats: number[] = []) => {
    setActiveBestMoveSource(source);
    setActiveBestMoveSlot(slot);
    setPendingBestMoveSeats([...initialSeats]);
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

    const zeroRoundSlot = getSingularZeroRoundElimination(current.day_number ?? -1, [slot]);
    if (zeroRoundSlot !== null && protocolMarkers.zeroRoundVotedSlot === null) {
      const next = registerZeroRoundVoted(protocolMarkers, zeroRoundSlot);
      setProtocolMarkers(next);
      openBestMoveProtocol('zero_round_voted', zeroRoundSlot);
    }

    setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: голосованием стол покинул игрок #${slot}.` }]);
    setVotingStage('resolved');
    startNightPhase();
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
    const child = createNextRevoteRound({ ...current, outcome: 'tie_revote' }, winners);
    child.round_number = votingRounds.length + 1;
    const eligible = current.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
    child.vote_counts = calculateVoteRemainder(child.nominated_seats, eligible, child.vote_counts);
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
    if (result.outcome !== 'requires_table_decision' || !result.resolvedOutcome) {
      return showToast('Не удалось определить решение стола', 'error');
    }
    saveSnapshot();
    setVotingRounds((previous) => previous.map((round, index) => index === activeVotingRoundIndex ? {
      ...updated,
      outcome: result.resolvedOutcome,
      eliminated_seats: [...result.eliminatedSeats],
    } : round));

    if (result.resolvedOutcome === 'all_tied_eliminated') {
      const exitReason: NonNullable<ActivePlayerState['exit_reason']> = current.day_number === 0 ? 'voted_zero_round' : 'voted_day';
      result.eliminatedSeats.forEach((slot) => eliminatePlayer(slot, `Решение стола (День ${roundNumber})`, exitReason));
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; спорные ${winners.map((s) => `#${s}`).join(', ')} покинули стол.` }]);
    } else {
      setNightLogs((previous) => [...previous, { round: roundNumber, log: `Д${roundNumber}: ${votesCount}/${eligible} за уход; большинство не набрано, все остаются.` }]);
    }
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

  const getNightTarget = () => shotPlayerSlot === null ? null : activePlayers.find((p) => p.slot_num === shotPlayerSlot) || null;

  const targetCanGiveFirstKilledBestMove = () => {
    const target = getNightTarget();
    if (!target) return false;
    if (protocolMarkers.firstKilledSlot !== null && protocolMarkers.firstKilledSlot !== target.slot_num) return false;
    return canRegisterFirstKilled(roundNumber, target.role, true);
  };

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
    setNightSubPhase(sub);
    const labels: Partial<Record<NightSubPhase, string>> = {
      intro: 'Запуск ночи',
      shooting: 'Стрельба мафии',
      don: 'Проверка Дона',
      sheriff: 'Проверка Шерифа',
      morning: 'Итоги ночи',
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
    setRoundNumber((value) => value + 1);
    setPhase('day_speeches');
    setNightSubPhase('intro');
    setPostNightStage('none');
    setCustomTimerLabel(null);
    setActiveSpeakerSlot(null);
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
    setPostNightStage('death_protocol');
    setActiveSpeakerSlot(shotPlayerSlot);
    setCustomTimerLabel(`Протокол убитого #${shotPlayerSlot}`);
    setTimerMax(15);
    setTimeLeft(15);
    setIsTimerRunning(true);
  };

  const backToFarewellSpeech = () => {
    if (shotPlayerSlot === null) return;
    setPostNightStage('farewell');
    setActiveSpeakerSlot(shotPlayerSlot);
    setCustomTimerLabel(`Прощальная речь #${shotPlayerSlot}`);
    setTimerMax(60);
    setTimeLeft(60);
    setIsTimerRunning(false);
  };

  const handleResolveNight = () => {
    saveSnapshot();
    const logs: string[] = [];
    let killedSlot: number | null = null;

    if (shotPlayerSlot) {
      const target = activePlayers.find((p) => p.slot_num === shotPlayerSlot);
      if (target?.alive) {
        killedSlot = shotPlayerSlot;
        eliminatePlayer(shotPlayerSlot, `Убит ночью (Ночь ${roundNumber})`, 'killed');
        logs.push(`Н${roundNumber}: выстрел в #${shotPlayerSlot} — убит.`);

        if (protocolMarkers.firstKilledSlot === null && canRegisterFirstKilled(roundNumber, target.role, true)) {
          const nextMarkers = registerFirstKilled(protocolMarkers, shotPlayerSlot);
          setProtocolMarkers(nextMarkers);
          setActivePlayers((previous) => previous.map((p) => p.slot_num === shotPlayerSlot ? { ...p, is_pu: true } : p));
        }
      } else {
        logs.push(`Н${roundNumber}: выстрел в #${shotPlayerSlot} — промах.`);
      }
    } else {
      logs.push(`Н${roundNumber}: промах мафии.`);
    }

    if (donCheckSlot) logs.push(`Дон: #${donCheckSlot} — ${donCheckResult ? 'Шериф' : 'не Шериф'}.`);
    if (sheriffCheckSlot) logs.push(`Шериф: #${sheriffCheckSlot} — ${sheriffCheckResult || '—'}.`);
    setNightLogs((previous) => [...previous, { round: roundNumber, log: logs.join(' ') }]);

    if (killedSlot !== null) {
      startFarewellSpeech(killedSlot);
      return;
    }

    finishNightToDay();
  };

  const handleSeatClick = (slot: number) => {
    const player = activePlayers.find((p) => p.slot_num === slot);
    if (!player) return;
    if (phase === 'night') {
      if (postNightStage !== 'none') return;
      if (!player.alive) return;
      if (nightSubPhase === 'shooting') setShotPlayerSlot((value) => value === slot ? null : slot);
      else if (nightSubPhase === 'don') { setDonCheckSlot(slot); setDonCheckResult(player.role === 'Шериф'); }
      else if (nightSubPhase === 'sheriff') { setSheriffCheckSlot(slot); setSheriffCheckResult(player.team === 'Чёрные' ? 'ЧЁРНЫЙ!' : 'Красный'); }
      return;
    }
    if (phase === 'day_voting' && votingStage === 'collecting') {
      handleInteractiveVoteToggle(slot);
      return;
    }
    if (phase === 'day_speeches' && player.alive) {
      if (activeSpeakerSlot === slot) markPlayerSpoken(slot);
      else handleStartTimer(slot, 60);
    }
  };

  const getNextStepInfo = () => {
    if (phase === 'setup') return { label: 'Запустить игру', onClick: validateSetupAndStart };
    if (phase === 'zero_night') {
      if (!zeroNightSubPhase) return { label: 'Договорка · 75с', onClick: () => handleStartZeroNightTimer('agreement') };
      if (zeroNightSubPhase === 'agreement') return { label: 'Вызов шерифа · 10с', onClick: () => handleStartZeroNightTimer('sheriff') };
      if (zeroNightSubPhase === 'sheriff') return { label: 'Посадка · 40с', onClick: () => handleStartZeroNightTimer('seating') };
      return { label: 'Разбудить город', onClick: () => { setPhase('day_speeches'); setCustomTimerLabel(null); setIsTimerRunning(false); } };
    }
    if (phase === 'day_speeches') {
      if (activeSpeakerSlot) return { label: `Завершить речь #${activeSpeakerSlot}`, onClick: () => markPlayerSpoken(activeSpeakerSlot) };
      if (nextSpeaker) return { label: `Речь #${nextSpeaker.slot_num}`, onClick: handleStartNextSpeaker };
      return { label: 'К голосованию', onClick: handleTransitionToVoting };
    }
    if (phase === 'day_voting') return null;
    if (phase === 'night') {
      if (postNightStage === 'farewell') return { label: 'Протокол убитого · 15с', onClick: startDeathProtocol };
      if (postNightStage === 'death_protocol') return { label: 'К дневным речам', onClick: finishNightToDay };
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

  const winTeam = (() => {
    const alive = activePlayers.filter((p) => p.alive);
    const red = alive.filter((p) => p.team === 'Красные').length;
    const black = alive.filter((p) => p.team === 'Чёрные').length;
    return black === 0 ? 'Красные' as const : black >= red ? 'Чёрные' as const : null;
  })();

  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные") => {
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
      ppk: p.ppk,
      fouls: p.fouls,
      pu: p.is_pu,
      alive: p.alive,
      status_reason: p.alive ? 'Жив' : p.eliminated_phase || 'Покинул стол',
      base_points: 0,
      elo_change: 0,
      exit_reason: p.exit_reason,
    } as any));
    localStorage.removeItem("mafia_live_session");
    onGameFinished({
      winning_team: winner,
      protocol_text: `Спортивная игра ФСМ. Победили ${winner}.${protocolNotes.trim() ? ` Примечания: ${protocolNotes.trim()}` : ''}`,
      slots,
      judge_id: judgeId,
      protocol_markers: protocolMarkers,
    } as any);
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
          showRolesOnTable={showRolesOnTable}
          shootoutNominees={[]}
          isTimerRunning={isTimerRunning}
          setIsTimerRunning={setIsTimerRunning}
          timeLeft={timeLeft}
          handleStartTimer={handleStartTimer}
          handleNominateCandidate={handleNominateCandidate}
          handleSeatClick={handleSeatClick}
          handleFoulChange={handleFoulChange}
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
      handleInteractiveAutoRemainder,
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

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-32 sm:pb-24 select-none">
      {activeBestMoveSource && activeBestMoveSlot !== null && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-md">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-5 shadow-2xl">
            <div className="text-center space-y-1.5">
              <div className="text-[10px] uppercase font-black text-amber-400">{activeBestMoveSource === 'first_killed' ? 'Первый убитый' : 'Слом нулевого круга'}</div>
              <h2 className="text-xl font-black text-white">Протокол ЛХ</h2>
              <p className="text-sm text-slate-300 font-bold">Игрок #{activeBestMoveSlot} · {activePlayers.find((p) => p.slot_num === activeBestMoveSlot)?.nickname || 'Игрок'}</p>
              <p className="text-xs text-slate-500">Выберите до трёх номеров. Порядок выбора сохраняется.</p>
            </div>
            <div className="grid grid-cols-5 gap-2 max-w-md mx-auto">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((slot) => {
                const index = pendingBestMoveSeats.indexOf(slot);
                return <button key={slot} type="button" onClick={() => setPendingBestMoveSeats((previous) => previous.includes(slot) ? previous.filter((value) => value !== slot) : previous.length < 3 ? [...previous, slot] : previous)} className={`h-14 rounded-xl border-2 font-mono font-black relative ${index >= 0 ? 'border-white bg-slate-950 text-white' : 'border-slate-800 text-slate-400'}`}>{slot}{index >= 0 && <span className="absolute top-1 right-1 text-[9px] rounded-full bg-white text-slate-950 w-4 h-4 flex items-center justify-center">{index + 1}</span>}</button>;
              })}
            </div>
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={() => setPendingBestMoveSeats([])} className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">Сбросить</button>
              <button type="button" onClick={() => {
                const source = activeBestMoveSource;
                const slot = activeBestMoveSlot;
                const next = setBestMove(protocolMarkers, source, pendingBestMoveSeats);
                setProtocolMarkers(next);
                setActivePlayers((previous) => previous.map((p) => p.slot_num === slot ? { ...p, best_move_guesses: [...pendingBestMoveSeats] } : p));
                setActiveBestMoveSource(null);
                setActiveBestMoveSlot(null);
                setPendingBestMoveSeats([]);
                if (phase === 'night' && nightSubPhase === 'best_move' && source === 'first_killed') {
                  setNightSubPhase('morning');
                  setCustomTimerLabel(null);
                  setIsTimerRunning(false);
                }
              }} className="px-6 py-2 rounded-xl bg-white text-slate-950 text-xs font-black">Подтвердить протокол</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-4 right-4 z-[120] px-4 py-2.5 rounded-xl border shadow-2xl text-xs font-bold ${toast.type === 'error' ? 'bg-rose-950 border-rose-500 text-rose-300' : toast.type === 'warning' ? 'bg-amber-950 border-amber-500 text-amber-300' : toast.type === 'success' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>{toast.message}</div>}

      {phase === 'setup' && restorableSession && (
        <div className="bg-amber-950/70 border border-amber-500/50 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3 text-xs text-amber-200">
          <span>Найдена незавершённая игра · {restorableSession.savedAt || 'недавно'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestoreSession} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-black">Восстановить</button>
            <button type="button" onClick={handleDiscardSavedSession} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold">Сбросить</button>
          </div>
        </div>
      )}

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
              <button type="button" onClick={() => setShowRolesOnTable((value) => !value)} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold">{showRolesOnTable ? <EyeOff className="w-3 h-3 inline mr-1" /> : <Eye className="w-3 h-3 inline mr-1" />}{showRolesOnTable ? 'Скрыть роли' : 'Показать роли'}</button>
              <button type="button" onClick={() => setViewMode(viewMode === 'table' ? 'list' : 'table')} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold">{viewMode === 'table' ? 'Список' : 'Стол'}</button>
            </div>
          </div>

          {viewMode === 'table' ? renderTable() : (
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
