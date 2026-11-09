import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { RoleDealChoice } from '../../game/RoleDealChoice.tsx';
import PhysicalRoleDeal from '../../game/PhysicalRoleDeal.tsx';
import VirtualRoleDeal from '../../game/VirtualRoleDeal.tsx';
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
  onRolesUpdated?: () => void;
  onGameStarted: (gameId: string) => void;
  setFeedbackMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

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
  onGameStarted,
  setFeedbackMsg,
}) => {
  const [saving, setSaving] = useState(false);
  const [showPhysicalDeal, setShowPhysicalDeal] = useState(false);
  const [showVirtualDeal, setShowVirtualDeal] = useState(false);
  // A physical deal whose start failed (network, server): kept, so the organizer retries instead of dealing again.
  const [unstarted, setUnstarted] = useState<Record<number, string> | null>(null);
  const sortedSeats = [...(game.seats || [])].sort((a, b) => a.seat_number - b.seat_number);
  const seatsForDeal = sortedSeats.map((seat) => ({ seat_number: seat.seat_number, nickname: seat.display_name || `Игрок ${seat.seat_number}` }));

  // ONE reason, shown on top, instead of a grey note inside a disabled button.
  const blockedReason = tournamentStatus !== 'active'
    ? 'Сначала нажмите «Запустить турнир» на вкладке «Организация»: игры запускаются только в идущем турнире.'
    : isAnotherGameActive ? `Сначала завершите идущую игру №${activeGameNumber}.` : null;

  // The one way a game starts, for every way of dealing (owner, 2026-11-09): roles are saved, the game starts, the engine opens.
  const startWithRoles = async (rolesBySeat: Record<number, string>) => {
    if (blockedReason) { setFeedbackMsg({ type: 'error', text: blockedReason }); throw new Error(blockedReason); }
    setSaving(true); setFeedbackMsg(null);
    try {
      await api.updateGameRoles(tournamentId, game.id, (game.seats || []).map((seat: TournamentGameSeat) => ({ seat_number: seat.seat_number, role: rolesBySeat[seat.seat_number] || 'citizen' })));
      await api.startTournamentGame(tournamentId, game.id);
      setUnstarted(null);
      onGameStarted(game.id);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Ошибка сохранения ролей или запуска игры' });
      throw err;
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2 p-3.5 rounded-2xl border border-border-soft">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-semibold">Судья игры:</span>
          <span className="font-bold text-text-primary">{judgeName || chiefJudgeName || 'Не указан'}</span>
        </div>

        {canSwapSeats && (
          <button type="button" onClick={onOpenSwapModal} className="bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer">
            <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
            <span>Исправить игроков на местах</span>
          </button>
        )}
      </div>

      {unstarted ? (
        <div role="alert" data-testid="role-deal-unstarted" className="space-y-2 rounded-2xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          <p className="font-bold">Роли розданы, но игра не запустилась.</p>
          <button type="button" disabled={saving} onClick={() => void startWithRoles(unstarted).catch(() => undefined)} className="min-h-11 w-full rounded-xl bg-accent px-4 text-xs font-black text-white disabled:opacity-50">
            {saving ? 'Запускаем…' : 'Повторить запуск с этими ролями'}
          </button>
        </div>
      ) : null}

      {canEditJudgeAndRoles && (
        <RoleDealChoice
          blockedReason={blockedReason}
          busy={saving}
          virtualTestId="tournament-setup-virtual-deal"
          physicalTestId="tournament-setup-physical-deal"
          onVirtual={() => setShowVirtualDeal(true)}
          onPhysical={() => setShowPhysicalDeal(true)}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="tournament-game-setup-grid">
        {sortedSeats.map((seat) => (
          <div key={seat.id} data-testid={`seat-${seat.seat_number}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-border-soft bg-surface-2 p-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent font-mono text-xs font-black text-white">{seat.seat_number}</span>
            <span className="block min-w-0 truncate text-xs font-bold text-text-primary">{seat.display_name}</span>
          </div>
        ))}
      </div>

      {showVirtualDeal && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-3">
          <div className="mx-auto max-w-md">
            <VirtualRoleDeal
              seats={seatsForDeal}
              allowRolePurchase={false}
              persistenceKey={`tournament-setup:${tournamentId}:${game.id}`}
              finishLabel="Сохранить роли и запустить игру"
              onCancel={() => setShowVirtualDeal(false)}
              onComplete={async (assignments) => { await startWithRoles(assignments as Record<number, string>); setShowVirtualDeal(false); }}
            />
          </div>
        </div>
      )}

      {showPhysicalDeal && (
        <PhysicalRoleDeal
          seats={seatsForDeal}
          onCancel={() => setShowPhysicalDeal(false)}
          onComplete={(assignments) => {
            setShowPhysicalDeal(false);
            void startWithRoles(assignments as Record<number, string>).catch(() => setUnstarted(assignments as Record<number, string>));
          }}
        />
      )}
    </div>
  );
};
