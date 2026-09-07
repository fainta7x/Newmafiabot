import React from 'react';
import { Check, Layers3, Music2 } from 'lucide-react';
import type { Player } from '../../types.js';
import PhysicalRoleDeal from '../game/PhysicalRoleDeal.tsx';
import { physicalRoleToLive, roleSetupIsValid, type LiveRole } from './setupRoles.js';
import type { ActivePlayerState } from './types.js';

type Props = {
  players: Player[];
  activePlayers: ActivePlayerState[];
  handleAutoFillSetupPlayers: () => void;
  handleSelectSetupRole: (slotNum: number, role: LiveRole) => void;
  onCancel: () => void;
  validateSetupAndStart: () => void;
  onRoleDealActiveChange?: (active: boolean) => void;
  speechRecordingControl?: React.ReactNode;
};

export default function ClubGameSetupPhase({
  players,
  activePlayers,
  handleAutoFillSetupPlayers,
  handleSelectSetupRole,
  onCancel,
  validateSetupAndStart,
  onRoleDealActiveChange,
  speechRecordingControl,
}: Props) {
  const [showPhysicalDeal, setShowPhysicalDeal] = React.useState(false);
  const [awaitingStart, setAwaitingStart] = React.useState(false);
  const [confirmedRosterSignature, setConfirmedRosterSignature] = React.useState<string | null>(null);
  const prefillDone = React.useRef(false);

  React.useEffect(() => {
    if (prefillDone.current) return;
    prefillDone.current = true;
    if (activePlayers.every((player) => !player.user_id)) handleAutoFillSetupPlayers();
  }, [activePlayers, handleAutoFillSetupPlayers]);

  React.useEffect(() => () => onRoleDealActiveChange?.(false), [onRoleDealActiveChange]);

  React.useEffect(() => {
    if (!awaitingStart || !roleSetupIsValid(activePlayers)) return;
    setAwaitingStart(false);
    validateSetupAndStart();
  }, [activePlayers, awaitingStart, validateSetupAndStart]);

  const selectedUserIds = activePlayers
    .map((player) => player.user_id)
    .filter((userId): userId is number => Boolean(userId));
  const selectedCount = selectedUserIds.length;
  const rosterReady = selectedCount === 10 && new Set(selectedUserIds).size === 10;
  const rosterSignature = activePlayers.map((player) => `${player.slot_num}:${player.user_id || 0}`).join('|');
  const rosterConfirmed = rosterReady && confirmedRosterSignature === rosterSignature;

  React.useEffect(() => {
    if (confirmedRosterSignature !== null && confirmedRosterSignature !== rosterSignature) {
      setConfirmedRosterSignature(null);
    }
  }, [confirmedRosterSignature, rosterSignature]);

  const openRoleDeal = () => {
    if (!rosterConfirmed) return;
    onRoleDealActiveChange?.(true);
    setShowPhysicalDeal(true);
  };
  const closeRoleDeal = () => {
    setShowPhysicalDeal(false);
    onRoleDealActiveChange?.(false);
  };

  const dealSeats = activePlayers.map((player) => ({
    seat_number: player.slot_num,
    nickname: player.user_id
      ? player.nickname || players.find((candidate) => candidate.user_id === player.user_id)?.nickname || `Игрок ${player.slot_num}`
      : 'Не выбран',
  }));

  const primaryAction = !rosterReady
    ? {
        label: 'Нужно 10 разных игроков',
        disabled: true,
        onClick: () => undefined,
      }
    : !rosterConfirmed
      ? {
          label: 'Подтвердить состав',
          disabled: false,
          onClick: () => setConfirmedRosterSignature(rosterSignature),
        }
      : {
          label: 'Начать раздачу ролей →',
          disabled: false,
          onClick: openRoleDeal,
        };

  return (
    <div className="space-y-2.5 pb-2">
      <section data-testid="club-game-setup-hero" className="rounded-[24px] border border-white/[0.09] bg-white/[0.045] p-3.5 shadow-[0_14px_42px_rgba(0,0,0,0.16)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Подготовка игры</div>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-white">Раздача ролей</h2>
            <p className="mt-1 text-[11px] leading-4 text-white/42">Сначала подтвердите фактический состав стола, затем раздайте физические карты.</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-black/20 text-white/45">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[9px] font-semibold text-white/34">
          <span className="rounded-lg bg-black/20 px-2 py-1.5">{selectedCount}/10 игроков</span>
          <span className="rounded-lg bg-black/20 px-2 py-1.5">6 · 1 · 2 · 1</span>
          {rosterConfirmed && (
            <span data-testid="club-game-roster-confirmed" className="inline-flex items-center gap-1 rounded-lg bg-emerald-300/[0.08] px-2 py-1.5 text-emerald-100/70">
              <Check className="h-3 w-3" aria-hidden="true" />Состав подтверждён
            </span>
          )}
        </div>
      </section>

      {awaitingStart ? (
        <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3.5 text-center text-[12px] font-semibold text-emerald-100">Роли зафиксированы · открываю договорку…</div>
      ) : (
        <div data-testid="club-game-setup-primary-actions" className="grid grid-cols-[0.65fr_1.35fr] gap-2">
          <button type="button" onClick={onCancel} className="min-h-[52px] rounded-[16px] border border-white/[0.08] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/42 active:bg-white/[0.06]">Назад</button>
          <button
            data-testid="club-game-start-role-deal"
            type="button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            className="min-h-[52px] rounded-[16px] bg-white px-4 text-[12px] font-semibold text-[#090a0d] active:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28"
          >
            {primaryAction.label}
          </button>
        </div>
      )}

      <section data-testid="club-game-table-preview" className="rounded-[22px] border border-white/[0.07] bg-white/[0.028] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-white/68">Состав стола</div>
            <div className="mt-0.5 text-[9px] text-white/28">Проверьте все 10 мест и подтвердите состав перед первой картой</div>
          </div>
          <div className={`rounded-xl px-2.5 py-1.5 text-[10px] font-semibold ${rosterReady ? 'bg-emerald-300/[0.07] text-emerald-100/60' : 'bg-black/20 text-white/42'}`}>{selectedCount}/10</div>
        </div>
        <div className="mt-2.5 grid grid-cols-5 gap-1.5">
          {dealSeats.map((seat, index) => {
            const selected = Boolean(activePlayers[index]?.user_id);
            return (
              <div key={seat.seat_number} className={`min-w-0 rounded-[10px] border px-1 py-1.5 text-center ${selected ? 'border-white/[0.055] bg-black/15' : 'border-rose-300/10 bg-rose-300/[0.035]'}`}>
                <div className="text-[10px] font-semibold text-white/78">{seat.seat_number}</div>
                <div className={`mt-0.5 truncate text-[7.5px] ${selected ? 'text-white/28' : 'text-rose-100/45'}`}>{seat.nickname}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section data-testid="club-game-music-settings" className="rounded-[20px] border border-violet-300/[0.09] bg-violet-300/[0.035] p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-black/20 text-violet-100/55"><Music2 className="h-3.5 w-3.5" /></div>
          <div><div className="text-[11px] font-semibold text-white/68">Музыка выбирается по ходу игры</div><div className="mt-0.5 text-[9px] leading-4 text-white/28">Раздача и ночи используют общий плейлист вечера · заранее выбирать два трека не нужно.</div></div>
        </div>
      </section>

      {speechRecordingControl}

      {showPhysicalDeal && rosterConfirmed && (
        <PhysicalRoleDeal
          seats={dealSeats}
          musicTrackId={undefined}
          musicTrackTitle="Плейлист вечера"
          onCancel={closeRoleDeal}
          onComplete={(assignments) => {
            Object.entries(assignments).forEach(([seatNumber, role]) => handleSelectSetupRole(Number(seatNumber), physicalRoleToLive(role)));
            closeRoleDeal();
            setAwaitingStart(true);
          }}
        />
      )}
    </div>
  );
}
