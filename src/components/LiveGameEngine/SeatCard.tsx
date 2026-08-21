import React from "react";
import { Heart, ListPlus, Skull, Star } from "lucide-react";
import { ActivePlayerState, Phase } from "./types.js";
import { MafiaHatIcon, PistolIcon } from "./Icons.js";
import { canToggleVoteAssignment } from "../../lib/liveVoting.js";
import {
  buildSeatVoteStatusPresentation,
  getSeatGridPositionClass,
  resolveSeatContainerClass,
} from "./seatPresentationModel.js";
import {
  toggleTableDecisionVoter,
  useTableDecisionSelection,
} from "./tableDecisionSelectionStore.js";

interface SeatCardProps {
  slotNum: number;
  activePlayers: ActivePlayerState[];
  setActivePlayers: React.Dispatch<React.SetStateAction<ActivePlayerState[]>>;
  activeSpeakerSlot: number | null;
  setActiveSpeakerSlot: (slot: number | null) => void;
  nominations: number[];
  phase: Phase;
  postNightStage?: "none" | "farewell" | "death_protocol";
  shotPlayerSlot: number | null;
  donCheckSlot: number | null;
  sheriffCheckSlot: number | null;
  bestMoveGuesses: number[];
  hideBestMoveGlow: boolean;
  nominationsMap: { [slot: number]: number };
  setNominationsMap: React.Dispatch<React.SetStateAction<{ [slot: number]: number }>>;
  showToast: (msg: string, type?: "success" | "info" | "error") => void;
  playBeep: (freq: number, dur: number) => void;
  votes: { [slot: number]: number };
  handleAllocateVotes: (nominee: number, count: number) => void;
  showRolesOnTable: boolean;
  shootoutNominees: number[];
  isTimerRunning: boolean;
  setIsTimerRunning: (isRunning: boolean) => void;
  timeLeft: number;
  handleStartTimer: (slotNum: number, duration: number) => void;
  handleNominateCandidate: (slotNum: number) => void;
  handleSeatClick: (slotNum: number) => void;
  handleFoulChange: (slotNum: number, dir: "up" | "down") => void;
  onRequestDirectRemoval: (slotNum: number) => void;
  markPlayerSpoken: (slotNum: number) => void;
  setBestMovePlayerSlot: (slot: number | null) => void;
  setBestMoveGuesses: (guesses: number[]) => void;
  nightSubPhase: string;
  roundNumber: number;
  getSeatColor: (slotNum: number) => string;
  votesByPlayer?: { [voterSlot: number]: number };
  currentVotingNomineeIndex?: number;
  isInteractiveVoting?: boolean;
  votingSubPhase?: string;
  shootoutSubPhase?: string;
  bothLeaveVotes?: number[];
}

const getExitLabel = (player: ActivePlayerState): string => {
  if (player.exit_reason === 'voted_zero_round' || player.exit_reason === 'voted_day') return 'Заголосован';
  if (player.removal_reason || player.kick) return 'Удалён';
  return 'Убит';
};

