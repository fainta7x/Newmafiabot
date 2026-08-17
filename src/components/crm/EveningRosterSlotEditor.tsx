import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening, type Player } from '../../lib/api.ts';

type SlotPerson = { id: string; nickname: string };
type Slot = {
  id: string;
  slot_number: number;
  starts_at: string;
  ends_at: string;
  price: number;
  registered_count: number;
  target_players: number;
  selected?: boolean;
  participants: SlotPerson[];
};
type Plan = {
  event: {
    format: string;
    status: string;
    price_per_game: number;
    max_evening_price?: number | null;
  };
  slots: Slot[];
  selection?: { slot_ids: string[]; games: number; total: number };
};
type EveningData = GameEvening & { participants?: EveningParticipant[] };
type Mode = 'player' | 'guest';

const moscowTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export default function EveningRosterSlotEditor({ eveningId, onChanged }: { eveningId: string; onChanged?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mode, setMode] = useState<Mode>('player');
  const [playerId, setPlayerId] = useState('');
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [slotIds, setSlotIds] = useState<string[]>([]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [slotResponse, eveningData, playerRows] = await Promise.all([
        fetch(`/api/evenings/${encodeURIComponent(eveningId)}/slots`, { credentials: 'include' }),
        api.getEvening(eveningId) as Promise<EveningData>,
        api.getPlayers(),
      ]);
      const slotBody = await slotResponse.json().catch(() => ({}));
      if (!slotResponse.ok) throw new Error(slotBody?.error || 'Не удалось загрузить игры вечера');
      setPlan(slotBody);
      setEvening(eveningData);
      setPlayers([...playerRows].sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить запись на игры');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!expanded) return;
    void load();
  }, [expanded, eveningId]);

  const participantIds = useMemo(
    () => new Set((evening?.participants || []).map((participant) => participant.player_id)),
    [evening],
  );

  const syncSelectionForPlayer = (nextPlayerId: string, sourcePlan = plan) => {
    setPlayerId(nextPlayerId);
    setMessage('');
    setError('');
    if (!nextPlayerId || !sourcePlan) {
      setSlotIds([]);
      return;
    }
    setSlotIds(
      sourcePlan.slots
        .filter((slot) => slot.participants.some((person) => person.id === nextPlayerId))
        .map((slot) => slot.id),
    );
  };

  const toggleSlot = (slotId: string) => {
    setMessage('');
    setSlotIds((current) => current.includes(slotId)
      ? current.filter((id) => id !== slotId)
      : [...current, slotId]);
  };

  const selectedSlots = useMemo(
    () => (plan?.slots || []).filter((slot) => slotIds.includes(slot.id)),
    [plan, slotIds],
  );
  const rawTotal = selectedSlots.reduce((sum, slot) => sum + Number(slot.price || 0), 0);
  const maxPrice = Number(plan?.event?.max_evening_price || 0);
  const total = maxPrice > 0 ? Math.min(rawTotal, maxPrice) : rawTotal;

  const saveSlots = async (targetPlayerId: string) => {
    const response = await fetch(
      `/api/evenings/${encodeURIComponent(eveningId)}/slots/player/${encodeURIComponent(targetPlayerId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_ids: slotIds }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить игры игрока');
    setPlan(body);
    return body as Plan;
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      let targetPlayerId = playerId;
      const guestName = guestNickname.trim();
      if (mode === 'guest') {
        if (!guestName) throw new Error('Укажи никнейм гостя');
        if (!slotIds.length) throw new Error('Выбери хотя бы одну игру для гостя');
        const participant = await api.addParticipant(eveningId, {
          nickname: guestName,
          phone: guestPhone.trim() || undefined,
          table_id: null,
          registration_status: 'unanswered',
          amount_due: 0,
        } as any);
        targetPlayerId = String(participant.player_id);
      }
      if (!targetPlayerId) throw new Error('Выбери игрока');

      const wasParticipant = participantIds.has(targetPlayerId);
      const updatedPlan = await saveSlots(targetPlayerId);
      await load(true);
      setMode('player');
      setGuestNickname('');
      setGuestPhone('');
      syncSelectionForPlayer(targetPlayerId, updatedPlan);
      const nickname = mode === 'guest'
        ? guestName
        : players.find((player) => player.id === targetPlayerId)?.nickname || 'Игрок';
      if (!slotIds.length) {
        setMessage(wasParticipant
          ? `${nickname}: снят со всех игр.`
          : `${nickname}: отмечен как не участвующий в этом вечере.`);
      } else {
        setMessage(`${nickname}: игры сохранены · к оплате ${total} ₽.`);
      }
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить запись');
    } finally {
      setSaving(false);
    }
  };

  const readonly = plan?.event?.status === 'completed';
  const playerAlreadyInEvening = mode === 'player' && Boolean(playerId) && participantIds.has(playerId);
  const saveDisabled = readonly
    || saving
    || (mode === 'player' ? !playerId : !guestNickname.trim() || !slotIds.length);
  const saveLabel = saving
    ? 'Сохраняю…'
    : mode === 'player' && !slotIds.length
      ? playerAlreadyInEvening ? 'Снять со всех игр' : 'Отметить: не будет'
      : playerAlreadyInEvening ? 'Сохранить изменения игр' : 'Записать на выбранные игры';

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-h-[44px] w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <strong className="block text-[13px] text-text-primary">Добавить игрока / гостя</strong>
          <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">Для тех, кого нет в списке выше: добавь человека и сразу укажи его игры.</span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-border-soft pt-3">
          {loading ? <div className="flex items-center gap-2 py-3 text-[11px] text-text-secondary"><RefreshCw className="h-4 w-4 animate-spin" /> Загружаю состав и игры…</div> : null}
          {error ? <div className="rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
          {message ? <div className="rounded-[11px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</div> : null}

          {!loading && plan ? <>
            <div className="grid grid-cols-2 gap-1 rounded-[11px] bg-surface-2 p-1">
              <button type="button" onClick={() => { setMode('player'); setGuestNickname(''); setGuestPhone(''); }} className={`min-h-[38px] rounded-[9px] text-[11px] font-bold ${mode === 'player' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Игрок клуба</button>
              <button type="button" onClick={() => { setMode('guest'); setPlayerId(''); setSlotIds([]); }} className={`min-h-[38px] rounded-[9px] text-[11px] font-bold ${mode === 'guest' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Новый гость</button>
            </div>

            {mode === 'player' ? (
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-text-muted">Игрок</span>
                <select value={playerId} onChange={(event) => syncSelectionForPlayer(event.target.value)} className="mobile-field">
                  <option value="">Выбери игрока</option>
                  {players.map((player) => <option key={player.id} value={player.id}>{player.nickname}{participantIds.has(player.id) ? ' · уже на вечере' : ''}</option>)}
                </select>
              </label>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={guestNickname} onChange={(event) => setGuestNickname(event.target.value)} placeholder="Никнейм гостя" className="mobile-field" />
                <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Телефон — необязательно" className="mobile-field" />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-text-muted"><span className="font-bold uppercase tracking-[.1em]">Выбранные игры</span><span>{slotIds.length} игр · {total} ₽</span></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {plan.slots.map((slot) => {
                  const selected = slotIds.includes(slot.id);
                  return <button key={slot.id} type="button" onClick={() => toggleSlot(slot.id)} className={`min-h-[52px] rounded-[11px] border px-2 text-left ${selected ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-2 text-text-secondary'}`}>
                    <strong className="block text-[11px]">Игра {slot.slot_number} · {moscowTime(slot.starts_at)}</strong>
                    <span className="mt-0.5 block text-[9px]">{slot.registered_count}/{slot.target_players} · {slot.price} ₽ {selected ? '· ✓' : ''}</span>
                  </button>;
                })}
              </div>
              {maxPrice > 0 ? <p className="mt-2 text-[9px] leading-4 text-text-muted">Для обычного клубного вечера действует максимум {maxPrice} ₽, даже если выбрано больше четырёх игр.</p> : null}
            </div>

            <button type="button" disabled={saveDisabled} onClick={() => void save()} className="min-h-[46px] w-full rounded-[11px] bg-accent text-[12px] font-bold text-white disabled:opacity-40">{saveLabel}</button>
          </> : null}
        </div>
      ) : null}
    </section>
  );
}
