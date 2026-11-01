import { organizerHeaders } from '../../lib/organizerAuth.ts';
import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import type { EveningParticipant } from '../../lib/api';
import { isEveningGameEligible } from '../../lib/eveningRoster';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type Seat = { id: string; slot_id: string; game: number; tableId: string; seat: number; playerId: string; nickname: string; started: number };
type Slot = { id: string; slot_number: number };
type Table = { id: string; name: string; capacity: number };
type Warning = { code: string; text: string };
type Target = { tableId: string; seat: number };

/**
 * «Рассадка на вечер» — laid out like the tournament card (owner, 2026-10-31: «в турнире всё красиво и удобно»): a chip per game,
 * a card per table with one tile per seat (number, avatar, nickname), and a sheet with a searchable list of players to put on
 * a tapped seat. No long list of places and no dropdowns.
 */
export function EveningSeatingEditor({ eveningId, tables, participants }: {
  eveningId: string; tables: Table[]; participants: EveningParticipant[];
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [slotId, setSlotId] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState('');
  const [query, setQuery] = useState('');
  const [warning, setWarning] = useState<Warning[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const root = `/api/evenings/${encodeURIComponent(eveningId)}`;

  const reload = async () => {
    const [plan, assigned] = await Promise.all([
      fetch(`${root}/slots`, { credentials: 'include', headers: organizerHeaders(false) }).then(r => r.json()),
      fetch(`${root}/seating`, { credentials: 'include', headers: organizerHeaders(false) }).then(r => r.json()),
    ]);
    setSlots(plan.slots || []);
    setSeats(assigned.seats || []);
  };
  useEffect(() => { void reload().catch(() => setMessage('Не удалось загрузить рассадку')); }, [eveningId]);
  useEffect(() => { if (!slots.some(s => s.id === slotId)) setSlotId(slots[0]?.id || ''); }, [slots, slotId]);

  const closeSheet = () => { setTarget(null); setPendingPlayerId(''); setWarning([]); setQuery(''); };

  const generate = async (selected = false) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${root}/seating/generate`, {
        method: 'POST', credentials: 'include', headers: organizerHeaders(),
        body: JSON.stringify(selected ? { slot_id: slotId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сформировать план');
      await reload();
      setMessage(`Рассадка обновлена: добавлено ${Number(data.created || 0)} мест`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка генерации'); }
    finally { setBusy(false); }
  };

  const save = async (playerId: string, override = false) => {
    if (busy || !playerId || !slotId || !target) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${root}/seating/player/${encodeURIComponent(playerId)}`, {
        method: 'PUT', credentials: 'include', headers: organizerHeaders(),
        body: JSON.stringify({ slot_id: slotId, table_id: target.tableId, seat_number: target.seat, override }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.requires_override && data.warnings?.length) { setPendingPlayerId(playerId); setWarning(data.warnings); return; }
      if (!res.ok || !data.saved) throw new Error(data.error || 'Не удалось назначить место');
      closeSheet(); setMessage('Место назначено'); await reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка назначения'); }
    finally { setBusy(false); }
  };

  const remove = async (entry: Seat) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${root}/seating/player/${encodeURIComponent(entry.playerId)}/${encodeURIComponent(entry.slot_id)}`, { method: 'DELETE', credentials: 'include', headers: organizerHeaders(false) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Не удалось снять бронь'); }
      closeSheet(); await reload(); setMessage('Назначение снято');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };

  const slotSeats = useMemo(() => seats.filter(entry => entry.slot_id === slotId), [seats, slotId]);
  const seatAt = (tableId: string, seat: number) => slotSeats.find(entry => entry.tableId === tableId && entry.seat === seat);
  const seatedIds = useMemo(() => new Set(slotSeats.map(entry => entry.playerId)), [slotSeats]);

  const targetEntry = target ? seatAt(target.tableId, target.seat) : undefined;
  const targetTable = target ? tables.find(t => t.id === target.tableId) : undefined;
  const slotNumber = slots.find(s => s.id === slotId)?.slot_number;

  // Present players who have not left come first; the rest are still reachable, a judge may seat someone not marked yet.
  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    const all = participants
      .filter(p => p.player_id)
      .filter(p => !needle || (p.nickname || '').toLocaleLowerCase('ru-RU').includes(needle));
    const takenFirst = (p: EveningParticipant) => (seatedIds.has(String(p.player_id)) ? 1 : 0);
    const sort = (a: EveningParticipant, b: EveningParticipant) => takenFirst(a) - takenFirst(b) || a.nickname.localeCompare(b.nickname, 'ru');
    return {
      present: all.filter(p => isEveningGameEligible(p)).sort(sort),
      others: all.filter(p => !isEveningGameEligible(p)).sort(sort),
    };
  }, [participants, query, seatedIds]);

  const playerRow = (p: EveningParticipant, dimmed: boolean) => {
    const taken = seatedIds.has(String(p.player_id));
    const where = taken ? slotSeats.find(entry => entry.playerId === p.player_id) : undefined;
    return <button key={p.id} type="button" disabled={busy || taken}
      data-testid={`seating-pick-${p.player_id}`}
      onClick={() => void save(String(p.player_id))}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-soft bg-surface-2 px-3 text-left disabled:opacity-40 ${dimmed ? 'opacity-70' : ''}`}>
      <PlayerAvatar playerId={p.player_id || undefined} nickname={p.nickname} size="xs" />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[13px] text-text-primary">{p.nickname}</strong>
        {taken && where ? <span className="block text-[11px] text-text-muted">Уже за столом: №{where.seat}</span>
          : p.left_at ? <span className="block text-[11px] text-text-muted">Ушёл с вечера</span>
          : !isEveningGameEligible(p) ? <span className="block text-[11px] text-text-muted">Явка не отмечена</span> : null}
      </span>
    </button>;
  };

  return <section className="mt-4 rounded-2xl border border-border-soft bg-surface-1 p-4 text-text-primary" data-testid="evening-seating-editor">
    <h3 className="text-base font-bold">Рассадка на вечер</h3>
    <p className="mt-1 text-xs text-text-secondary">Нажмите на место, чтобы посадить игрока. Закреплённые места сохраняются; ротацию можно нарушить с предупреждением.</p>

    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void generate(false)} className="min-h-11 flex-1 rounded-xl bg-accent px-3 text-xs font-bold text-white disabled:opacity-40">Сформировать весь вечер</button>
      <button type="button" disabled={busy || !slotId} onClick={() => void generate(true)} className="min-h-11 flex-1 rounded-xl border border-border-soft px-3 text-xs font-bold disabled:opacity-40">Только эту игру</button>
    </div>

    {message && <p role="status" className="mt-2 text-xs text-text-secondary">{message}</p>}

    {slots.length === 0
      ? <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-text-secondary">Игры вечера ещё не созданы: добавьте их в плане вечера, и здесь появится рассадка.</p>
      : <>
        <div className="mt-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-border-soft bg-surface-2 p-1.5" role="tablist" aria-label="Игры вечера">
          {slots.map(s => <button key={s.id} type="button" role="tab" aria-selected={s.id === slotId} onClick={() => setSlotId(s.id)}
            className={`min-h-10 shrink-0 rounded-xl px-3 font-mono text-xs font-bold ${s.id === slotId ? 'bg-accent text-white' : 'text-text-secondary'}`}>Игра {s.slot_number}</button>)}
        </div>

        <div className="mt-3 space-y-4">
          {tables.map(table => {
            const size = Math.min(10, Number(table.capacity || 10));
            const filled = slotSeats.filter(entry => entry.tableId === table.id).length;
            return <div key={table.id} className="rounded-2xl border border-border-soft bg-surface-2/50 p-3" data-testid={`seating-table-${table.id}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm">{table.name}</strong>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-secondary">{filled} / {size}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: size }, (_, i) => i + 1).map(seatNo => {
                  const entry = seatAt(table.id, seatNo);
                  return <button key={seatNo} type="button" data-testid={`seating-seat-${table.id}-${seatNo}`}
                    onClick={() => { setTarget({ tableId: table.id, seat: seatNo }); setWarning([]); setPendingPlayerId(''); }}
                    className={`flex min-h-14 items-center gap-2 rounded-2xl border p-2 text-left max-[399px]:gap-1.5 max-[399px]:p-1.5 ${entry ? 'border-border-soft bg-surface-2' : 'border-dashed border-border-soft bg-transparent'}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent font-mono text-xs font-black text-white max-[399px]:h-6 max-[399px]:w-6">{seatNo}</span>
                    {entry
                      ? <>
                        <span className="max-[479px]:hidden"><PlayerAvatar playerId={entry.playerId} nickname={entry.nickname} size="xs" /></span>
                        <span className="min-w-0 flex-1 break-words text-xs font-bold leading-tight max-[399px]:text-[11px] text-text-primary">{entry.nickname}</span>
                      </>
                      : <span className="flex items-center gap-1.5 text-xs text-text-muted"><UserPlus className="h-3.5 w-3.5" aria-hidden="true" />Свободно</span>}
                  </button>;
                })}
              </div>
            </div>;
          })}
        </div>
      </>}

    <MobileSheet
      open={Boolean(target)}
      onClose={closeSheet}
      title={target ? `Игра ${slotNumber ?? ''} · ${targetTable?.name || 'Стол'} · место №${target.seat}` : ''}
      subtitle={targetEntry ? `Сейчас: ${targetEntry.nickname}` : 'Выберите игрока'}
      widthClass="sm:max-w-lg"
    >
      {targetEntry
        ? <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-2 p-3">
            <PlayerAvatar playerId={targetEntry.playerId} nickname={targetEntry.nickname} size="sm" />
            <strong className="min-w-0 flex-1 truncate text-sm">{targetEntry.nickname}</strong>
          </div>
          {targetEntry.started
            ? <p className="text-xs text-text-secondary">Игра уже началась, место изменить нельзя.</p>
            : <button type="button" disabled={busy} onClick={() => void remove(targetEntry)} data-testid="seating-remove"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-soft text-sm font-bold text-text-secondary disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" />Снять с места</button>}
        </div>
        : <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти игрока" aria-label="Найти игрока"
              className="min-h-11 w-full rounded-xl border border-border-soft bg-surface-2 pl-9 pr-3 text-sm" />
          </label>
          {warning.length > 0 && <div role="alert" className="rounded-xl border border-amber-400/30 p-3 text-xs">
            {warning.map(w => <p key={w.code}>{w.text}</p>)}
            <button disabled={busy} type="button" onClick={() => void save(pendingPlayerId, true)} className="mt-2 min-h-10 rounded-lg bg-amber-500/20 px-3 font-bold">Всё равно посадить</button>
          </div>}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">На вечере · {candidates.present.length}</div>
            {candidates.present.map(p => playerRow(p, false))}
            {!candidates.present.length && <p className="text-xs text-text-secondary">Никого не найдено среди пришедших.</p>}
          </div>
          {candidates.others.length > 0 && <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Не отмечены или ушли · {candidates.others.length}</div>
            {candidates.others.map(p => playerRow(p, true))}
          </div>}
        </div>}
    </MobileSheet>
  </section>;
}