export default function SeatCard(props: SeatCardProps) {
  const {
    slotNum,
    activePlayers,
    activeSpeakerSlot,
    nominations,
    phase,
    postNightStage = "none",
    shotPlayerSlot,
    donCheckSlot,
    sheriffCheckSlot,
    bestMoveGuesses,
    hideBestMoveGlow,
    showToast,
    votes,
    showRolesOnTable,
    shootoutNominees,
    timeLeft,
    handleNominateCandidate,
    handleSeatClick,
    handleFoulChange,
    nightSubPhase,
    roundNumber,
    votesByPlayer,
    currentVotingNomineeIndex = 0,
    isInteractiveVoting = false,
    votingSubPhase = "setup",
    shootoutSubPhase = "disabled",
    bothLeaveVotes = [],
  } = props;

  const tableDecisionSelection = useTableDecisionSelection();
  const player = activePlayers.find((item) => item.slot_num === slotNum);
  if (!player) return null;

  const isSpeaking = activeSpeakerSlot === slotNum;
  const isNominated = nominations.includes(slotNum);
  const activeVoteNominee = phase === "day_voting" ? nominations[currentVotingNomineeIndex] : undefined;
  const isNightShot = phase === "night" && shotPlayerSlot === slotNum;
  const isNightDon = phase === "night" && donCheckSlot === slotNum;
  const isNightSheriff = phase === "night" && sheriffCheckSlot === slotNum;
  const showFarewellFouls = !player.alive && phase === "night" && postNightStage === "farewell" && activeSpeakerSlot === slotNum;
  const tableDecisionActive = phase === 'day_voting' && tableDecisionSelection.active;
  const tableDecisionSelected = tableDecisionActive && tableDecisionSelection.selectedVoterSlots.includes(slotNum);

  const firstNightVictim = activePlayers.find((item) => item.best_move_guesses && item.best_move_guesses.length > 0);
  const isChosenInBestMove = !hideBestMoveGlow && (
    (phase === "night" && nightSubPhase === "best_move" && bestMoveGuesses.includes(slotNum)) ||
    (firstNightVictim?.best_move_guesses?.includes(slotNum) && (phase === "night" || (phase === "day_speeches" && activeSpeakerSlot === null)))
  );

  const baseContainerBorder = resolveSeatContainerClass({
    alive: player.alive,
    phase,
    slotNum,
    nominations,
    currentVotingNomineeIndex,
    isSpeaking,
    isInteractiveVoting,
    votesByPlayer,
    isNominated,
    isChosenInBestMove,
    shootoutNominees,
    shootoutSubPhase,
    bothLeaveVotes,
  });
  const containerBorder = tableDecisionActive && player.alive
    ? tableDecisionSelected
      ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30'
      : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
    : baseContainerBorder;

  const handleCardClick = () => {
    if (tableDecisionActive) {
      if (!player.alive) return;
      toggleTableDecisionVoter(slotNum);
      return;
    }

    if (phase === "day_voting" && isInteractiveVoting && activeVoteNominee !== undefined) {
      const assignments = votesByPlayer || {};
      if (!canToggleVoteAssignment(slotNum, activeVoteNominee, assignments)) {
        const existing = assignments[slotNum];
        showToast(`#${slotNum} уже проголосовал за #${existing}. Вернитесь к этой кандидатуре, чтобы снять голос.`, "info");
        return;
      }
    }
    handleSeatClick(slotNum);
  };

  const renderVoteState = () => {
    if (!isInteractiveVoting || activeVoteNominee === undefined) return null;
    const presentation = buildSeatVoteStatusPresentation({
      slotNum,
      activeNomineeSlot: activeVoteNominee,
      votesByPlayer,
    });

    if (presentation.target === undefined) return null;

    const isCurrentTarget = !presentation.hasVotedOther;
    return (
      <div title={presentation.title}>
        <div className="live-seat-state__label">Голос</div>
        <div className={`live-seat-state__value ${isCurrentTarget ? 'live-seat-state__value--active' : ''}`}>{presentation.statusText}</div>
      </div>
    );
  };

  const renderTableDecisionState = () => {
    if (!tableDecisionActive || !tableDecisionSelected) return null;
    return (
      <div>
        <div className="live-seat-state__label">Поднять</div>
        <div className="live-seat-state__value live-seat-state__value--active">За</div>
      </div>
    );
  };

  const renderDayState = () => {
    if (isSpeaking) {
      return <div><div className="live-seat-state__label">Речь</div><div className="live-seat-state__value live-seat-state__value--warning">{timeLeft}с</div></div>;
    }
    if (isNominated) return <div><div className="live-seat-state__value live-seat-state__value--active">Выставлен</div></div>;
    if (player.has_foul_penalty || player.fouls === 3) return <div><div className="live-seat-state__value live-seat-state__value--warning">30 секунд</div></div>;
    if (player.has_spoken_this_round) return <div><div className="live-seat-state__value live-seat-state__value--done">Речь ✓</div></div>;
    return null;
  };

  const renderShootoutState = () => {
    if (phase !== "shootout") return null;
    if (shootoutNominees.includes(slotNum)) {
      return <div><div className="live-seat-state__label">Переголосование</div><div className="live-seat-state__value live-seat-state__value--warning">#{slotNum}</div></div>;
    }
    return null;
  };

  return (
    <div
      onClick={handleCardClick}
      data-seat={slotNum}
      data-table-decision={tableDecisionActive ? 'true' : undefined}
      data-table-vote-selected={tableDecisionSelected ? 'true' : undefined}
      className={`live-seat-card ${!player.alive ? 'live-seat-card--dead' : ''} ${isSpeaking ? 'live-seat-card--speaking' : ''} ${phase === 'day_voting' && (isInteractiveVoting || tableDecisionActive) ? 'live-seat-card--voting' : ''} relative aspect-auto md:aspect-[16/11.5] min-h-[102px] sm:min-h-[120px] md:min-h-[160px] border cursor-pointer select-none flex flex-col w-full ${getSeatGridPositionClass(slotNum)} ${containerBorder}`}
    >
      {player.alive && phase === "day_speeches" && (
        <div className="live-seat-quickbar">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleNominateCandidate(slotNum);
            }}
            className={`live-seat-quick-action live-seat-quick-action--nomination ${isNominated ? 'live-seat-quick-action--nomination-active' : ''}`}
            title={isNominated ? "Снять выставление" : "Выставить"}
            aria-label={isNominated ? `Снять выставление #${slotNum}` : `Выставить #${slotNum}`}
          >
            <ListPlus /><span>{isNominated ? 'Снять' : 'Выставить'}</span>
          </button>
          <div className="live-seat-quickbar__group">
            {player.fouls > 0 && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleFoulChange(slotNum, "down"); }}
                className="live-seat-quick-action live-seat-quick-action--remove-foul"
                title="Снять обычный фол"
              >−Ф</button>
            )}
            {player.fouls < 4 && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleFoulChange(slotNum, "up"); }}
                className="live-seat-quick-action live-seat-quick-action--foul"
                title="Добавить обычный фол"
              >+Ф</button>
            )}
          </div>
        </div>
      )}

      {player.alive && phase === "night" && (isNightShot || isNightDon || isNightSheriff) && (
        <div className="live-seat-quickbar">
          {isNightShot && <span className="live-seat-night-marker live-seat-night-marker--shot"><PistolIcon />Отстрел</span>}
          {isNightDon && <span className="live-seat-night-marker live-seat-night-marker--don"><MafiaHatIcon />Дон</span>}
          {isNightSheriff && <span className="live-seat-night-marker live-seat-night-marker--sheriff"><Star />Шериф</span>}
        </div>
      )}

      <div className="live-seat-state">
        {!player.alive ? (
          <div>
            <Skull className="w-4 h-4 mx-auto mb-1 text-rose-400/70" />
            <div className="live-seat-state__value">{getExitLabel(player)}</div>
          </div>
        ) : phase === "day_voting" ? (
          tableDecisionActive ? renderTableDecisionState() : isInteractiveVoting ? renderVoteState() : null
        ) : phase === "day_speeches" ? renderDayState() : renderShootoutState()}
      </div>

      {showFarewellFouls && (
        <div className="absolute right-1.5 top-1.5 z-30 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <button type="button" disabled={player.fouls <= 0} onClick={() => handleFoulChange(slotNum, "down")} className="live-seat-quick-action" title="Снять обычный фол">−Ф</button>
          <button type="button" disabled={player.fouls >= 4} onClick={() => handleFoulChange(slotNum, "up")} className="live-seat-quick-action live-seat-quick-action--foul" title="Добавить обычный фол">+Ф</button>
        </div>
      )}

      <div className="live-seat-footer">
        <div className="live-seat-footer__identity">
          <div className="live-seat-number" data-seat={slotNum}>{slotNum}</div>
          <span className="live-seat-footer__name">{player.nickname || `Игрок ${slotNum}`}</span>
        </div>
        {showRolesOnTable ? (
          <div className="live-seat-role" title={player.role === "Мирный" ? "Красный" : player.role}>
            {player.role === "Мирный" && <Heart className="fill-current text-rose-500" />}
            {player.role === "Дон" && <MafiaHatIcon className="text-violet-300" />}
            {player.role === "Мафия" && <PistolIcon className="text-slate-200" />}
            {player.role === "Шериф" && <Star className="fill-current text-emerald-400" />}
          </div>
        ) : (
          <div className="live-seat-role" title="Роль скрыта" />
        )}
      </div>

      {phase === "day_voting" && !isInteractiveVoting && votingSubPhase === "resolved" && isNominated && (
        <span className="sr-only">Игрок #{slotNum} получил {votes[slotNum] || 0} голосов</span>
      )}

      {isChosenInBestMove && roundNumber >= 1 && (
        <span className="sr-only">Игрок #{slotNum} выбран в ЛХ</span>
      )}
    </div>
  );
}
