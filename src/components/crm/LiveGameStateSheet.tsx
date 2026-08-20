import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Moon, RefreshCw, Users, Vote, X } from 'lucide-react';
import { buildLiveGameStateView, readLiveGameSnapshot } from '../../lib/liveGameState';

interface LiveGameStateSheetProps {
  open: boolean;
  gameNumber?: number;
  hideRoles?: boolean;
  onClose: () => void;
}

const statusTone = (alive: boolean) =>
  alive
    ? 'border-white/[0.07] bg-black/20 text-white/72'
    : 'border-rose-200/10 bg-rose-300/[0.055] text-rose-100/70';

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
    <div
      data-testid="live-state-overlay"
      className="fixed inset-0 z-[125] flex items-end justify-center bg-black/78 backdrop-blur-md md:items-center md:p-5"
      onClick={onClose}
    >
      <div
        data-testid="live-state-sheet"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-[#121318] shadow-[0_-20px_64px_rgba(0,0,0,0.52)] md:max-h-[88dvh] md:max-w-3xl md:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">{gameNumber ? `Игра #${gameNumber}` : 'Live game'}</div>
            <h2 className="mt-0.5 truncate text-base font-semibold text-white md:text-lg">Текущее состояние игры</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/45 active:bg-white/[0.06] active:text-white/75"
              title="Обновить состояние"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/45 active:bg-white/[0.06] active:text-white/75"
              title="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!view ? (
          <div className="space-y-2 p-6 text-center">
            <div className="text-sm font-semibold text-white">Игра ещё не запущена</div>
            <div className="text-xs leading-5 text-white/35">После старта здесь появится живое состояние стола, голосований, ночных действий и дисциплины.</div>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto p-3 md:p-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div data-testid="live-state-phase" className="col-span-2 rounded-2xl border border-amber-200/10 bg-amber-200/[0.07] p-3 md:col-span-1">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100/55">Этап</div>
                <div className="mt-1 text-sm font-semibold text-white">{view.phaseTitle}</div>
                <div className="mt-0.5 text-[11px] text-white/42">{view.phaseDetail}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.10em] text-white/32"><Users className="h-3 w-3" /> В игре</div>
                <div className="mt-1 text-lg font-semibold text-white">{view.aliveCount}/10</div>
                <div className="text-[10px] text-white/32">Красных {view.redAlive} · Чёрных {view.blackAlive}</div>
              </div>
              <div className="rounded-2xl border border-sky-200/10 bg-sky-300/[0.055] p-3">
                <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.10em] text-sky-100/50"><Clock3 className="h-3 w-3" /> Таймер</div>
                <div className="mt-1 text-sm font-semibold text-white">{view.timerText || 'Не запущен'}</div>
                <div className="text-[10px] text-white/32">{view.currentSpeakerSeat ? `Речь #${view.currentSpeakerSeat}` : 'Активной речи нет'}</div>
              </div>
              <div data-testid="live-state-next" className="rounded-2xl border border-emerald-200/10 bg-emerald-300/[0.055] p-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.10em] text-emerald-100/50">Следующий шаг</div>
                <div className="mt-1 text-sm font-semibold text-white">{view.nextStep}</div>
                {view.savedAt && <div className="mt-0.5 text-[10px] text-white/25">Сохранено {view.savedAt}</div>}
              </div>
            </div>

            {view.warnings.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-amber-200/12 bg-amber-200/[0.065] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-amber-100/70"><AlertTriangle className="h-4 w-4" /> Требует внимания</div>
                {view.warnings.map((warning, index) => <div key={`${warning}-${index}`} className="text-xs text-amber-50/72">• {warning}</div>)}
              </div>
            )}

            <section className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Стол</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {view.players.map((player) => (
                  <div key={player.seat} className={`min-w-0 rounded-xl border p-2 ${statusTone(player.alive)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">#{player.seat}</span>
                      {!player.alive && <span className="text-[8px] font-semibold uppercase text-rose-200/65">вне игры</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-semibold">{player.nickname}</div>
                    <div className="mt-0.5 truncate text-[9px] text-white/32">{hideRoles ? 'Роль скрыта' : player.role}</div>
                    <div className="truncate text-[9px] text-white/32">{player.status}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1 text-[8px] font-semibold">
                      {player.fouls > 0 && <span className="rounded-md border border-amber-200/10 bg-amber-200/[0.08] px-1.5 py-0.5 text-amber-100/72">Ф {player.fouls}</span>}
                      {player.minorTech > 0 && <span className="rounded-md border border-yellow-200/10 bg-yellow-200/[0.07] px-1.5 py-0.5 text-yellow-100/70">МТ {player.minorTech}</span>}
                      {player.majorTech > 0 && <span className="rounded-md border border-rose-200/10 bg-rose-300/[0.07] px-1.5 py-0.5 text-rose-100/72">БТ {player.majorTech}</span>}
                      {player.has30SecPenalty && <span className="rounded-md border border-amber-200/10 bg-amber-200/[0.08] px-1.5 py-0.5 text-amber-100/72">30с</span>}
                      {player.ppk && <span className="rounded-md border border-violet-200/10 bg-violet-300/[0.08] px-1.5 py-0.5 text-violet-100/72">ППК</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {(view.nominations.length > 0 || view.votingStage) && (
              <section data-testid="live-state-voting" className="space-y-2 rounded-[20px] border border-sky-200/10 bg-sky-300/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-sky-100/62"><Vote className="h-4 w-4" /> Голосование</div>
                <div className="text-xs text-white/62">
                  {view.votingRound ? `Раунд ${view.votingRound} · ` : ''}{view.votingStage || 'Подготовка'}
                </div>
                {view.nominations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {view.nominations.map((seat) => (
                      <span key={seat} className="rounded-lg border border-sky-200/10 bg-black/20 px-2 py-1 text-[10px] font-semibold text-white/72">
                        #{seat}: {view.voteCounts[seat] ?? 0}
                      </span>
                    ))}
                  </div>
                )}
                {view.eligibleVoters !== null && <div className="text-[10px] text-white/30">Явно зафиксировано голосов: {view.assignedVotes}/{view.eligibleVoters}</div>}
              </section>
            )}

            {(view.shotPlayerSlot || view.donCheck || view.sheriffCheck || view.firstKilledSlot || view.zeroRoundVotedSlot || view.bestMove) && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <section data-testid="live-state-night" className="space-y-1.5 rounded-[20px] border border-violet-200/10 bg-violet-300/[0.05] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-violet-100/62"><Moon className="h-4 w-4" /> Ночь и проверки</div>
                  <div className="text-xs text-white/52">Выстрел: {view.shotPlayerSlot ? `#${view.shotPlayerSlot}` : '—'}</div>
                  <div className="text-xs text-white/52">Дон: {view.donCheck || '—'}</div>
                  <div className="text-xs text-white/52">Шериф: {view.sheriffCheck || '—'}</div>
                </section>
                <section className="space-y-1.5 rounded-[20px] border border-white/[0.07] bg-black/20 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-white/34">Маркеры протокола</div>
                  <div className="text-xs text-white/52">Первый убитый: {view.firstKilledSlot ? `#${view.firstKilledSlot}` : '—'}</div>
                  <div className="text-xs text-white/52">Нулевой круг: {view.zeroRoundVotedSlot ? `#${view.zeroRoundVotedSlot}` : '—'}</div>
                  <div className="text-xs text-white/52">ЛХ: {view.bestMove || '—'}</div>
                </section>
              </div>
            )}

            {view.lastEvent && (
              <section className="rounded-[20px] border border-white/[0.07] bg-black/20 p-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.10em] text-white/25">Последнее событие</div>
                <div className="mt-1 text-xs text-white/50">{view.lastEvent}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}