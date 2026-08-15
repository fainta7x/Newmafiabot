import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening } from '../../lib/api';
import { clubGamesApi, getPendingClubGameProtocolSave, type ClubGameRecord } from '../../lib/clubGamesApi';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
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
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeProtocolGame, setActiveProtocolGame] = useState<ClubGameRecord | null>(null);
  const [activeLiveGame, setActiveLiveGame] = useState<ClubGameRecord | null>(null);
  const [modeChoiceGame, setModeChoiceGame] = useState<ClubGameRecord | null>(null);
  const [pendingGameAction, setPendingGameAction] = useState<{ type: 'archive' | 'delete'; game: ClubGameRecord } | null>(null);
  const [processingGameAction, setProcessingGameAction] = useState(false);
  const [retryingFinalSaveGameId, setRetryingFinalSaveGameId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
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
      setError(err?.message || 'Не удалось загрузить игры вечера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const tables = evening?.tables || [];
  const participants = evening?.participants || [];

  const archiveGame = (game: ClubGameRecord) => setPendingGameAction({ type: 'archive', game });
  const permanentlyDeleteArchivedGame = (game: ClubGameRecord) => setPendingGameAction({ type: 'delete', game });

  const restoreArchivedGame = async (game: ClubGameRecord) => {
    setError(null);
    try {
      const restored = await clubGamesApi.restoreArchived(game.id);
      setArchivedGames((previous) => previous.filter((item) => item.id !== game.id));
      setGames((previous) => [restored, ...previous.filter((item) => item.id !== game.id)]);
    } catch (err: any) {
      setError(err?.message || 'Не удалось восстановить игру');
    }
  };

  const confirmPendingGameAction = async () => {
    const pending = pendingGameAction;
    if (!pending || processingGameAction) return;
    setProcessingGameAction(true);
    setError(null);
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
      setError(err?.message || (pending.type === 'archive' ? 'Не удалось перенести игру в архив' : 'Не удалось окончательно удалить игру'));
    } finally {
      setProcessingGameAction(false);
    }
  };

  const applyUpdatedGame = (updated: ClubGameRecord) => {
    setGames((previous) => previous.map((game) => game.id === updated.id ? updated : game));
    setActiveProtocolGame((current) => current?.id === updated.id ? updated : current);
    setActiveLiveGame((current) => current?.id === updated.id ? updated : current);
  };

  const retryPendingFinalSave = async (game: ClubGameRecord) => {
    if (retryingFinalSaveGameId != null) return;
    setRetryingFinalSaveGameId(game.id);
    setError(null);
    try {
      const updated = await clubGamesApi.retryPendingProtocolSave(game.id);
      if (!updated) throw new Error('Локальная копия завершённого протокола не найдена');
      applyUpdatedGame(updated);
    } catch (err: any) {
      setError(err?.message || 'Не удалось повторно сохранить завершённую игру. Локальная копия сохранена на устройстве.');
    } finally {
      setRetryingFinalSaveGameId(null);
    }
  };

  const localNumberById = useMemo(() => {
    const chronological = [...games, ...archivedGames].sort((a, b) => a.id - b.id);
    return new Map(chronological.map((game, index) => [game.id, index + 1]));
  }, [games, archivedGames]);

  if (loading) return <div className="py-16 text-center text-[13px] text-text-secondary">Загрузка игр вечера…</div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[12px] text-danger"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error || 'Не удалось загрузить вечер'}</span></div><button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-[11px] bg-surface-1 px-3 font-bold text-text-primary">Повторить</button></div>;

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0"><div className="flex items-center gap-2"><Gamepad2 className="h-5 w-5 shrink-0 text-accent" /><h2 className="truncate text-[18px] font-black text-text-primary">Игры · {evening.title}</h2></div><p className="mt-1 text-[11px] text-text-secondary">{new Date(evening.starts_at).toLocaleDateString('ru-RU')}{evening.venue ? ` · ${evening.venue}` : ''}</p></div>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-accent px-4 text-[12px] font-black text-white"><Plus className="h-4 w-4" />Новая игра</button>
        </div>

        {error ? <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-[11px] text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-[13px] border border-border-soft bg-surface-2 p-2.5"><span className="block text-[9px] font-bold uppercase text-text-muted">Всего</span><strong className="text-lg text-text-primary">{games.length}</strong></div>
          <div className="rounded-[13px] border border-border-soft bg-surface-2 p-2.5"><span className="block text-[9px] font-bold uppercase text-text-muted">Завершено</span><strong className="text-lg text-success">{games.filter((game) => game.status === 'completed').length}</strong></div>
          <div className="rounded-[13px] border border-border-soft bg-surface-2 p-2.5"><span className="block text-[9px] font-bold uppercase text-text-muted">Черновики</span><strong className="text-lg text-warning">{games.filter((game) => game.status === 'draft').length}</strong></div>
          <button type="button" onClick={() => setShowArchive((value) => !value)} className="rounded-[13px] border border-border-soft bg-surface-2 p-2.5"><span className="block text-[9px] font-bold uppercase text-text-muted">Архив</span><strong className="text-lg text-text-secondary">{archivedGames.length}</strong></button>
        </div>
      </section>

      <div className="space-y-3">
        {games.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border-soft bg-surface-1 p-8 text-center"><Gamepad2 className="mx-auto h-9 w-9 text-text-muted" /><div className="mt-3 text-[13px] font-bold text-text-primary">На этом вечере ещё нет игр</div><div className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-text-secondary">Создай первую игру, затем выбери: провести её пошагово в игровом движке или внести готовый протокол вручную.</div></div>
        ) : games.map((game) => {
          const protocol = game.club_protocol?.protocol;
          const results = game.club_protocol?.player_results || [];
          const localNumber = localNumberById.get(game.id) || 1;
          const pendingFinalSave = Boolean(getPendingClubGameProtocolSave(game.id));
          const retryingThisGame = retryingFinalSaveGameId === game.id;
          return (
            <article key={game.id} className={`space-y-3 rounded-[18px] border bg-surface-1 p-4 ${pendingFinalSave ? 'border-warning/50' : 'border-border-soft'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-[13px] text-text-primary">Игра {localNumber}</strong><span className="font-mono text-[10px] text-text-muted">#{game.global_game_number}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${game.status === 'completed' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{game.status === 'completed' ? 'Завершена' : 'Черновик'}</span>{pendingFinalSave ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-black uppercase text-warning">Ждёт подтверждения</span> : null}{protocol?.winner_team ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-bold text-text-secondary">Победа {protocol.winner_team === 'red' ? 'красных' : 'чёрных'}</span> : null}</div><p className="mt-1 text-[11px] text-text-secondary">{game.table_name || 'Без стола'}{game.judge_name ? ` · Ведущий: ${game.judge_name}` : ''}</p></div>
                <div className="flex flex-wrap justify-end gap-2">{pendingFinalSave ? <button type="button" disabled={retryingThisGame} onClick={() => void retryPendingFinalSave(game)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-warning px-3 text-[11px] font-black text-slate-950 disabled:opacity-60"><RotateCcw className={`h-4 w-4 ${retryingThisGame ? 'animate-spin' : ''}`} />{retryingThisGame ? 'Сохраняю…' : 'Повторить сохранение'}</button> : <><button type="button" onClick={() => archiveGame(game)} title="Перенести в архив" className="grid h-10 w-10 place-items-center rounded-[11px] border border-border-soft bg-surface-2 text-text-muted"><Archive className="h-4 w-4" /></button>{game.status === 'draft' ? <button type="button" onClick={() => setActiveLiveGame(game)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-accent px-3 text-[11px] font-black text-white"><Play className="h-4 w-4" />Провести</button> : null}<button type="button" onClick={() => setActiveProtocolGame(game)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[11px] font-black text-text-primary">{game.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <FileText className="h-4 w-4 text-warning" />}{game.status === 'completed' ? 'Протокол' : 'Заполнить протокол'}</button></>}</div>
              </div>

              {pendingFinalSave ? <div className="flex items-start gap-2 rounded-[12px] border border-warning/25 bg-warning-soft px-3 py-2.5 text-[10px] leading-4 text-warning"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>На этом устройстве сохранён финальный протокол, который ещё не получил подтверждение сервера. Пока он не отправлен, повторное проведение, ручное редактирование и архивирование игры заблокированы.</span></div> : null}

              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">{results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => <div key={player.participant_id} className="min-w-0 rounded-[10px] border border-border-soft bg-surface-2 p-1.5 text-center"><div className="font-mono text-[9px] text-text-muted">#{player.seat_number}</div><div className="truncate text-[9px] font-bold text-text-primary">{player.display_name}</div><div className="truncate text-[8px] text-text-muted">{player.role === 'citizen' ? 'Мирный' : player.role === 'sheriff' ? 'Шериф' : player.role === 'mafia' ? 'Мафия' : player.role === 'don' ? 'Дон' : '—'}</div></div>)}</div>
            </article>
          );
        })}
      </div>

      {showArchive ? <section className="space-y-3 rounded-[18px] border border-border-soft bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-[13px] font-black text-text-primary"><Archive className="h-4 w-4 text-warning" />Архив игр</h3><p className="mt-1 text-[10px] leading-4 text-text-muted">Архивные игры можно восстановить или удалить навсегда вручную.</p></div><button type="button" onClick={() => setShowArchive(false)} className="grid h-10 w-10 place-items-center rounded-[11px] bg-surface-2 text-text-muted">×</button></div>{archivedGames.length === 0 ? <div className="rounded-[14px] border border-dashed border-border-soft p-6 text-center text-[11px] text-text-muted">Архив пуст</div> : archivedGames.map((game) => { const protocol = game.club_protocol?.protocol; const localNumber = localNumberById.get(game.id) || 1; return <div key={game.id} className="flex flex-col gap-3 rounded-[14px] border border-border-soft bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-[12px] text-text-primary">Игра {localNumber}</strong><span className="font-mono text-[9px] text-text-muted">#{game.global_game_number}</span><span className="rounded-full border border-border-soft px-2 py-0.5 text-[9px] font-black uppercase text-text-muted">В архиве</span>{protocol?.winner_team ? <span className="text-[9px] text-text-muted">Победа {protocol.winner_team === 'red' ? 'красных' : 'чёрных'}</span> : null}</div><div className="mt-1 text-[10px] text-text-muted">{game.table_name || 'Без стола'}{game.judge_name ? ` · ${game.judge_name}` : ''}</div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void restoreArchivedGame(game)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-1 px-3 text-[10px] font-black text-text-secondary"><RotateCcw className="h-3.5 w-3.5" />Восстановить</button><button type="button" onClick={() => permanentlyDeleteArchivedGame(game)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-danger-soft px-3 text-[10px] font-black text-danger"><Trash2 className="h-3.5 w-3.5" />Навсегда</button></div></div>; })}</section> : null}

      <ConfirmDialog
        open={Boolean(pendingGameAction)}
        title={pendingGameAction?.type === 'archive' ? 'Перенести игру в архив?' : 'Удалить игру навсегда?'}
        description={pendingGameAction ? (pendingGameAction.type === 'archive' ? `Игра #${pendingGameAction.game.global_game_number} исчезнет из основного списка, но её можно будет восстановить.` : `Игра #${pendingGameAction.game.global_game_number} будет окончательно удалена и восстановить её будет нельзя.`) : undefined}
        confirmLabel={pendingGameAction?.type === 'archive' ? 'В архив' : 'Удалить'}
        tone={pendingGameAction?.type === 'delete' ? 'danger' : 'warning'}
        busy={processingGameAction}
        onCancel={() => !processingGameAction && setPendingGameAction(null)}
        onConfirm={confirmPendingGameAction}
      />

      {showCreate ? <EveningGameCreateSheet evening={evening} tables={tables} participants={participants} games={games} onClose={() => setShowCreate(false)} onCreated={(created) => { setGames((previous) => [created, ...previous.filter((game) => game.id !== created.id)]); setShowCreate(false); setModeChoiceGame(created); }} /> : null}

      {modeChoiceGame ? <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md space-y-4 rounded-[20px] border border-border-soft bg-surface-1 p-5 text-text-primary"><div><h3 className="text-[17px] font-black">Игра создана</h3><p className="mt-1 text-[11px] text-text-secondary">Как будем вносить эту игру?</p></div><button type="button" onClick={() => { const game = modeChoiceGame; setModeChoiceGame(null); setActiveLiveGame(game); }} className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[13px] bg-accent text-[12px] font-black text-white"><Play className="h-5 w-5" />Провести игру в движке</button><button type="button" onClick={() => { const game = modeChoiceGame; setModeChoiceGame(null); setActiveProtocolGame(game); }} className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[13px] border border-border-soft bg-surface-2 text-[12px] font-black text-text-primary"><FileText className="h-5 w-5" />Заполнить протокол вручную</button><button type="button" onClick={() => setModeChoiceGame(null)} className="min-h-10 w-full text-[11px] text-text-muted">Вернуться к списку игр</button></div></div> : null}

      {activeProtocolGame ? <EveningGameProtocolModal game={activeProtocolGame} isOpen={true} onClose={() => setActiveProtocolGame(null)} onUpdated={applyUpdatedGame} /> : null}
      {activeLiveGame ? <EveningLiveGameModal game={activeLiveGame} onClose={() => setActiveLiveGame(null)} onUpdated={(updated) => { applyUpdatedGame(updated); if (updated.status === 'completed') setActiveProtocolGame(updated); }} /> : null}
    </div>
  );
};