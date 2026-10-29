import { organizerHeaders } from '../../lib/organizerAuth.ts';
import { useEffect, useState } from 'react';

type Seat = { id: string; slot_id: string; game: number; tableId: string; seat: number; playerId: string; nickname: string; started: number };
type Slot = { id: string; slot_number: number };
type Table = { id: string; name: string; capacity: number };
type Participant = { player_id?: string | null; nickname?: string; display_name?: string };
type Warning = { code: string; text: string };

export function EveningSeatingEditor({ eveningId, tables, participants }: {
  eveningId: string; tables: Table[]; participants: Participant[];
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [slotId, setSlotId] = useState('');
  const [tableId, setTableId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [seatNumber, setSeatNumber] = useState(1);
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
  useEffect(() => { if (!tables.some(t => t.id === tableId)) setTableId(tables[0]?.id || ''); }, [tables, tableId]);
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
  const save = async (override = false) => {
    if (busy || !playerId || !slotId || !tableId) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${root}/seating/player/${encodeURIComponent(playerId)}`, {
        method: 'PUT', credentials: 'include', headers: organizerHeaders(false), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId, table_id: tableId, seat_number: seatNumber, override }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.requires_override && data.warnings?.length) { setWarning(data.warnings); return; }
      if (!res.ok || !data.saved) throw new Error(data.error || 'Не удалось назначить место');
      setWarning([]); setMessage('Место назначено'); await reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка назначения'); }
    finally { setBusy(false); }
  };
  const remove = async (entry: Seat) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${root}/seating/player/${encodeURIComponent(entry.playerId)}/${encodeURIComponent(entry.slot_id)}`, { method: 'DELETE', credentials: 'include', headers: organizerHeaders(false) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Не удалось снять бронь'); }
      await reload(); setMessage('Назначение снято');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };
  const players = participants.filter(p => p.player_id);
  return <section className="mt-4 rounded-2xl border border-border-soft bg-surface-1 p-4 text-text-primary">
    <h3 className="text-base font-bold">Рассадка на вечер</h3>
    <p className="mt-1 text-xs text-text-secondary">Заранее закреплённые места сохраняются. Организатор может нарушить ротацию с предупреждением.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void generate(false)} className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3 text-xs font-bold">Сформировать весь вечер</button>
      <button type="button" disabled={busy || !slotId} onClick={() => void generate(true)} className="min-h-11 flex-1 rounded-xl border border-border-soft px-3 text-xs font-bold">Только выбранную игру</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <label className="text-xs">Игра<select value={slotId} onChange={e => { setSlotId(e.target.value); setWarning([]); }} className="mt-1 w-full rounded-lg bg-surface-2 p-2">
        {slots.map(s => <option key={s.id} value={s.id}>Игра №{s.slot_number}</option>)}
      </select></label>
      <label className="text-xs">Стол<select value={tableId} onChange={e => { setTableId(e.target.value); setWarning([]); }} className="mt-1 w-full rounded-lg bg-surface-2 p-2">
        {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      <label className="text-xs">Игрок<select value={playerId} onChange={e => { setPlayerId(e.target.value); setWarning([]); }} className="mt-1 w-full rounded-lg bg-surface-2 p-2">
        <option value="">Выбрать игрока</option>
        {players.map(p => <option key={p.player_id} value={p.player_id!}>{p.nickname || p.display_name || 'Игрок'}</option>)}
      </select></label>
      <label className="text-xs">Место<select value={seatNumber} onChange={e => { setSeatNumber(Number(e.target.value)); setWarning([]); }} className="mt-1 w-full rounded-lg bg-surface-2 p-2">
        {Array.from({ length: Math.min(10, Number(tables.find(t => t.id === tableId)?.capacity || 10)) }, (_, i) => <option key={i} value={i + 1}>№{i + 1}</option>)}
      </select></label>
    </div>
    {warning.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-amber-400/30 p-3 text-xs">
      {warning.map(w => <p key={w.code}>{w.text}</p>)}
      <button disabled={busy} type="button" onClick={() => void save(true)} className="mt-2 rounded-lg bg-amber-500/20 p-2 font-bold">Всё равно назначить</button>
    </div>}
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    <button disabled={busy || !slotId || !tableId || !playerId} type="button" onClick={() => void save()} className="mt-3 min-h-11 w-full rounded-xl bg-surface-2 p-2 text-sm font-bold disabled:opacity-40">Назначить место</button>
    <div className="mt-4 space-y-2">{seats.map(entry => <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 p-2 text-xs">
      <span>Игра {entry.game} · {tables.find(t => t.id === entry.tableId)?.name || 'Стол'} · №{entry.seat} — {entry.nickname}</span>
      {!entry.started && <button type="button" disabled={busy} onClick={() => void remove(entry)} className="min-h-9 rounded-lg px-2 text-text-secondary underline">Снять</button>}
    </div>)}</div>
  </section>;
}
