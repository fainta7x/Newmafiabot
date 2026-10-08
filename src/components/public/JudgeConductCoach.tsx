import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff } from 'lucide-react';
import type { PersistedLiveSession } from '../LiveGameEngine/liveSessionStorage.ts';
import { getTrainingPrompt, type TrainingPrompt } from '../../lib/judgeConductTraining.ts';

const TOUR: TrainingPrompt[] = [
  { title: 'Центральная панель', detail: 'Здесь показаны этап игры, таймер и кнопки перехода. Ведущий начинает и завершает речи именно здесь.', focus: 'live-judge-hud' },
  { title: 'Действия игрока', detail: 'Чтобы выставить кандидата, открой действия нужного игрока на столе или в панели судейства.', focus: 'live-player-actions-selector' },
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
  const [collapsed, setCollapsed] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const isTour = session !== null && tourIndex < TOUR.length;
  const progress = useMemo(() => getTrainingPrompt(session), [session]);
  const task = isTour ? TOUR[tourIndex] : progress;

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
    if (collapsed || !highlight) return undefined;
    const selector = '[data-testid="' + task.focus + '"]';
    const update = () => {
      const target = document.querySelector<HTMLElement>(selector);
      document.querySelectorAll('.judge-training-focus').forEach((element) => {
        if (element !== target) element.classList.remove('judge-training-focus');
      });
      target?.classList.add('judge-training-focus');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll('.judge-training-focus').forEach((element) => element.classList.remove('judge-training-focus'));
    };
  }, [collapsed, highlight, task.focus, session?.phase]);

  if (!session) return null;
  return (
    <div className="sticky top-0 z-[115] mx-auto w-full max-w-7xl px-2 py-2 sm:px-4" data-testid="judge-conduct-coach">
      <style>{'.judge-training-focus { outline: 2px solid rgba(251,191,36,.85) !important; outline-offset: 2px; box-shadow: 0 0 0 3px rgba(245,158,11,.12) !important; }'}</style>
      <section className="rounded-2xl border border-amber-300/30 bg-[#191914] px-3 py-2.5 text-white shadow-[0_5px_18px_rgba(0,0,0,.35)]">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenCheck className="h-4 w-4 shrink-0 text-amber-200"/>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-amber-200/75">
              {isTour ? 'Задание · знакомство ' + (tourIndex + 1) + '/' + TOUR.length : 'Задание · учебная партия'}
            </div>
            <div className={'truncate text-sm font-semibold ' + (task.warning ? 'text-rose-200' : 'text-white')} aria-live="polite">{task.title}</div>
          </div>
          <button type="button" onClick={() => setHighlight((v) => !v)} aria-label={highlight ? 'Отключить подсветку элементов' : 'Включить подсветку элементов'} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/60">
            {highlight ? <Eye className="h-4 w-4"/> : <EyeOff className="h-4 w-4"/>}
          </button>
          <button type="button" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Развернуть задание' : 'Свернуть задание'} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/60">
            {collapsed ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
          </button>
        </div>
        {!collapsed && (
          <div className="mt-1.5 pl-6">
            <p className="text-xs leading-[18px] text-white/65">{task.detail}</p>
            {isTour && (
              <button type="button" onClick={() => setTourIndex((v) => v + 1)} className="mt-2 flex min-h-9 items-center gap-1 rounded-lg bg-amber-200 px-3 text-xs font-semibold text-black">
                {tourIndex === TOUR.length - 1 ? 'Перейти к заданиям' : 'Следующий элемент'} <ChevronRight className="h-4 w-4"/>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
