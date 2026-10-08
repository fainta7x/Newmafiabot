import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, ChevronDown, ChevronRight, Eye, MousePointer2, RotateCcw, Sparkles } from 'lucide-react';
import type { PersistedLiveSession } from '../LiveGameEngine/liveSessionStorage.ts';
import { getTrainingPrompt, type TrainingPrompt } from '../../lib/judgeConductTraining.ts';

const TOUR: TrainingPrompt[] = [
  { title: 'Центр управления', detail: 'Здесь находится текущая фаза, таймер и основное действие. Именно отсюда ты будешь начинать и завершать речи.', focus: 'live-judge-hud' },
  { title: 'Карточки игроков', detail: 'Чтобы выставить кандидата или записать фол, выбери игрока в выпадающем списке «Действия игрока» или нажми его место на столе.', focus: 'live-player-actions-selector' },
  { title: 'Можно ошибиться', detail: 'Кнопка «Отмена» возвращает предыдущее действие. В учебной игре смело пробуй и исправляй.', focus: 'live-judge-hud' },
  { title: 'Управляй реальной игрой', detail: 'Подсказки будут сообщать, что виртуальные игроки сделали за столом. Твои нажатия изменяют настоящий Live Engine; симулятор сам НЕ нажимает кнопки вместо тебя.', focus: 'live-judge-hud' },
];

const sessionProgressKey = (s: PersistedLiveSession) => JSON.stringify([
  s.phase, s.roundNumber, s.dayStarterSlot, s.zeroNightSubPhase, s.zeroNightMusicState,
  s.activeSpeakerSlot, s.nominations, s.nominationsMap, s.votingStage,
  s.votingRounds, s.activeVotingRoundIndex, s.currentVotingNomineeIndex,
  s.votesByPlayer, s.revoteSpeakerIndex, s.votingFarewellQueue,
  s.nightSubPhase, s.postNightStage, s.shotPlayerSlot, s.donCheckSlot, s.sheriffCheckSlot,
  s.activePlayers.map((v) => [v.slot_num, v.role, v.team, v.alive, v.has_spoken_this_round]),
]);

/** Reads the real engine's session. No simulated buttons, artificial results or second game engine. */
export default function JudgeConductCoach() {
  const [session, setSession] = useState<PersistedLiveSession | null>(null);
  const previousKey = useRef('');
  const [tourIndex, setTourIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const isTour = session !== null && tourIndex < TOUR.length;
  const progress = useMemo(() => getTrainingPrompt(session), [session]);
  const prompt = isTour ? TOUR[tourIndex] : progress;

  useEffect(() => {
    const poll = () => {
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const next = JSON.parse(raw) as PersistedLiveSession;
        if (!next?.phase || next.phase === 'setup' || next.sessionKey !== 'club:-2147483000') return;
        const key = sessionProgressKey(next);
        if (key !== previousKey.current) {
          previousKey.current = key;
          setSession(next);
        }
      } catch {
        // Do not interrupt the live engine when a saved frame is being replaced.
      }
    };
    poll();
    const interval = window.setInterval(poll, 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (collapsed || !showHints) return undefined;
    const selector = '[data-testid="' + prompt.focus + '"]';
    const update = () => {
      const selected = document.querySelector<HTMLElement>(selector);
      document.querySelectorAll('.judge-coach-spotlight').forEach((el) => {
        if (el !== selected) el.classList.remove('judge-coach-spotlight');
      });
      if (selected) selected.classList.add('judge-coach-spotlight');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll('.judge-coach-spotlight').forEach((el) => el.classList.remove('judge-coach-spotlight'));
    };
  }, [prompt.focus, collapsed, showHints, session?.phase]);

  return (
    <>
      <style>{'.judge-coach-spotlight { outline: 3px solid rgba(251,191,36,.92) !important; outline-offset: 3px; box-shadow: 0 0 0 6px rgba(245,158,11,.10), 0 0 28px rgba(245,158,11,.25) !important; transition: outline-color .15s ease; } @media (prefers-reduced-motion: no-preference) { .judge-coach-spotlight { animation: judge-coach-glow 2.2s ease-in-out infinite; } @keyframes judge-coach-glow { 50% { outline-color: rgba(251,191,36,.4); } } }'}</style>
      <div className="pointer-events-none fixed inset-x-2 top-[max(4rem,env(safe-area-inset-top))] z-[160] mx-auto flex max-w-[460px] justify-end text-white" data-testid="judge-conduct-coach">
        {collapsed ? (
          <button type="button" className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300/40 bg-[#181713] px-4 text-xs font-semibold text-amber-100 shadow-xl" onClick={() => setCollapsed(false)}>
            <Sparkles className="h-4 w-4" /> Подсказка судье <ChevronDown className="h-4 w-4" />
          </button>
        ) : (
          <section className="pointer-events-auto w-full rounded-[22px] border border-amber-200/30 bg-[#171716]/95 p-3.5 shadow-[0_16px_55px_rgba(0,0,0,.68)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-amber-200/75">
                <BookOpenCheck className="h-4 w-4" />
                {isTour ? 'Знакомство · ' + (tourIndex + 1) + '/' + TOUR.length : 'Учебная партия'}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowHints((v) => !v)} aria-label={showHints ? 'Убрать подсветку' : 'Показать подсветку'} title="Подсветка интерфейса" className="grid h-8 w-8 place-items-center rounded-lg text-white/65 active:bg-white/10">
                  <Eye className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setCollapsed(true)} aria-label="Свернуть подсказку" className="grid h-8 w-8 place-items-center rounded-lg text-white/65 active:bg-white/10">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
            <h3 className={'mt-1.5 text-base font-bold ' + (prompt.warning ? 'text-rose-200' : 'text-white')}>{prompt.title}</h3>
            <p className="mt-1.5 text-xs leading-[19px] text-white/70">{prompt.detail}</p>
            {isTour ? (
              <button type="button" onClick={() => setTourIndex((i) => i + 1)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-200 text-xs font-bold text-stone-950">
                {tourIndex === TOUR.length - 1 ? 'Начать практику' : 'Понятно, дальше'} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-[10px] leading-4 text-white/40">
                {prompt.warning ? <RotateCcw className="h-3.5 w-3.5 shrink-0" /> : <MousePointer2 className="h-3.5 w-3.5 shrink-0" />}
                <span>Сделай действие в игровом интерфейсе. Следующая задача появится автоматически.</span>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
