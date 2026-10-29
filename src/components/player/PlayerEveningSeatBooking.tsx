import { useCallback, useEffect, useState } from 'react';

type Table = { id: string; name: string; capacity: number };
type Occupied = { slot_id: string; table_id: string; seat_number: number; own: boolean };
type Booking = { slot_id: string; tableId: string; seat: number };

export default function PlayerEveningSeatBooking({
  eveningId, slotId, gameNumber, startsAt, registered, onBack, onEnroll, onChanged,
}: {
  eveningId: string;
  slotId: string;
  gameNumber: number;
  startsAt: string;
  registered: boolean;
  onBack: () => void;
  onEnroll: () => Promise<boolean>;
  onChanged: () => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [occupied, setOccupied] = useState<Occupied[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tableId, setTableId] = useState('');
  const [seat, setSeat] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const root = `/api/evenings/${encodeURIComponent(eveningId)}/seating`;
    const [choices, mine] = await Promise.all([
      fetch(`${root}/options`, { credentials: 'include' }).then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить места');
        return response.json();
      }),
      fetch(`${root}/me`, { credentials: 'include' }).then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить бронь');
        return response.json();
      }),
    ]);
    setTables(choices.tables || []);
    setOccupied(choices.occupied || []);
    setBookings(mine.seats || []);
    setLoading(false);
  }, [eveningId]);

  useEffect(() => {
    let active = true;
    void load().catch(() => { if (active) { setMessage('Не удалось загрузить рассадку'); setLoading(false); } });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!tables.some(t => t.id === tableId)) setTableId(tables[0]?.id || '');
  }, [tableId, tables]);

  const own = bookings.find(booking => booking.slot_id === slotId);
  const table = tables.find(item => item.id === tableId);
  const occupiedHere = occupied.filter(item => item.slot_id === slotId && item.table_id === tableId);
  const formatTime = new Date(startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

  const save = async (remove = false) => {
    if (busy || (!remove && (!registered || !tableId || !seat))) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/seating/me${remove ? `/${encodeURIComponent(slotId)}` : ''}`, {
        method: remove ? 'DELETE' : 'PUT',
        credentials: 'include',
        ...(remove ? {} : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot_id: slotId, table_id: tableId, seat_number: seat }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.warnings?.map((warning: { text: string }) => warning.text).join('; ') || data.error || 'Не удалось сохранить место');
      await load();
      onChanged();
      setMessage(remove ? 'Бронь снята' : 'Место забронировано');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка бронирования');
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label={`Рассадка игры №${gameNumber}`} className="mt-3 min-h-[65vh] text-white">
    <button type="button" onClick={onBack} className="min-h-11 rounded-xl bg-white/[0.07] px-4 text-xs font-semibold">← К списку игр</button>
    <header className="mt-4">
      <h2 className="text-xl font-semibold">Игра №{gameNumber}</h2>
      <p className="mt-1 text-sm text-white/50">{formatTime} · Выбор места</p>
    </header>
    {!registered && <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm text-white/70">Чтобы забронировать место, сначала запишись на эту игру.</p>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const ok = await onEnroll();
          if (!ok) setMessage('Не удалось записаться на игру');
        } finally { setBusy(false); }
      }} className="mt-3 min-h-12 w-full rounded-xl bg-white px-4 text-sm font-bold text-black disabled:opacity-50">Записаться на игру</button>
    </div>}
    {loading ? <p className="mt-5 text-sm text-white/50">Загружаем места…</p> : <div className="mt-4 space-y-4">
      {tables.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label="Выбор стола">
        {tables.map(item => <button type="button" key={item.id} onClick={() => { setTableId(item.id); setSeat(null); setMessage(''); }}
          className={`min-h-11 rounded-xl border px-4 text-sm ${item.id === tableId ? 'border-white/60 bg-white/15' : 'border-white/10 bg-white/[0.04]'}`}>{item.name}</button>)}
      </div>}
      {table ? <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-center text-sm font-semibold">{table.name}</p>
        <div className="mx-auto my-5 grid h-24 w-24 place-items-center rounded-full border-2 border-white/15 bg-white/[0.06] text-xs text-white/40">СТОЛ</div>
        <div className="grid grid-cols-5 gap-2" aria-label="Места за столом">
          {Array.from({ length: Math.max(0, table.capacity) }, (_, index) => index + 1).map(number => {
            const occupant = occupiedHere.find(item => item.seat_number === number);
            const isOwn = Boolean(occupant?.own);
            const unavailable = Boolean(occupant && !isOwn);
            const selected = seat === number || (seat === null && isOwn);
            return <button key={number} type="button" aria-label={`Место №${number}${unavailable ? ', занято' : isOwn ? ', моё' : ', свободно'}`}
              disabled={!registered || unavailable || busy} onClick={() => { setSeat(number); setMessage(''); }}
              className={`min-h-12 rounded-xl border text-sm font-bold disabled:cursor-not-allowed ${unavailable ? 'border-white/5 bg-white/[0.025] text-white/25' : selected ? 'border-emerald-300/70 bg-emerald-300/15 text-emerald-100' : 'border-white/15 bg-[#242630] text-white'}`}>
              {number}{isOwn ? ' ✓' : ''}
            </button>;
          })}
        </div>
        <p className="mt-4 text-center text-xs text-white/45">Свободно · Занято · Моё место ✓</p>
      </div> : <p className="text-sm text-white/50">Для этого вечера столы пока не созданы.</p>}
      {own && <p className="text-sm text-emerald-200">Твоя бронь: {tables.find(item => item.id === own.tableId)?.name || 'Стол'} · место №{own.seat}</p>}
      {message && <p role="status" className="rounded-xl bg-white/[0.06] p-3 text-sm">{message}</p>}
      {registered && <div className="flex gap-2">
        <button type="button" disabled={busy || !table || !seat} onClick={() => void save()}
          className="min-h-12 flex-1 rounded-xl bg-white px-3 text-sm font-bold text-black disabled:opacity-40">{busy ? 'Сохраняем…' : own ? 'Изменить место' : 'Забронировать место'}</button>
        {own && <button type="button" disabled={busy} onClick={() => void save(true)} className="min-h-12 rounded-xl border border-white/15 px-3 text-sm">Снять бронь</button>}
      </div>}
    </div>}
  </section>;
}
