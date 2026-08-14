import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Moon, RefreshCw, Users, Vote, X } from 'lucide-react';
import { buildLiveGameStateView, readLiveGameSnapshot } from '../../lib/liveGameState';

interface LiveGameStateSheetProps {
  open: boolean;
  gameNumber: number;
  hideRoles?: boolean;
  onClose: () => void;
}

const statusTone = (alive: boolean) =>
  alive
    ? 'border-slate-700 bg-slate-950/80 text-slate-200'
    : 'border-rose-900/70 bg-rose-950/35 text-rose-200';

export default function LiveGameStateSheet({ open, gameNumber, hideRoles = false, onClose }: LiveGameStateSheetProps) {
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null);

  const refresh = () => setSnapshot(readLiveGameSnapshot());

  useEffect(() => {
    if (!open) return;
    refresh();
    const intervalId = window.setInterval(refresh, 500);
    return () => window.clearInterval(intervalId);
  }, [open]);

  const view = useMemo(() => buildLiveGameStateView(snapshot), [snapshot]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[125] bg-slate-950/92 backdrop-blur-md flex items-end md:items-center justify-center md:p-5" onClick={onClose}>
      <div
        className="w-full md:max-w-3xl max-h-[92dvh] md:max-h-[88dvh] overflow-hidden rounded-t-3xl md:rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Игра #{gameNumber}</div>
            <h2 className="text-base md:text-lg font-black text-white truncate">Текущее состояние игры</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="w-9 h-9 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 flex items-center justify-center"
              title="Обновить состояние"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 flex items-center justify-center"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!view ? (
          <div className="p-6 text-center space-y-2">
            <div className="text-sm font-black text-white">Игра ещё не запущена</div>
            <div className="text-xs text-slate-400">После старта здесь появится живое состояние стола, голосований, ночных действий и дисциплины.</div>
          </div>
        ) : (
          <div className="overflow-y-auto p-3 md:p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-2xl border border-amber-800/50 bg-amber-950/25 p-3 col-span-2 md:col-span-1">
                <div className="text-[9px] uppercase tracking-wider font-black text-amber-400">Этап</div>
                <div className="text-sm font-black text-white mt-1">{view.phaseTitle}</div>
                <div className="text-[11px] text-slate-300 mt-0.5">{view.phaseDetail}</div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-black text-slate-400"><Users className="w-3 h-3" /> В игре</div>
                <div className="text-lg font-black text-white mt-1">{view.aliveCount}/10</div>
                <div className="text-[10px] text-slate-400">Красных {view.redAlive} · Чёрных {view.blackAlive}</div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-black text-slate-400"><Clock3 className="w-3 h-3" /> Таймер</div>
                <div className="text-sm font-black text-white mt-1">{view.timerText || 'Не запущен'}</div>
                <div className="text-[10px] text-slate-400">{view.currentSpeakerSeat ? `Речь #${view.currentSpeakerSeat}` : 'Активной речи нет'}</div>
              </div>
              <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-3">
                <div className="text-[9px] uppercase tracking-wider font-black text-emerald-400">Следующий шаг</div>
                <div className="text-sm font-black text-white mt-1">{view.nextStep}</div>
                {view.savedAt && <div className="text-[10px] text-slate-500 mt-0.5">Сохранено {view.savedAt}</div>}
              </div>
            </div>

            {view.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-700/60 bg-amber-950/25 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300"><AlertTriangle className="w-4 h-4" /> Требует внимания</div>
                {view.warnings.map((warning, index) => <div key={`${warning}-${index}`} className="text-xs text-amber-100">• {warning}</div>)}
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Стол</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {view.players.map((player) => (
                  <div key={player.seat} className={`rounded-xl border p-2 min-w-0 ${statusTone(player.alive)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">#{player.seat}</span>
                      {!player.alive && <span className="text-[8px] font-black uppercase text-rose-300">вне игры</span>}
                    </div>
                    <div className="text-[11px] font-black truncate mt-0.5">{player.nickname}</div>
                    <div className="text-[9px] text-slate-400 truncate mt-0.5">{hideRoles ? 'Роль скрыта' : player.role}</div>
                    <div className="text-[9px] text-slate-400 truncate">{player.status}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5 text-[8px] font-black">
                      {player.fouls > 0 && <span className="rounded bg-amber-950/70 px-1.5 py-0.5 text-amber-300">Ф {player.fouls}</span>}
                      {player.minorTech > 0 && <span className="rounded bg-orange-950/70 px-1.5 py-0.5 text-orange-300">МТ {player.minorTech}</span>}
                      {player.majorTech > 0 && <span className="rounded bg-rose-950/70 px-1.5 py-0.5 text-rose-300">БТ {player.majorTech}</span>}
                      {player.has30SecPenalty && <span className="rounded bg-yellow-950/70 px-1.5 py-0.5 text-yellow-300">30с</span>}
                      {player.ppk && <span className="rounded bg-purple-950/70 px-1.5 py-0.5 text-purple-300">ППК</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(view.nominations.length > 0 || view.votingStage) && (
              <div className="rounded-2xl border border-fuchsia-900/50 bg-fuchsia-950/15 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-300"><Vote className="w-4 h-4" /> Голосование</div>
                <div className="text-xs text-slate-200">
                  {view.votingRound ? `Раунд ${view.votingRound} · ` : ''}{view.votingStage || 'Подготовка'}
                </div>
                {view.nominations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {view.nominations.map((seat) => (
                      <span key={seat} className="rounded-lg border border-fuchsia-800/60 bg-slate-950 px-2 py-1 text-[10px] font-black text-white">
                        #{seat}: {view.voteCounts[seat] ?? 0}
                      </span>
                    ))}
                  </div>
                )}
                {view.eligibleVoters !== null && <div className="text-[10px] text-slate-400">Явно зафиксировано голосов: {view.assignedVotes}/{view.eligibleVoters}</div>}
              </div>
            )}

            {(view.shotPlayerSlot || view.donCheck || view.sheriffCheck || view.firstKilledSlot || view.zeroRoundVotedSlot || view.bestMove) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded-2xl border border-purple-900/50 bg-purple-950/15 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300"><Moon className="w-4 h-4" /> Ночь и проверки</div>
                  <div className="text-xs text-slate-300">Выстрел: {view.shotPlayerSlot ? `#${view.shotPlayerSlot}` : '—'}</div>
                  <div className="text-xs text-slate-300">Дон: {view.donCheck || '—'}</div>
                  <div className="text-xs text-slate-300">Шериф: {view.sheriffCheck || '—'}</div>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Маркеры протокола</div>
                  <div className="text-xs text-slate-300">Первый убитый: {view.firstKilledSlot ? `#${view.firstKilledSlot}` : '—'}</div>
                  <div className="text-xs text-slate-300">Нулевой круг: {view.zeroRoundVotedSlot ? `#${view.zeroRoundVotedSlot}` : '—'}</div>
                  <div className="text-xs text-slate-300">ЛХ: {view.bestMove || '—'}</div>
                </div>
              </div>
            )}

            {view.lastEvent && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Последнее событие</div>
                <div className="text-xs text-slate-300 mt-1">{view.lastEvent}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
