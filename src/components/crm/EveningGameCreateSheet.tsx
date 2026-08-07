import React, { useMemo, useState } from 'react';
import { Check, Search, Shuffle, Users, X } from 'lucide-react';
import type { EveningParticipant, EveningTable, GameEvening } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { isEveningGameEligible, sortEveningRoster, toggleParticipantInSeats } from '../../lib/eveningRoster';
import { PlayerAvatar } from '../ui/PlayerAvatar';

interface EveningGameCreateSheetProps {
  evening: GameEvening;
  tables: EveningTable[];
  participants: EveningParticipant[];
  onClose: () => void;
  onCreated: (game: ClubGameRecord) => void;
}

type PlayerFilter = 'all' | 'attended' | 'confirmed';

export const EveningGameCreateSheet: React.FC<EveningGameCreateSheetProps> = ({ evening, tables, participants, onClose, onCreated }) => {
  const [selectedTableId, setSelectedTableId] = useState(tables[0]?.id || '');
  const [judgeName, setJudgeName] = useState(tables[0]?.host_name || '');
  const [seats, setSeats] = useState<string[]>(Array(10).fill(''));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [creating, setCreating] = useState(false);

  const eligible = useMemo(() => sortEveningRoster(participants.filter(isEveningGameEligible)), [participants]);
  const byId = useMemo(() => new Map(participants.map((participant) => [participant.id, participant])), [participants]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return eligible.filter((participant) => {
      if (filter === 'attended' && participant.attendance_status !== 'attended') return false;
      if (filter === 'confirmed' && participant.registration_status !== 'confirmed') return false;
      if (q && !participant.nickname.toLocaleLowerCase('ru-RU').includes(q)) return false;
      return true;
    });
  }, [eligible, filter, query]);

  const selectedCount = seats.filter(Boolean).length;

  const changeTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const table = tables.find((item) => item.id === tableId);
    if (table?.host_name) setJudgeName(table.host_name);
  };

  const toggle = (participantId: string) => {
    setSeats((previous) => toggleParticipantInSeats(previous, participantId));
  };

  const clearSeat = (index: number) => {
    setSeats((previous) => previous.map((value, seatIndex) => seatIndex === index ? '' : value));
  };

  const shuffleSelected = () => {
    const selected = seats.filter(Boolean);
    if (selected.length < 2) return;
    const shuffled = selected.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setSeats([...shuffled, ...Array(10 - shuffled.length).fill('')]);
  };

  const create = async () => {
    if (creating || selectedCount !== 10) return;
    setCreating(true);
    try {
      const created = await clubGamesApi.create(evening.id, {
        evening_table_id: selectedTableId || null,
        judge_name: judgeName.trim() || null,
        seats: seats.map((participantId, index) => ({ participant_id: participantId, seat_number: index + 1 })),
      });
      onCreated(created);
    } catch (err: any) {
      alert(err.message || 'Не удалось создать игру');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-2xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl border border-slate-700 bg-slate-900 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h3 className="text-lg font-black text-white">Новая игра</h3><p className="text-[10px] text-slate-400 mt-0.5">Выбери площадку и 10 игроков из общего состава вечера. Никакой привязки игрока к столу.</p></div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[9px] uppercase font-black text-slate-500">Стол<select value={selectedTableId} onChange={(e) => changeTable(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"><option value="">Без указания</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
          <label className="text-[9px] uppercase font-black text-slate-500">Ведущий<input value={judgeName} onChange={(e) => setJudgeName(e.target.value)} placeholder="Имя" className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white" /></label>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-2.5 space-y-2">
          <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400"><Users className="w-3.5 h-3.5" />Состав игры · {selectedCount}/10</div><button type="button" onClick={shuffleSelected} disabled={selectedCount < 2} className="text-[9px] font-black text-slate-500 disabled:opacity-30 flex items-center gap-1"><Shuffle className="w-3 h-3" />Перемешать</button></div>
          <div className="grid grid-cols-5 gap-1.5">
            {seats.map((participantId, index) => {
              const participant = participantId ? byId.get(participantId) : null;
              return <button key={index} type="button" onClick={() => participantId && clearSeat(index)} className={`min-h-[52px] rounded-xl border p-1.5 text-center ${participant ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/70'}`}><span className="block text-[8px] font-mono text-slate-500">#{index + 1}</span><span className={`block text-[9px] font-black truncate mt-1 ${participant ? 'text-white' : 'text-slate-700'}`}>{participant?.nickname || '—'}</span></button>;
            })}
          </div>
          <p className="text-[9px] text-slate-600">Места заполняются в порядке нажатия. Нажми на заполненное место, чтобы освободить его.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          {([['all', `Все ${eligible.length}`], ['attended', 'Пришли'], ['confirmed', 'Подтв.']] as Array<[PlayerFilter, string]>).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-9 rounded-lg text-[9px] font-black ${filter === id ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{label}</button>)}
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск игрока" className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none" /></div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 pr-1 content-start">
          {visible.map((participant) => {
            const seatIndex = seats.indexOf(participant.id);
            const selected = seatIndex >= 0;
            return <button key={participant.id} type="button" onClick={() => toggle(participant.id)} className={`rounded-xl border p-2.5 flex items-center gap-2 text-left min-w-0 ${selected ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 bg-slate-950'}`}><PlayerAvatar nickname={participant.nickname} playerId={participant.player_id} forceStoredLookup size="sm" /><div className="min-w-0 flex-1"><strong className="block text-[11px] text-white truncate">{participant.nickname}</strong><span className={`text-[8px] ${participant.attendance_status === 'attended' ? 'text-emerald-400' : participant.registration_status === 'confirmed' ? 'text-sky-400' : 'text-slate-500'}`}>{participant.attendance_status === 'attended' ? 'Пришёл' : participant.registration_status === 'confirmed' ? 'Подтверждён' : 'На вечере'}</span></div>{selected && <span className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">{seatIndex + 1}</span>}</button>;
          })}
          {visible.length === 0 && <div className="col-span-2 py-8 text-center text-xs text-slate-500">Игроков не найдено</div>}
        </div>

        <button type="button" disabled={selectedCount !== 10 || creating} onClick={create} className="w-full min-h-12 rounded-xl bg-rose-600 disabled:opacity-35 text-white text-sm font-black">{creating ? 'Создаём…' : selectedCount === 10 ? 'Создать игру' : `Выбери ещё ${10 - selectedCount}`}</button>
      </div>
    </div>
  );
};
