import React, { useState, useEffect } from 'react';
import { Shield, Crown, Skull, User, ArrowLeftRight, Play, Edit2 } from 'lucide-react';
import { TournamentGame, TournamentGameSeat } from '../../../lib/api';
import { api } from '../../../lib/api';

export interface TournamentGameSetupProps {
  tournamentId: string;
  game: TournamentGame;
  tournamentStatus: string;
  isAnotherGameActive: boolean;
  activeGameNumber?: number;
  judgeName?: string | null;
  chiefJudgeName?: string | null;
  canEditJudgeAndRoles: boolean;
  canSwapSeats: boolean;
  onOpenSwapModal: () => void;
  onEditJudgeClick?: () => void;
  onRolesUpdated?: () => void;
  onGameStarted: (gameId: string) => void;
  setFeedbackMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

export type SpecialRoleTool = 'sheriff' | 'don' | 'mafia';

export const TournamentGameSetup: React.FC<TournamentGameSetupProps> = ({
  tournamentId,
  game,
  tournamentStatus,
  isAnotherGameActive,
  activeGameNumber,
  judgeName,
  chiefJudgeName,
  canEditJudgeAndRoles,
  canSwapSeats,
  onOpenSwapModal,
  onEditJudgeClick,
  onGameStarted,
  setFeedbackMsg,
}) => {
  const [activeTool, setActiveTool] = useState<SpecialRoleTool>('sheriff');
  const [sheriffSeat, setSheriffSeat] = useState<number | null>(null);
  const [donSeat, setDonSeat] = useState<number | null>(null);
  const [mafiaSeats, setMafiaSeats] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Restore saved roles on game load
  useEffect(() => {
    let sSeat: number | null = null;
    let dSeat: number | null = null;
    const mSeats: number[] = [];

    for (const seat of game.seats || []) {
      if (seat.role === 'sheriff') sSeat = seat.seat_number;
      else if (seat.role === 'don') dSeat = seat.seat_number;
      else if (seat.role === 'mafia') {
        if (mSeats.length < 2) mSeats.push(seat.seat_number);
      }
    }

    setSheriffSeat(sSeat);
    setDonSeat(dSeat);
    setMafiaSeats(mSeats);

    // Auto-select first unfilled tool
    if (!sSeat) setActiveTool('sheriff');
    else if (!dSeat) setActiveTool('don');
    else if (mSeats.length < 2) setActiveTool('mafia');
  }, [game.id, game.seats]);

  const isSheriffDone = sheriffSeat !== null;
  const isDonDone = donSeat !== null;
  const isMafiaDone = mafiaSeats.length === 2;
  const isComplete = isSheriffDone && isDonDone && isMafiaDone;

  const citizenCount = 10 - (isSheriffDone ? 1 : 0) - (isDonDone ? 1 : 0) - mafiaSeats.length;

  const handleSeatClick = (seatNumber: number) => {
    if (!canEditJudgeAndRoles) return;

    const isSheriff = sheriffSeat === seatNumber;
    const isDon = donSeat === seatNumber;
    const isMafia = mafiaSeats.includes(seatNumber);
    const currentRole = isSheriff ? 'sheriff' : isDon ? 'don' : isMafia ? 'mafia' : null;

    if (currentRole === activeTool) {
      // Toggle off current role if clicking same role
      if (activeTool === 'sheriff') setSheriffSeat(null);
      else if (activeTool === 'don') setDonSeat(null);
      else if (activeTool === 'mafia') setMafiaSeats((prev) => prev.filter((s) => s !== seatNumber));
      return;
    }

    // Assign activeTool to seatNumber, clearing previous role from this seat if any
    if (activeTool === 'sheriff') {
      if (isDon) setDonSeat(null);
      if (isMafia) setMafiaSeats((prev) => prev.filter((s) => s !== seatNumber));
      setSheriffSeat(seatNumber);

      // Auto-switch tool if don is still needed
      if (!donSeat && donSeat !== seatNumber) setActiveTool('don');
      else if (mafiaSeats.length < 2) setActiveTool('mafia');
    } else if (activeTool === 'don') {
      if (isSheriff) setSheriffSeat(null);
      if (isMafia) setMafiaSeats((prev) => prev.filter((s) => s !== seatNumber));
      setDonSeat(seatNumber);

      // Auto-switch tool if mafia is still needed
      if (mafiaSeats.length < 2) setActiveTool('mafia');
      else if (!sheriffSeat) setActiveTool('sheriff');
    } else if (activeTool === 'mafia') {
      if (isSheriff) setSheriffSeat(null);
      if (isDon) setDonSeat(null);

      if (mafiaSeats.length < 2) {
        setMafiaSeats((prev) => [...prev, seatNumber]);
      } else {
        // Replace oldest mafia seat
        setMafiaSeats(([_, second]) => [second, seatNumber]);
      }
    }
  };

  const handleSaveAndStart = async () => {
    if (!isComplete) {
      setFeedbackMsg({
        type: 'error',
        text: 'Выберите Шерифа, Дона и двух игроков Мафии. Остальные станут мирными автоматически.',
      });
      return;
    }

    if (tournamentStatus !== 'active') {
      setFeedbackMsg({
        type: 'error',
        text: 'Запуск игры разрешён только в активном турнире. Запустите турнир вверху.',
      });
      return;
    }

    if (isAnotherGameActive) {
      setFeedbackMsg({
        type: 'error',
        text: `Сначала завершите активную Игру №${activeGameNumber}`,
      });
      return;
    }

    setSaving(true);
    setFeedbackMsg(null);

    try {
      const rolesPayload = (game.seats || []).map((s: TournamentGameSeat) => {
        let role: string = 'citizen';
        if (s.seat_number === sheriffSeat) role = 'sheriff';
        else if (s.seat_number === donSeat) role = 'don';
        else if (mafiaSeats.includes(s.seat_number)) role = 'mafia';
        return { seat_number: s.seat_number, role };
      });

      // 1. Save roles
      await api.updateGameRoles(tournamentId, game.id, rolesPayload);

      // 2. Start game
      await api.startTournamentGame(tournamentId, game.id);

      // 3. Callback to update view & open protocol modal
      onGameStarted(game.id);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Ошибка сохранения ролей или запуска игры',
      });
    } finally {
      setSaving(false);
    }
  };

  const sortedSeats = [...(game.seats || [])].sort((a, b) => a.seat_number - b.seat_number);

  return (
    <div className="space-y-4">
      {/* Upper Controls Bar: Judge & Seat Swapping */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2 p-3.5 rounded-2xl border border-border-soft">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-semibold">Судья игры:</span>
          {onEditJudgeClick && canEditJudgeAndRoles ? (
            <button
              type="button"
              onClick={onEditJudgeClick}
              className="font-bold text-text-primary hover:text-accent flex items-center gap-1 cursor-pointer"
            >
              <span>{judgeName || chiefJudgeName || 'Назначить судью'}</span>
              <Edit2 className="w-3 h-3 text-text-muted" />
            </button>
          ) : (
            <span className="font-bold text-text-primary">{judgeName || chiefJudgeName || 'Не указан'}</span>
          )}
        </div>

        {canSwapSeats && (
          <button
            type="button"
            onClick={onOpenSwapModal}
            className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
            <span>Исправить игроков на местах</span>
          </button>
        )}
      </div>

      {/* Role Progress Header & Tool Selector */}
      <div className="bg-surface-2 p-3.5 rounded-2xl border border-border-soft space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-text-primary">Быстрое назначение ролей:</span>
          <span className="text-[11px] font-mono text-text-muted">
            Мирные: <strong className="text-emerald-400">{citizenCount}</strong> / 6 (авто)
          </span>
        </div>

        {/* 3 Role Selection Tool Pills */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTool('sheriff')}
            className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTool === 'sheriff'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-md shadow-amber-500/10'
                : isSheriffDone
                ? 'bg-amber-500/10 text-amber-400/80 border-amber-500/30'
                : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Шериф</span>
            <span className="font-mono text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded-md">
              {isSheriffDone ? '1/1' : '0/1'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('don')}
            className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTool === 'don'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-md shadow-purple-500/10'
                : isDonDone
                ? 'bg-purple-500/10 text-purple-400/80 border-purple-500/30'
                : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Дон</span>
            <span className="font-mono text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded-md">
              {isDonDone ? '1/1' : '0/1'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('mafia')}
            className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTool === 'mafia'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-md shadow-rose-500/10'
                : isMafiaDone
                ? 'bg-rose-500/10 text-rose-400/80 border-rose-500/30'
                : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover'
            }`}
          >
            <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Мафия</span>
            <span className="font-mono text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded-md">
              {mafiaSeats.length}/2
            </span>
          </button>
        </div>

        <p className="text-[11px] text-text-muted leading-snug">
          Выберите роль выше и нажмите на места игроков. Повторное нажатие снимает роль.
        </p>
      </div>

      {/* 10 Seats Compact Mobile Grid (2 x 5) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="tournament-game-setup-grid">
        {sortedSeats.map((seat) => {
          const isSheriff = sheriffSeat === seat.seat_number;
          const isDon = donSeat === seat.seat_number;
          const isMafia = mafiaSeats.includes(seat.seat_number);

          let roleLabel = 'Мирный';
          let roleBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          let borderClass = 'border-border-soft bg-surface-2 hover:bg-surface-hover';
          let IconComponent = User;

          if (isSheriff) {
            roleLabel = 'Шериф';
            roleBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
            borderClass = 'border-amber-500/60 bg-amber-500/10 shadow-sm';
            IconComponent = Shield;
          } else if (isDon) {
            roleLabel = 'Дон';
            roleBadgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold';
            borderClass = 'border-purple-500/60 bg-purple-500/10 shadow-sm';
            IconComponent = Crown;
          } else if (isMafia) {
            roleLabel = 'Мафия';
            roleBadgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
            borderClass = 'border-rose-500/60 bg-rose-500/10 shadow-sm';
            IconComponent = Skull;
          }

          return (
            <button
              key={seat.id}
              type="button"
              data-testid={`seat-button-${seat.seat_number}`}
              onClick={() => handleSeatClick(seat.seat_number)}
              disabled={!canEditJudgeAndRoles}
              className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 min-w-0 cursor-pointer ${borderClass} ${
                !canEditJudgeAndRoles ? 'opacity-75 cursor-default' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0 w-full">
                <span className="w-6 h-6 rounded-lg bg-accent text-white font-mono font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                  {seat.seat_number}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md border truncate max-w-[70px] ${roleBadgeClass}`}
                >
                  {roleLabel}
                </span>
              </div>

              <div className="min-w-0 w-full pt-0.5 flex items-center gap-1.5">
                <IconComponent className="w-3.5 h-3.5 shrink-0 opacity-80" />
                <span className="text-xs font-bold text-text-primary block truncate">
                  {seat.display_name}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Prominent Sticky Bottom Button */}
      <div className="sticky bottom-3 z-30 pt-2 pb-1 bg-surface-1/90 backdrop-blur-md rounded-2xl">
        <button
          type="button"
          onClick={handleSaveAndStart}
          disabled={saving}
          data-testid="save-and-start-game-btn"
          className={`w-full font-bold py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xl cursor-pointer min-h-[48px] ${
            isComplete
              ? 'bg-accent hover:bg-accent-hover text-white shadow-accent/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
          }`}
        >
          {saving ? (
            <span>Сохранение и запуск...</span>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Сохранить роли и запустить игру №{game.game_number}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
