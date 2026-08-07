import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { EveningGameProtocolModal } from './EveningGameProtocolModal';
import { EveningLiveGameModal } from './EveningLiveGameModal';
import { EveningGameCreateSheet } from './EveningGameCreateSheet';

interface EveningGamesViewProps {
  eveningId: string;
  onBack: () => void;
}

export const EveningGamesView: React.FC<EveningGamesViewProps> = ({ eveningId, onBack }) => {
  const [evening, setEvening] = useState<(GameEvening & { participants?: EveningParticipant[]; tables?: EveningTable[] }) | null>(null);
  const [games, setGames] = useState<ClubGameRecord[]>([]);
  const [archivedGames, setArchivedGames] = useState<ClubGameRecord[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeProtocolGame, setActiveProtocolGame] = useState<ClubGameRecord | null>(null);
  const [activeLiveGame, setActiveLiveGame] = useState<ClubGameRecord | null>(null);
  const [modeChoiceGame, setModeChoiceGame] = useState<ClubGameRecord | null>(null);
  const [pendingGameAction, setPendingGameAction] = useState<{ type: 'archive' | 'delete'; game: ClubGameRecord } | null>(null);
  const [processingGameAction, setProcessingGameAction] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [eveningData, gameData, archivedData] = await Promise.all([
        api.getEvening(eveningId) as any,
        clubGamesApi.list(eveningId),
        clubGamesApi.listArchived(eveningId),
      ]);
      setEvening(eveningData);
      setGames(gameData.filter((game) => Boolean(game.club_protocol)));
      setArchivedGames(archivedData.filter((game) => Boolean(game.club_protocol)));
    } catch (err: any) {
      alert(err.message || 'Не удалось загрузить игры вечера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eveningId]);

  const tables = evening?.tables || [];
  const participants = evening?.participants || [];


  const openCreate = () => setShowCreate(true);

  const archiveGame = (game: ClubGameRecord) => {
    setPendingGameAction({ type: 'archive', game });
  };

  const restoreArchivedGame = async (game: ClubGameRecord) => {
    try {
      const restored = await clubGamesApi.restoreArchived(game.id);
      setArchivedGames((previous) => previous.filter((item) => item.id !== game.id));
      setGames((previous) => [restored, ...previous.filter((item) => item.id !== game.id)]);
    } catch (err: any) {
      alert(err.message || 'Не удалось восстановить игру');
    }
  };

  const permanentlyDeleteArchivedGame = (game: ClubGameRecord) => {
    setPendingGameAction({ type: 'delete', game });
  };

  const confirmPendingGameAction = async () => {
    const pending = pendingGameAction;
    if (!pending || processingGameAction) return;
    setProcessingGameAction(true);
    try {
      if (pending.type === 'archive') {
        const archived = await clubGamesApi.archive(pending.game.id);
        setGames((previous) => previous.filter((item) => item.id !== pending.game.id));
        setArchivedGames((previous) => [archived, ...previous.filter((item) => item.id !== pending.game.id)]);
        setActiveProtocolGame((current) => current?.id === pending.game.id ? null : current);
        setActiveLiveGame((current) => current?.id === pending.game.id ? null : current);
      } else {
        await clubGamesApi.deleteArchived(pending.game.id);
        setArchivedGames((previous) => previous.filter((item) => item.id !== pending.game.id));
      }
      setPendingGameAction(null);
    } catch (err: any) {
      alert(err.message || (pending.type === 'archive' ? 'Не удалось перенести игру в архив' : 'Не удалось окончательно удалить игру'));
    } finally {
      setProcessingGameAction(false);
    }
  };

  const applyUpdatedGame = (updated: ClubGameRecord) => {
    setGames((previous) => previous.map((game) => game.id === updated.id ? updated : game));
    setActiveProtocolGame((current) => current?.id === updated.id ? updated : current);
    setActiveLiveGame((current) => current?.id === updated.id ? updated : current);
  };

  const localNumberById = useMemo(() => {
    const chronological = [...games, ...archivedGames].sort((a, b) => a.id - b.id);
    return new Map(chronological.map((game, index) => [game.id, index + 1]));
  }, [games, archivedGames]);

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
          <button type="button" onClick={openCreate} className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />Новая игра
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Активные</span><strong className="text-lg text-white">{games.length}</strong></div>
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Завершено</span><strong className="text-lg text-emerald-400">{games.filter((game) => game.status === 'completed').length}</strong></div>
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5"><span className="text-[9px] uppercase text-slate-500 block">Черновики</span><strong className="text-lg text-amber-400">{games.filter((game) => game.status === 'draft').length}</strong></div>
          <button type="button" onClick={() => setShowArchive((value) => !value)} className="bg-slate-950 border border-slate-800 rounded-2xl p-2.5 hover:border-slate-600"><span className="text-[9px] uppercase text-slate-500 block">Архив</span><strong className="text-lg text-slate-300">{archivedGames.length}</strong></button>
        </div>
      </div>

      <div className="space-y-3">
        {games.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-10 text-center space-y-2">
            <Gamepad2 className="w-10 h-10 text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-300">На этом вечере ещё нет игр</div>
            <div className="text-xs text-slate-500">Создай первую игру, затем выбери: провести её пошагово в игровом движке или внести готовый протокол вручную.</div>
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
                <div className="flex flex-wrap gap-2 justify-end">
                  <button type="button" onClick={() => archiveGame(game)} title="Перенести в архив" className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-amber-300 hover:border-amber-700 flex items-center justify-center"><Archive className="w-4 h-4" /></button>
                  {game.status === 'draft' && (
                    <button type="button" onClick={() => setActiveLiveGame(game)} className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5">
                      <Play className="w-4 h-4" />Провести
                    </button>
                  )}
                  <button type="button" onClick={() => setActiveProtocolGame(game)} className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white text-xs font-black flex items-center gap-1.5">
                    {game.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-amber-400" />}{game.status === 'completed' ? 'Протокол' : 'Заполнить протокол'}
                  </button>
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


      {showArchive && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2"><Archive className="w-4 h-4 text-amber-400" />Архив игр</h3>
              <p className="text-[10px] text-slate-500 mt-1">Архивные игры не показываются в основном списке и не редактируются. Здесь их можно восстановить или удалить навсегда вручную.</p>
            </div>
            <button type="button" onClick={() => setShowArchive(false)} className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">×</button>
          </div>
          {archivedGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">Архив пуст</div>
          ) : archivedGames.map((game) => {
            const protocol = game.club_protocol?.protocol;
            const localNumber = localNumberById.get(game.id) || 1;
            return (
              <div key={game.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm text-slate-200">Игра {localNumber}</strong>
                    <span className="text-[9px] font-mono text-slate-600">#{game.global_game_number}</span>
                    <span className="px-2 py-0.5 rounded-full border border-slate-700 text-[9px] font-black uppercase text-slate-400">В архиве</span>
                    {protocol?.winner_team && <span className="text-[9px] text-slate-500">Победа {protocol.winner_team === 'red' ? 'красных' : 'чёрных'}</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{game.table_name || 'Без стола'}{game.judge_name ? ` · ${game.judge_name}` : ''}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => restoreArchivedGame(game)} className="min-h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Восстановить</button>
                  <button type="button" onClick={() => permanentlyDeleteArchivedGame(game)} className="min-h-10 px-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-[10px] font-black flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Навсегда</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingGameAction && (
        <div className="fixed inset-0 z-[95] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-amber-700/60 bg-slate-900 shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">Подтвердите действие</div>
              <h3 className="text-lg font-black text-white mt-1">
                {pendingGameAction.type === 'archive' ? 'Перенести игру в архив?' : 'Удалить игру навсегда?'}
              </h3>
              <p className="text-sm font-bold text-slate-200 mt-2">Игра #{pendingGameAction.game.global_game_number}</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {pendingGameAction.type === 'archive'
                  ? 'Игра исчезнет из основного списка, но все данные и протокол сохранятся. Её можно будет восстановить из архива.'
                  : 'Игра будет окончательно удалена из базы. После этого восстановить её будет нельзя.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={processingGameAction}
                onClick={() => setPendingGameAction(null)}
                className="min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={processingGameAction}
                onClick={confirmPendingGameAction}
                className={`min-h-12 rounded-xl border text-white text-xs font-black uppercase tracking-wide disabled:opacity-50 ${pendingGameAction.type === 'archive' ? 'bg-amber-600 border-amber-500' : 'bg-rose-600 border-rose-500'}`}
              >
                {processingGameAction
                  ? (pendingGameAction.type === 'archive' ? 'Переносим…' : 'Удаляем…')
                  : (pendingGameAction.type === 'archive' ? 'В архив' : 'Удалить навсегда')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <EveningGameCreateSheet
          evening={evening}
          tables={tables}
          participants={participants}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setGames((previous) => [created, ...previous.filter((game) => game.id !== created.id)]);
            setShowCreate(false);
            setModeChoiceGame(created);
          }}
        />
      )}

      {modeChoiceGame && (
        <div className="fixed inset-0 z-[85] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-4">
            <div><h3 className="text-lg font-black text-white">Игра создана</h3><p className="text-xs text-slate-400 mt-1">Как будем вносить эту игру?</p></div>
            <button type="button" onClick={() => { const game = modeChoiceGame; setModeChoiceGame(null); setActiveLiveGame(game); }} className="w-full min-h-[58px] rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black flex items-center justify-center gap-2"><Play className="w-5 h-5" />Провести игру в движке</button>
            <button type="button" onClick={() => { const game = modeChoiceGame; setModeChoiceGame(null); setActiveProtocolGame(game); }} className="w-full min-h-[58px] rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-black flex items-center justify-center gap-2"><FileText className="w-5 h-5" />Заполнить протокол вручную</button>
            <button type="button" onClick={() => setModeChoiceGame(null)} className="w-full py-2 text-xs text-slate-500">Вернуться к списку игр</button>
          </div>
        </div>
      )}

      {activeProtocolGame && <EveningGameProtocolModal game={activeProtocolGame} isOpen={true} onClose={() => setActiveProtocolGame(null)} onUpdated={applyUpdatedGame} />}
      {activeLiveGame && <EveningLiveGameModal
        game={activeLiveGame}
        onClose={() => setActiveLiveGame(null)}
        onUpdated={(updated) => {
          applyUpdatedGame(updated);
          if (updated.status === 'completed') setActiveProtocolGame(updated);
        }}
      />}
    </div>
  );
};
