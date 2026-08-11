import React, { useEffect, useMemo, useState } from 'react';
import { Search, Shuffle, Users, X } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening, type Player } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { isEveningGameEligible, sortEveningRoster, toggleParticipantInSeats } from '../../lib/eveningRoster';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { JudgeAssignmentFields, type JudgeIdentityMode } from './JudgeAssignmentFields';

interface EveningGameCreateSheetProps {
  evening: GameEvening;
  tables: EveningTable[];
  participants: EveningParticipant[];
  onClose: () => void;
  onCreated: (game: ClubGameRecord) => void;
}

type PlayerFilter = 'all' | 'attended' | 'confirmed';

const playerCanJudgeFormat = (player: Player, format: string) => {
  const level = String((player as any).judge_level || 'none');
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return level === 'trainee' || level === 'host' || level === 'judge';
  if (normalized === 'CASUAL') return level === 'host' || level === 'judge';
  return level === 'judge';
};

export const EveningGameCreateSheet: React.FC<EveningGameCreateSheetProps> = ({ evening, tables, participants, onClose, onCreated }) => {
  const [selectedTableId, setSelectedTableId] = useState(tables[0]?.id || '');
  const [judgeMode, setJudgeMode] = useState<JudgeIdentityMode>('external');
  const [judgePlayerId, setJudgePlayerId] = useState('');
  const [judgeName, setJudgeName] = useState(tables[0]?.host_name || '');
  const [crmPlayers, setCrmPlayers] = useState<Player[]>([]);
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
      return !q || participant.nickname.toLocaleLowerCase('ru-RU').includes(q);
    });
  }, [eligible, filter, query]);
  const selectedCount = seats.filter(Boolean).length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void api.getPlayers()
      .then((items) => setCrmPlayers(items
        .filter((player) => playerCanJudgeFormat(player, evening.format))
        .slice()
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'))))
      .catch(() => setCrmPlayers([]));
    return () => { document.body.style.overflow = previousOverflow; };
  }, [evening.format]);

  const changeTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const table = tables.find((item) => item.id === tableId);
    if (table?.host_name) {
      setJudgeMode('external');
      setJudgePlayerId('');
      setJudgeName(table.host_name);
    }
  };

  const toggle = (participantId: string) => setSeats((previous) => toggleParticipantInSeats(previous, participantId));
  const clearSeat = (index: number) => setSeats((previous) => previous.map((value, seatIndex) => seatIndex === index ? '' : value));
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
    if (creating || selectedCount !== 10 || (judgeMode === 'linked' && !judgePlayerId)) return;
    setCreating(true);
    try {
      const linkedJudge = judgeMode === 'linked'
        ? crmPlayers.find((player) => String(player.id) === String(judgePlayerId))
        : null;
      const created = await clubGamesApi.create(evening.id, {
        evening_table_id: selectedTableId || null,
        judge_player_id: judgeMode === 'linked' ? judgePlayerId : null,
        judge_name: judgeMode === 'linked' ? (linkedJudge?.nickname || null) : (judgeName.trim() || null),
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
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[100dvh] w-full min-w-0 flex-col gap-3 overflow-x-hidden rounded-t-3xl border border-slate-700 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-3xl sm:pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h3 className="text-lg font-black text-white">Новая игра</h3><p className="mt-0.5 text-[10px] text-slate-400">Выбери площадку, ведущего нужного уровня и 10 игроков из общего состава вечера.</p></div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 sm:h-9 sm:w-9"><X className="h-4 w-4" /></button>
        </div>

        <label className="text-[9px] font-black uppercase text-slate-500">Стол<select value={selectedTableId} onChange={(event) => changeTable(event.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-white"><option value="">Без указания</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
          <JudgeAssignmentFields
            mode={judgeMode}
            players={crmPlayers}
            judgePlayerId={judgePlayerId}
            judgeName={judgeName}
            disabled={creating}
            onModeChange={(mode) => { setJudgeMode(mode); if (mode === 'external') setJudgePlayerId(''); }}
            onJudgePlayerIdChange={setJudgePlayerId}
            onJudgeNameChange={setJudgeName}
          />
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-2.5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400"><Users className="h-3.5 w-3.5" />Состав игры · {selectedCount}/10</div><button type="button" onClick={shuffleSelected} disabled={selectedCount < 2} className="flex items-center gap-1 text-[9px] font-black text-slate-500 disabled:opacity-30"><Shuffle className="h-3 w-3" />Перемешать</button></div>
          <div className="grid grid-cols-5 gap-1.5">
            {seats.map((participantId, index) => {
              const participant = participantId ? byId.get(participantId) : null;
              return <button key={index} type="button" onClick={() => participantId && clearSeat(index)} className={`min-h-[52px] min-w-0 rounded-xl border p-1.5 text-center ${participant ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/70'}`}><span className="block text-[8px] font-mono text-slate-500">#{index + 1}</span><span className={`mt-1 block truncate text-[9px] font-black ${participant ? 'text-white' : 'text-slate-700'}`}>{participant?.nickname || '—'}</span></button>;
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          {([['all', `Все ${eligible.length}`], ['attended', 'Пришли'], ['confirmed', 'Подтв.']] as Array<[PlayerFilter, string]>).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-11 rounded-lg text-[9px] font-black ${filter === id ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{label}</button>)}
        </div>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск игрока" className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none" /></div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
          {visible.map((participant) => {
            const seatIndex = seats.indexOf(participant.id); const selected = seatIndex >= 0;
            return <button key={participant.id} type="button" onClick={() => toggle(participant.id)} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left ${selected ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 bg-slate-950'}`}><PlayerAvatar nickname={participant.nickname} playerId={participant.player_id} forceStoredLookup size="sm" /><div className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-white">{participant.nickname}</strong><span className="text-[8px] text-slate-500">{participant.attendance_status === 'attended' ? 'Пришёл' : participant.registration_status === 'confirmed' ? 'Подтверждён' : 'На вечере'}</span></div>{selected && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-[10px] font-black text-white">{seatIndex + 1}</span>}</button>;
          })}
          {visible.length === 0 && <div className="col-span-2 py-8 text-center text-xs text-slate-500">Игроков не найдено</div>}
        </div>
        <button type="button" disabled={selectedCount !== 10 || creating || (judgeMode === 'linked' && !judgePlayerId)} onClick={create} className="min-h-12 w-full rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-35">{creating ? 'Создаём…' : selectedCount === 10 ? 'Создать игру' : `Выбери ещё ${10 - selectedCount}`}</button>
      </div>
    </div>
  );
};