import React, { useMemo, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { api, type TournamentGameSeat } from '../../../lib/api.ts';

const ROLES = [
  { id: 'citizen', label: 'Мирный', on: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60' },
  { id: 'sheriff', label: 'Шериф', on: 'bg-amber-500/20 text-amber-300 border-amber-500/60' },
  { id: 'mafia', label: 'Мафия', on: 'bg-rose-500/20 text-rose-300 border-rose-500/60' },
  { id: 'don', label: 'Дон', on: 'bg-purple-500/20 text-purple-300 border-purple-500/60' },
] as const;
const LIMITS: Record<string, number> = { citizen: 6, sheriff: 1, mafia: 2, don: 1 };

/**
 * «Исправить роли» for a game that is already running (owner, 2026-10-03: a wrong click while dealing the roles).
 * All changed seats go to the server in one request, so the 6/1/2/1 composition is checked as a whole.
 */
export const ActiveGameRolesModal: React.FC<{
  tournamentId: string;
  gameId: string;
  gameNumber: number;
  seats: TournamentGameSeat[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ tournamentId, gameId, gameNumber, seats, onClose, onSaved }) => {
  const ordered = useMemo(() => seats.slice().sort((a, b) => a.seat_number - b.seat_number), [seats]);
  const [roles, setRoles] = useState<Record<number, string>>(() => Object.fromEntries(ordered.map((seat) => [seat.seat_number, seat.role || 'citizen'])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
    Object.values(roles).forEach((role) => { result[role] = (result[role] || 0) + 1; });
    return result;
  }, [roles]);
  const valid = ROLES.every((role) => counts[role.id] === LIMITS[role.id]);
  const changed = ordered.filter((seat) => (seat.role || 'citizen') !== roles[seat.seat_number]);

  const save = async () => {
    if (!valid || !changed.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateGameRoles(tournamentId, gameId, changed.map((seat) => ({ seat_number: seat.seat_number, role: roles[seat.seat_number] })));
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить роли');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" data-testid="active-game-roles-modal">
      <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-[22px] border border-border-soft bg-surface-1 p-4 text-text-primary sm:rounded-[22px] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black">Исправить роли · игра №{gameNumber}</h3>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">Нажмите на нужную роль у игрока. Должно получиться 6 мирных, 1 шериф, 2 мафии и 1 дон. Пока протокол не завершён, роли можно менять.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px] font-bold">
          {ROLES.map((role) => (
            <div key={role.id} className={`rounded-xl border px-1 py-1.5 ${counts[role.id] === LIMITS[role.id] ? 'border-emerald-500/40 text-emerald-300' : 'border-danger/50 text-danger'}`}>
              {role.label}: {counts[role.id]} / {LIMITS[role.id]}
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {ordered.map((seat) => (
            <div key={seat.seat_number} className="rounded-xl border border-border-soft bg-surface-2 p-2">
              <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] text-white">{seat.seat_number}</span>
                <span className="truncate">{(seat as any).display_name || `Игрок ${seat.seat_number}`}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    data-testid={`role-${seat.seat_number}-${role.id}`}
                    aria-pressed={roles[seat.seat_number] === role.id}
                    onClick={() => setRoles((current) => ({ ...current, [seat.seat_number]: role.id }))}
                    className={`min-h-[40px] rounded-lg border text-[11px] font-bold ${roles[seat.seat_number] === role.id ? role.on : 'border-border-soft bg-surface-1 text-text-muted'}`}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-4 text-text-muted">Если игра уже открыта в движке, закройте и откройте «Вести игру» заново, чтобы роли обновились.</p>
        {error ? <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
        <button
          type="button"
          disabled={!valid || !changed.length || saving}
          onClick={() => void save()}
          className="mt-3 min-h-[48px] w-full rounded-xl bg-accent px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
        >
          {saving ? 'Сохраняем…' : changed.length ? `Сохранить роли (изменено: ${changed.length})` : 'Нет изменений'}
        </button>
      </div>
    </div>
  );
};
