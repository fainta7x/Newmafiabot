import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Gamepad2, Plus, Trash2, Users, X } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { EveningGameProtocolModal } from './EveningGameProtocolModal';

interface EveningGamesViewProps {
  eveningId: string;
  onBack: () => void;
}

export const EveningGamesView: React.FC<EveningGamesViewProps> = ({ eveningId, onBack }) => {
  const [evening, setEvening] = useState<(GameEvening & { participants?: EveningParticipant[]; tables?: EveningTable[] }) | null>(null);
  const [games, setGames] = useState<ClubGameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [seatParticipantIds, setSeatParticipantIds] = useState<string[]>(Array(10).fill(''));
  const [activeGame, setActiveGame] = useState<ClubGameRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [eveningData, gameData] = await Promise.all([
        api.getEvening(eveningId) as any,
        clubGamesApi.list(eveningId),
      ]);
      setEvening(eveningData);
      setGames(gameData.filter((game) => Boolean(game.club_protocol)));
    } catch (err: any) {
      alert(err.message || 'Не удалось загрузить игры вечера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eveningId]);

  const tables = evening?.tables || [];
  const participants = evening?.participants || [];
  const selectedTable = tables.find((table) => table.id === selectedTableId) || null;

  const tableParticipants = useMemo(() => participants.filter((participant) => {
    if (!selectedTableId || participant.table_id !== selectedTableId) return false;
    if (participant.registration_status === 'cancelled' || participant.registration_status === 'waitlist') return false;
    if (participant.attendance_status === 'no_show') return false;
    return true;
  }), [participants, selectedTableId]);

  const openCreate = () => {
    const initialTable = tables[0] || null;
    const initialParticipants = initialTable
      ? participants.filter((participant) => participant.table_id === initialTable.id && participant.registration_status !== 'cancelled' && participant.registration_status !== 'waitlist' && participant.attendance_status !== 'no_show')
      : [];
    setSelectedTableId(initialTable?.id || '');
    setJudgeName(initialTable?.host_name || '');
    setSeatParticipantIds(Array.from({ length: 10 }, (_, index) => initialParticipants[index]?.id || ''));
    setShowCreate(true);
  };

  const handleTableChange = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId) || null;
    const eligible = participants.filter((participant) => participant.table_id === tableId && participant.registration_status !== 'cancelled' && participant.registration_status !== 'waitlist' && participant.attendance_status !== 'no_show');
    setSelectedTableId(tableId);
    setJudgeName(table?.host_name || '');
    setSeatParticipantIds(Array.from({ length: 10 }, (_, index) => eligible[index]?.id || ''));
  };

  const updateSeat = (seatIndex: number, participantId: string) => {
    setSeatParticipantIds((previous) => previous.map((value, index) => index === seatIndex ? participantId : value));
  };

  const createGame = async () => {
    if (!selectedTableId) return alert('Выберите игровой стол');
    if (seatParticipantIds.some((id) => !id) || new Set(seatParticipantIds).size !== 10) {
      return alert('Для игры нужно выбрать 10 разных игроков');
    }
    setCreating(true);
    try {
      const created = await clubGamesApi.create(eveningId, {
        evening_table_id: selectedTableId,
        judge_name: judgeName || null,
        seats: seatParticipantIds.map((participantId, index) => ({ participant_id: participantId, seat_number: index + 1 })),
      });
      setGames((previous) => [created, ...previous]);
      setShowCreate(false);
      setActiveGame(created);
    } catch (err: any) {
      alert(err.message || 'Не удалось создать игру');
    } finally {
      setCreating(false);
    }
  };

  const deleteDraft = async (game: ClubGameRecord) => {
    if (!confirm('Удалить черновик этой игры?')) return;
    try {
      await clubGamesApi.deleteDraft(game.id);
      setGames((previous) => previous.filter((item) => item.id !== game.id));
    } catch (err: any) {
      alert(err.message || 'Не удалось удалить черновик');
    }
  };

  const localNumberById = useMemo(() => {
    const chronological = [...games].sort((a, b) => a.id - b.id);
    return new Map(chronological.map((game, index) => [game.id, index + 1]));
  }, [games]);

  if (loading || !evening) {
    return <div className="py-16 text-center text-sm text-slate-400">Загрузка игр вечера…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-300 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-rose-400" />
                <h2 className="text-xl font-black text-white">Игры · {evening.title}</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">{new Date(evening.starts_at).toLocaleDateString('ru-RU')} {evening.venue ? `• ${evening.venue}` : ''}</p>
            </div>
          </div>
          <button type="button" onClick={openCreate} disabled={tables.length === 0} className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-40">
            <Plus className="w-4 h-4" />Новая игра
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Всего игр</span><strong className="text-lg text-white">{games.length}</strong></div>
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Завершено</span><strong className="text-lg text-emerald-400">{games.filter((game) => game.status === 'completed').length}</strong></div>
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Черновики</span><strong className="text-lg text-amber-400">{games.filter((game) => game.status === 'draft').length}</strong></div>
        </div>
      </div>

      <div className="space-y-3">
        {games.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-10 text-center space-y-2">
            <Gamepad2 className="w-10 h-10 text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-300">На этом вечере ещё нет игр</div>
            <div className="text-xs text-slate-500">Создай первую игру, выбери стол и рассадку — дальше откроется тот же формат протокола: игроки, голосования, ночи/ЛХ и итог.</div>
          </div>
        ) : games.map((game) => {
          const protocol = game.club_protocol?.protocol;
          const results = game.club_protocol?.player_results || [];
          const localNumber = localNumberById.get(game.id) || 1;
          return (
            <div key={game.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm text-white">Игра {localNumber}</strong>
                    <span className="text-[10px] text-slate-500 font-mono">#{game.global_game_number}</span>
                    <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${game.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>{game.status === 'completed' ? 'Завершена' : 'Черновик'}</span>
                    {protocol?.winner_team && <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${protocol.winner_team === 'red' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-950 text-slate-300'}`}>Победа {protocol.winner_team === 'red' ? 'красных' : 'чёрных'}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{game.table_name || 'Без стола'}{game.judge_name ? ` • Ведущий: ${game.judge_name}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  {game.status === 'draft' && <button type="button" onClick={() => deleteDraft(game)} className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-rose-400 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
                  <button type="button" onClick={() => setActiveGame(game)} className="min-h-[40px] px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white text-xs font-black flex items-center gap-1.5">{game.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Gamepad2 className="w-4 h-4 text-rose-400" />}{game.status === 'completed' ? 'Открыть протокол' : 'Продолжить игру'}</button>
                </div>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => (
                  <div key={player.participant_id} className="bg-slate-950 border border-slate-850 rounded-xl p-1.5 text-center min-w-0">
                    <div className="text-[9px] text-slate-500 font-mono">#{player.seat_number}</div>
                    <div className="text-[9px] text-white font-bold truncate">{player.display_name}</div>
                    <div className="text-[8px] text-slate-500 truncate">{player.role === 'citizen' ? 'Мирный' : player.role === 'sheriff' ? 'Шериф' : player.role === 'mafia' ? 'Мафия' : player.role === 'don' ? 'Дон' : '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-5 relative my-auto">
            <button type="button" onClick={() => setShowCreate(false)} className="absolute top-4 right-4 p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            <div><h3 className="text-lg font-black text-white">Новая игра</h3><p className="text-xs text-slate-400">Выбери стол и рассадку. Роли задаются уже внутри игрового протокола.</p></div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-400 font-bold">Стол<select value={selectedTableId} onChange={(e) => handleTableChange(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"><option value="">Выбрать стол</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
              <label className="text-xs text-slate-400 font-bold">Ведущий<input value={judgeName} onChange={(e) => setJudgeName(e.target.value)} placeholder="Имя ведущего" className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white" /></label>
            </div>

            {selectedTableId && tableParticipants.length < 10 && <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">На столе сейчас доступно только {tableParticipants.length} игроков. Для создания игры нужно 10.</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 10 }, (_, index) => {
                const selectedElsewhere = new Set(seatParticipantIds.filter((_, selectedIndex) => selectedIndex !== index));
                return <label key={index} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2"><span className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-xs font-black text-rose-400">{index + 1}</span><select value={seatParticipantIds[index]} onChange={(e) => updateSeat(index, e.target.value)} className="flex-1 bg-transparent text-xs text-white min-w-0"><option value="">— выбрать игрока —</option>{tableParticipants.map((participant) => <option key={participant.id} value={participant.id} disabled={selectedElsewhere.has(participant.id)}>{participant.nickname}</option>)}</select></label>;
              })}
            </div>

            <div className="flex justify-between items-center gap-3 pt-2 border-t border-slate-800">
              <div className="text-[10px] text-slate-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Выбрано {seatParticipantIds.filter(Boolean).length}/10</div>
              <button type="button" disabled={creating || tableParticipants.length < 10} onClick={createGame} className="min-h-[44px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-black uppercase">{creating ? 'Создание…' : 'Создать и открыть протокол'}</button>
            </div>
          </div>
        </div>
      )}

      {activeGame && (
        <EveningGameProtocolModal
          game={activeGame}
          isOpen={true}
          onClose={() => setActiveGame(null)}
          onUpdated={(updated) => {
            setGames((previous) => previous.map((game) => game.id === updated.id ? updated : game));
            setActiveGame(updated);
          }}
        />
      )}
    </div>
  );
};
