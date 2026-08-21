import React, { createContext, useContext, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { api, type GameEvening, type PlayerDetails } from '../../lib/api.ts';
import { getSortedFutureEvenings } from '../../lib/dateUtils.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';

type QuickAddContextValue = {
  openForPlayer: (player: PlayerDetails) => void;
};

const PlayerEveningQuickAddContext = createContext<QuickAddContextValue | null>(null);

const formatWhen = (value: string) => new Date(value).toLocaleString('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function usePlayerEveningQuickAdd() {
  return useContext(PlayerEveningQuickAddContext);
}

export function PlayerEveningQuickAddProvider({
  evenings,
  onOpenEvening,
  onCrmChanged,
  children,
}: {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onCrmChanged?: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const [selectedEveningId, setSelectedEveningId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const futureEvenings = useMemo(() => getSortedFutureEvenings(evenings), [evenings]);
  const existingEveningIds = useMemo(() => new Set((player?.futureBookings || []).map((item) => item.evening_id)), [player]);
  const selectedEvening = futureEvenings.find((item) => item.id === selectedEveningId) || null;
  const alreadyBooked = Boolean(selectedEvening && existingEveningIds.has(selectedEvening.id));

  const openForPlayer = (nextPlayer: PlayerDetails) => {
    const booked = new Set((nextPlayer.futureBookings || []).map((item) => item.evening_id));
    const firstAvailable = futureEvenings.find((item) => !booked.has(item.id)) || futureEvenings[0] || null;
    setPlayer(nextPlayer);
    setSelectedEveningId(firstAvailable?.id || '');
    setError(null);
  };

  const close = () => {
    if (saving) return;
    setPlayer(null);
    setSelectedEveningId('');
    setError(null);
  };

  const submit = async () => {
    if (!player || !selectedEvening || saving) return;
    if (alreadyBooked) {
      setPlayer(null);
      onOpenEvening(selectedEvening.id);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await api.bulkAddParticipants(
        selectedEvening.id,
        [player.id],
        null,
        'going',
        Number(selectedEvening.default_price || 0),
      );
      if (!result.addedCount && !result.skippedCount) throw new Error('Игрок не был добавлен в вечер');
      await onCrmChanged?.();
      setPlayer(null);
      onOpenEvening(selectedEvening.id);
    } catch (submitError: any) {
      setError(submitError?.message || 'Не удалось записать игрока на вечер');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlayerEveningQuickAddContext.Provider value={{ openForPlayer }}>
      {children}
      <MobileSheet
        open={Boolean(player)}
        onClose={close}
        title="Записать на вечер"
        subtitle={player?.nickname || ''}
        widthClass="sm:max-w-md"
        footer={selectedEvening ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            <CalendarPlus className="h-4 w-4" />
            {saving ? 'Записываем…' : alreadyBooked ? 'Уже записан · открыть вечер' : 'Записать и открыть вечер'}
          </button>
        ) : undefined}
      >
        <div className="space-y-3">
          {error ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
          {futureEvenings.length ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Вечер</span>
                <select value={selectedEveningId} onChange={(event) => setSelectedEveningId(event.target.value)} className="mobile-field">
                  {futureEvenings.map((evening) => (
                    <option key={evening.id} value={evening.id}>
                      {evening.title} · {formatWhen(evening.starts_at)}{existingEveningIds.has(evening.id) ? ' · уже записан' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEvening ? (
                <div className="rounded-[15px] border border-border-soft bg-surface-2 p-3">
                  <div className="text-[13px] font-semibold text-text-primary">{selectedEvening.title}</div>
                  <div className="mt-1 text-[11px] text-text-secondary">{formatWhen(selectedEvening.starts_at)} · {selectedEvening.venue || 'Площадка не указана'}</div>
                  <div className="mt-2 text-[11px] text-text-muted">{alreadyBooked ? 'Игрок уже есть в составе этого вечера.' : `Будет добавлен со статусом «Иду»${selectedEvening.default_price ? ` · ${selectedEvening.default_price} ₽` : ''}.`}</div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-[15px] border border-border-soft bg-surface-2 p-4 text-[12px] leading-5 text-text-secondary">Будущих игровых вечеров пока нет. Сначала создай или опубликуй ближайший вечер в «Событиях».</div>
          )}
        </div>
      </MobileSheet>
    </PlayerEveningQuickAddContext.Provider>
  );
}

export default PlayerEveningQuickAddProvider;
