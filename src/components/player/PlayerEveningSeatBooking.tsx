import { useCallback, useEffect, useState } from 'react';

type GameOption = { id: string; slot_number: number };
type TableOption = { id: string; name: string; capacity: number };
type Occupied = { slot_id: string; table_id: string; seat_number: number; own: boolean };
type Booking = { slot_id: string; tableId: string; seat: number; game: number };

export default function PlayerEveningSeatBooking({ eveningId, selectedGames, games }: {
  eveningId: string;
  selectedGames: string[];
  games: GameOption[];
}) {
  const [tables, setTables] = useState<TableOption[]>([]);
  const [occupied, setOccupied] = useState<Occupied[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotId, setSlotId] = useState('');
  const [tableId, setTableId] = useState('');
  const [seat, setSeat] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const root = `/api/evenings/${encodeURIComponent(eveningId)}/seating`;
    const [choices, mine] = await Promise.all([
      fetch(`${root}/options`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('Не удалось загрузить места'); return r.json(); }),
      fetch(`${root}/me`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('Не удалось загрузить брони'); return r.json(); }),
    ]);
    setTables(choices.tables || []);
    setOccupied(choices.occupied || []);
    setBookings(mine.seats || []);
    setLoading(false);
  }, [eveningId]);
  useEffect(() => { let active = true; void load().catch(() => { if (active) { setMessage('Не удалось загрузить места'); setLoading(false); } }); return () => { active = false; }; }, [load]);
  useEffect(() => { if (!selectedGames.includes(slotId)) setSlotId(selectedGames[0] || ''); }, [selectedGames, slotId]);
  useEffect(() => { if (!tables.some(t => t.id === tableId)) setTableId(tables[0]?.id || ''); }, [tables, tableId]);
  const table = tables.find(t => t.id === tableId);
  const occupiedHere = occupied.filter(x => x.slot_id === slotId && x.table_id === tableId);
  const mine = bookings.find(x => x.slot_id === slotId);
  const save = async (remove = false) => {
    if (!slotId || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/seating/me${remove ? `/${encodeURIComponent(slotId)}` : ''}`, {
        method: remove ? 'DELETE' : 'PUT',
        credentials: 'include',
        ...(remove ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot_id: slotId, table_id: tableId, seat_number: seat }) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.warnings?.map((w: { text: string }) => w.text).join('; ') || result?.error || 'Не удалось сохранить');
      await load();
      setMessage(remove ? 'Бронь снята' : 'Место забронировано');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка бронирования'); }
    finally { setBusy(false); }
  };
  if (!selectedGames.length) return null;
  return (
    <section aria-label="Бронирование места" className="mt-3 rounded-[24px] border border-white/10 bg-white/[0.035] p-3 text-white">
      <h3 className="text-sm font-semibold">Забронировать место</h3>
      <p className="mt-1 text-xs text-white/50">Выбери игру, стол и свободное место заранее. Бронь сохраняется при автоматической рассадке.</p>
      {loading ? <p className="mt-3 text-xs text-white/50">Загружаем места…</p> : (
        <div className="mt-3 space-y-3">
          <label className="block text-xs text-white/70">Игра
            <select className="mt-1 min-h-11 w-full rounded-xl bg-[#20222a] px-3 text-white" value={slotId} onChange={e => setSlotId(e.target.value)}>
              {games.filter(g => selectedGames.includes(g.id)).map(g => <option key={g.id} value={g.id}>Игра {g.slot_number}</option>)}
            </select>
          </label>
          <label className="block text-xs text-white/70">Стол
            <select className="mt-1 min-h-11 w-full rounded-xl bg-[#20222a] px-3 text-white" value={tableId} onChange={e => setTableId(e.target.value)}>
              {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {table ? <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: Math.max(0, table.capacity) }, (_, i) => i + 1).map(n => {
              const taken = occupiedHere.find(x => x.seat_number === n);
              return <button type="button" key={n} disabled={Boolean(taken && !taken.own)} onClick={() => setSeat(n)}
                aria-label={`Место №${n}`}
                className={`min-h-11 rounded-xl border text-xs font-semibold disabled:opacity-25 ${seat === n ? 'border-white bg-white/20' : 'border-white/10 bg-white/[0.04]'}`}>{n}{taken?.own ? ' ✓' : ''}</button>;
            })}
          </div> : <p className="text-xs text-white/40">Столы ещё не добавлены</p>}
          {mine ? <p className="text-xs text-emerald-200/80">Твоя бронь: {tables.find(t => t.id === mine.tableId)?.name || 'Стол'} · место №{mine.seat}</p> : null}
          {message ? <p role="status" className="text-xs text-white/80">{message}</p> : null}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !table || !slotId} onClick={() => void save()}
              className="min-h-11 flex-1 rounded-xl bg-white px-3 text-xs font-bold text-black disabled:opacity-40">{busy ? 'Сохраняем…' : 'Забронировать'}</button>
            {mine ? <button type="button" disabled={busy} onClick={() => void save(true)}
              className="min-h-11 rounded-xl border border-white/15 px-3 text-xs">Снять бронь</button> : null}
          </div>
        </div>
      )}
    </section>
  );
}
