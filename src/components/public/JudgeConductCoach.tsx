import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, ChevronRight, Eye, EyeOff, X } from 'lucide-react';
import type { PersistedLiveSession } from '../LiveGameEngine/liveSessionStorage.ts';
import { getTrainingPrompt, getJudgeTrainingGate, type TrainingPrompt } from '../../lib/judgeConductTraining.ts';

const TOUR: TrainingPrompt[] = [
  { title: 'Центральная панель', detail: 'Здесь показаны этап игры, таймер и кнопки перехода. Ведущий начинает и завершает речи именно здесь.', focus: 'live-judge-hud' },
  { title: 'Действия игрока', detail: 'Чтобы выставить кандидата, открой действия нужного игрока на столе или в панели судейства.', focus: 'live-player-actions-center-selector' },
  { title: 'Назад и исправления', detail: 'Ошибся с действием? Используй кнопку «Назад» в интерфейсе. Теперь потренируемся на обычной партии.', focus: 'live-judge-hud' },
];

const progressKey = (s: PersistedLiveSession) => JSON.stringify([
  s.phase, s.roundNumber, s.dayStarterSlot, s.zeroNightSubPhase, s.zeroNightMusicState,
  s.activeSpeakerSlot, s.nominations, s.nominationsMap, s.votingStage,
  s.votingRounds, s.activeVotingRoundIndex, s.currentVotingNomineeIndex,
  s.votesByPlayer, s.revoteSpeakerIndex, s.votingFarewellQueue,
  s.nightSubPhase, s.postNightStage, s.shotPlayerSlot, s.donCheckSlot, s.sheriffCheckSlot,
  s.activePlayers.map((v) => [v.slot_num, v.role, v.team, v.alive, v.has_spoken_this_round]),
]);

/** Inline mission panel. It participates in game layout instead of covering seats, actions or timers. */
export default function JudgeConductCoach() {
  const [session, setSession] = useState<PersistedLiveSession | null>(null);
  const previousKey = useRef('');
  const [tourIndex, setTourIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [highlight, setHighlight] = useState(true);
  const isTour = session !== null && tourIndex < TOUR.length;
  const progress = useMemo(() => getTrainingPrompt(session), [session]);
  const gate = useMemo(() => getJudgeTrainingGate(session), [session]);
  const task = isTour ? TOUR[tourIndex] : gate ? { ...progress, title: gate.title, detail: gate.detail } : progress;
  const highlightSelectors = isTour ? ['[data-testid="' + task.focus + '"]']
    : gate?.highlight ?? ['[data-testid="' + task.focus + '"]'];
  const highlightKey = highlightSelectors.join('|');

  useEffect(() => {
    const poll = () => {
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const next = JSON.parse(raw) as PersistedLiveSession;
        if (!next?.phase || next.phase === 'setup' || next.sessionKey !== 'club:-2147483000') return;
        const key = progressKey(next);
        if (key !== previousKey.current) {
          previousKey.current = key;
          setSession(next);
        }
      } catch {
        // A partially written snapshot must never stop the game.
      }
    };
    poll();
    const interval = window.setInterval(poll, 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!highlight) return undefined;
    const update = () => {
      const marked = new Set<HTMLElement>();
      for (const selector of highlightSelectors) {
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => marked.add(node));
      }
      document.querySelectorAll('.judge-training-focus').forEach((element) => {
        if (!marked.has(element as HTMLElement)) element.classList.remove('judge-training-focus');
      });
      marked.forEach((node) => node.classList.add('judge-training-focus'));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll('.judge-training-focus').forEach((element) => element.classList.remove('judge-training-focus'));
    };
  }, [highlight, highlightKey]);

  // A short fixed voting HUD can require internal scrolling. When the mission
  // becomes "Next" or "Finalize", reveal its button inside that HUD immediately.
  useEffect(() => {
    if (isTour || !highlightKey.includes('live-voting-next') && !highlightKey.includes('live-voting-finalize')) return;
    const viewport = document.querySelector<HTMLElement>('.evening-live-engine-shell .live-judge-hud__body');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [isTour, highlightKey]);

  if (!session) return null;
  return (
    <div
      className="fixed right-[62px] z-[118] max-w-[min(152px,calc(100vw-156px))]"
      style={{ top: 'calc(var(--live-safe-top, 0px) + 2px)' }}
      data-testid="judge-conduct-coach"
      data-training-tour-active={isTour ? 'true' : 'false'}
    >
      <style>{'.judge-training-focus { outline: 2px solid rgba(251,191,36,.85) !important; outline-offset: 2px; box-shadow: 0 0 0 3px rgba(245,158,11,.12) !important; }'}</style>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full min-w-[90px] items-center gap-1.5 rounded-xl border border-amber-300/40 bg-[#252117] px-2.5 text-left text-amber-100 shadow-lg"
        aria-label={'Открыть задание: ' + task.title}
        data-testid="judge-training-task-trigger"
        aria-expanded={open}
      >
        <BookOpenCheck className="h-4 w-4 shrink-0 text-amber-200" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
          {isTour ? 'Знакомство ' + (tourIndex + 1) + '/' + TOUR.length : task.title}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[160] flex items-start justify-center bg-slate-950/65 px-3 pt-[max(64px,env(safe-area-inset-top))]" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Задание судьи"
            data-testid="judge-training-task-dialog"
            className="max-h-[calc(100dvh-82px)] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-200/30 bg-[#171715] p-4 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-200">
                <BookOpenCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-amber-200/70">
                  {isTour ? 'Знакомство · ' + (tourIndex + 1) + '/' + TOUR.length : 'Задание · нулевая игра'}
                </div>
                <h2 className={'mt-1 text-lg font-semibold leading-tight ' + (task.warning ? 'text-rose-200' : 'text-white')} aria-live="polite">{task.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Свернуть подсказку"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-white/65"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{task.detail}</p>
            <p className="mt-2 text-xs leading-5 text-amber-100/55">
              {isTour ? 'Сверни подсказку, чтобы рассмотреть подсвеченный элемент настоящего игрового стола.' : 'Сверни подсказку и выполни действие на игровом столе. Его кнопки и расположение не отличаются от реальной партии.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 flex-1 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white"
              >
                К игровому столу
              </button>
              {isTour && (
                <button
                  type="button"
                  onClick={() => {
                    setTourIndex((value) => value + 1);
                    setOpen(false);
                  }}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-amber-200 px-3 text-sm font-semibold text-black"
                >
                  {tourIndex === TOUR.length - 1 ? 'К заданиям' : 'Дальше'} <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {!isTour && (
                <button
                  type="button"
                  onClick={() => setHighlight((value) => !value)}
                  aria-label={highlight ? 'Выключить подсветку' : 'Включить подсветку'}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-amber-100"
                  title={highlight ? 'Выключить подсветку' : 'Включить подсветку'}
                >
                  {highlight ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
