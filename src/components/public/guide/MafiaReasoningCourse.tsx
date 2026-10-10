import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Check, LockKeyhole, RotateCcw, TriangleAlert, CheckSquare2, Square } from 'lucide-react';
import {
  REASONING_LEVELS, reasoningMaxPoints, reasoningPassed, reasoningCasesForAttempt, reasoningCasesByIds,
  reasoningDecisionPoints, reasoningOptionOrder,
  type ReasoningLevel, type ReasoningCase, type ReasoningAnswer,
} from '../../../lib/mafiaReasoningCourse.ts';

type CourseProgress = { answers: Record<string, ReasoningAnswer[]>; passed: string[]; best: Record<string, number>; caseIds: Record<string, string[]>; attempts: Record<string, number> };
const STORAGE_KEY = 'mafia-reasoning-course-v1';
const blank = (): CourseProgress => ({ answers: {}, passed: [], best: {}, caseIds: {}, attempts: {} });
const allDecisions = (cases: ReasoningCase[]) => cases.flatMap((item) =>
  item.steps.map((decision, stepIndex) => ({ case: item, decision, stepIndex })));
export const reasoningScore = (level: ReasoningLevel, answers: ReasoningAnswer[], cases: ReasoningCase[] = reasoningCasesForAttempt(level, 0)): number =>
  allDecisions(cases).reduce((total, { decision }, index) => total + reasoningDecisionPoints(decision, answers[index]), 0);
export const reasoningUnlocked = (levelIndex: number, passed: string[]): boolean =>
  levelIndex === 0 || passed.includes(REASONING_LEVELS[levelIndex - 1]?.id);
const readProgress = (): CourseProgress => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const result = blank();
    for (const level of REASONING_LEVELS) {
      // Keep a partially completed v1 first chapter on its original three cases.
      // New starts and all repeat attempts use a rotating five-case selection.
      const savedIds = Array.isArray(raw.caseIds?.[level.id])
        ? raw.caseIds[level.id].filter((id: unknown) => typeof id === 'string')
        : level.id === 'facts' && Array.isArray(raw.answers?.facts) && raw.answers.facts.length > 0
          ? ['eyes', 'reply', 'votes'] : [];
      const cases = reasoningCasesByIds(level, savedIds);
      result.caseIds[level.id] = cases.map((item) => item.id);
      result.attempts[level.id] = Number.isInteger(raw.attempts?.[level.id]) && raw.attempts[level.id] >= 0
        ? raw.attempts[level.id] : 0;
      const decisions = allDecisions(cases);
      if (Array.isArray(raw.answers?.[level.id])) {
        const checked: ReasoningAnswer[] = [];
        for (let index = 0; index < Math.min(raw.answers[level.id].length, decisions.length); index++) {
          const value: unknown = raw.answers[level.id][index];
          const question = decisions[index].decision;
          const valid = question.mode === 'multiple'
            ? Array.isArray(value) && value.length > 0 && new Set(value).size === value.length &&
              value.every((item: unknown) => typeof item === 'number' && Number.isInteger(item) &&
                item >= 0 && item < question.options.length)
            : typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < question.options.length;
          if (!valid) break; // do not attach a later answer to the wrong scenario
          checked.push(value as ReasoningAnswer);
        }
        result.answers[level.id] = checked;
      }
      if (typeof raw.best?.[level.id] === 'number') {
        result.best[level.id] = Math.max(0, Math.min(reasoningMaxPoints(level, cases), raw.best[level.id]));
      }
      if (Array.isArray(raw.passed) && raw.passed.includes(level.id)) result.passed.push(level.id);
    }
    // Earlier stages must be passed; an invalid/tampered cache never opens higher stages.
    const savedPasses: string[] = Array.isArray(raw.passed) ? raw.passed.filter((item: unknown) => typeof item === 'string') : [];
    result.passed = REASONING_LEVELS.map((item) => item.id).filter((id, index) =>
      savedPasses.includes(id) && REASONING_LEVELS.slice(0, index).every((previous) => savedPasses.includes(previous.id)));
    return result;
  } catch { return blank(); }
};
const saveProgress = (value: CourseProgress) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* public guide can run with storage disabled */ }
};

const answerCount = (cases: ReasoningCase[]) => allDecisions(cases).length;
const ResultDetails = ({ cases, answers }: { cases: ReasoningCase[]; answers: ReasoningAnswer[] }) => {
  const mistakes = allDecisions(cases).flatMap(({ decision, case: item }, index) =>
    reasoningDecisionPoints(decision, answers[index]) === 2 ? [] : [{ decision, title: item.title, selected: answers[index] }]);
  return mistakes.length ? (
    <details className="space-y-2" data-testid="reasoning-review">
      <summary className="cursor-pointer text-[15px] font-semibold">Разобрать ошибки · {mistakes.length}</summary>
      <div className="mt-2 space-y-2">
      {mistakes.map(({ decision, title, selected }, index) => {
        const chosen = typeof selected === 'number' ? decision.options[selected] : null;
        const stronger = decision.options.find((option) => option.points === 2);
        return <article key={index} className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[11px] text-white/45">{title}</p>
          <h4 className="mt-1 text-sm font-semibold leading-6">{decision.prompt}</h4>
          {decision.mode === 'multiple' && Array.isArray(selected) ? (
            <div className="mt-2 space-y-2">
              {decision.options.map((option, optionIndex) => {
                const wasSelected = selected.includes(optionIndex);
                if (!wasSelected && !option.plausible) return null;
                return <p key={optionIndex} className="text-[13px] leading-5 text-white/70">
                  <strong>{wasSelected ? (option.plausible ? 'Подходит:' : 'Не подходит:') : 'Стоило рассмотреть:'}</strong> {option.label}. {option.feedback}
                </p>;
              })}
            </div>
          ) : <>
            <p className="mt-1 text-[13px] leading-5 text-white/65">Выбор: {chosen?.label}</p>
            <p className="mt-1 text-[13px] leading-5 text-amber-100/85">{chosen?.feedback}</p>
            <p className="mt-2 text-[13px] leading-5 text-emerald-200/85"><strong>Более обоснованный ответ:</strong> {stronger?.label}</p>
          </>}
        </article>;
      })}
      </div>
    </details>
  ) : <p className="text-[13px] text-emerald-200">Все ответы верны.</p>;
};

/**
 * A self-contained public coach. It never writes to game, rating, tokens or production DB.
 * Exam feedback is specific to the selected explanation; on replay, the same concepts
 * are assessed independently rather than rewarding recollection of role guesses.
 */
export default function MafiaReasoningCourse({ onCourseComplete }: { onCourseComplete?: () => void }) {
  const [progress, setProgress] = useState<CourseProgress>(readProgress);
  const [levelIndex, setLevelIndex] = useState(0);
  const [view, setView] = useState<'chapters' | 'practice'>('chapters');
  const courseTop = useRef<HTMLDivElement>(null);
  const initialView = useRef(true);
  const [selected, setSelected] = useState<ReasoningAnswer | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ownReason, setOwnReason] = useState('');
  const level = REASONING_LEVELS[levelIndex];
  const cases = reasoningCasesByIds(level, progress.caseIds[level.id] || []);
  const decisions = allDecisions(cases);
  const answers = progress.answers[level.id] || [];
  const position = answers.length;
  const done = position >= decisions.length;
  const current = done ? null : decisions[position];
  const order = current ? reasoningOptionOrder(current.decision, position, progress.attempts[level.id] || 0) : [];
  const multiple = current?.decision.mode === 'multiple';
  const hasSelection = multiple ? Array.isArray(selected) && selected.length > 0 : typeof selected === 'number';
  const score = reasoningScore(level, answers, cases);
  const passedNow = done && (progress.passed.includes(level.id) || reasoningPassed(score, level, cases));
  const courseComplete = REASONING_LEVELS.every((item) => progress.passed.includes(item.id));

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    if (initialView.current) { initialView.current = false; return; }
    courseTop.current?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
  }, [view, levelIndex]);

  const selectLevel = (index: number) => {
    if (!reasoningUnlocked(index, progress.passed)) return;
    setLevelIndex(index);
    setView('practice');
    setSelected(null);
    setRevealed(false);
    setOwnReason('');
  };
  const restart = () => {
    setProgress((prev) => {
      const attempt = (prev.attempts[level.id] || 0) + 1;
      return {
        ...prev,
        attempts: { ...prev.attempts, [level.id]: attempt },
        caseIds: { ...prev.caseIds, [level.id]: reasoningCasesForAttempt(level, attempt).map((item) => item.id) },
        answers: { ...prev.answers, [level.id]: [] },
      };
    });
    setSelected(null);
    setRevealed(false);
    setOwnReason('');
  };
  const next = () => {
    if (!revealed || !hasSelection || selected === null || !current) return;
    const nextAnswers = [...answers, selected];
    const isFinal = nextAnswers.length === decisions.length;
    const nextScore = reasoningScore(level, nextAnswers, cases);
    const passed = isFinal && reasoningPassed(nextScore, level, cases);
    const newPassed = passed && !progress.passed.includes(level.id) ? [...progress.passed, level.id] : progress.passed;
    setProgress((prev) => ({
      ...prev,
      answers: { ...prev.answers, [level.id]: nextAnswers },
      best: isFinal ? { ...prev.best, [level.id]: Math.max(prev.best[level.id] || 0, nextScore) } : prev.best,
      passed: newPassed,
    }));
    setSelected(null);
    setRevealed(false);
    setOwnReason('');
    if (passed && REASONING_LEVELS.every((item) => newPassed.includes(item.id)) && !courseComplete) onCourseComplete?.();
  };

  const points = current ? reasoningDecisionPoints(current.decision, selected ?? undefined) : 0;
  const feedback = current && typeof selected === 'number' ? current.decision.options[selected] : null;
  const bestOption = current?.decision.options.find((option) => option.points === 2);
  const outputLabel = (points: number) => points === 2 ? 'Хорошо подмечено' :
    points === 1 ? 'Не все варианты рассмотрены' : 'Здесь есть ошибка в рассуждении';

  return <div ref={courseTop} className="space-y-4" data-testid="mafia-reasoning-course">
    {view === 'chapters' ? <>
      <header className="px-1">
        <h2 className="text-xl font-semibold">Игровое мышление</h2>
        <p className="mt-1 text-sm text-white/60">Выберите тему, чтобы начать.</p>
      </header>
      <section aria-label="Уровни мышления" className="space-y-2">
        {REASONING_LEVELS.map((item, index) => {
          const locked = !reasoningUnlocked(index, progress.passed);
          const passed = progress.passed.includes(item.id);
          const total = answerCount(reasoningCasesByIds(item, progress.caseIds[item.id] || []));
          const answered = progress.answers[item.id]?.length || 0;
          return <button key={item.id} type="button" disabled={locked}
            data-testid={`reasoning-level-${item.id}`} onClick={() => selectLevel(index)}
            className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-3 py-3 text-left ${locked ? 'opacity-45' : 'hover:border-amber-200/40'}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold ${passed ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/75'}`}>
              {locked ? <LockKeyhole className="h-4 w-4" /> : passed ? <Check className="h-5 w-5" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1"><strong className="block text-[14px]">{item.title}</strong>
              <span className="mt-0.5 block text-[12px] leading-4 text-white/50">
                {locked ? 'Откроется после предыдущей темы' : passed ? 'Пройдено · можно повторить' : answered === total ? 'Посмотреть результат' : answered ? `Продолжить · ${answered}/${total}` : `${total} вопросов`}
              </span>
            </span>
            {!locked ? <ArrowRight className="h-4 w-4 shrink-0 text-white/55" /> : null}
          </button>;
        })}
      </section>
    </> : <section className="space-y-4" aria-label={`Глава ${levelIndex + 1}`} data-testid="reasoning-practice">
      <header className="flex items-start gap-3">
        <button type="button" data-testid="reasoning-back-to-chapters" onClick={() => {
          setView('chapters');
          setSelected(null);
          setRevealed(false);
          setOwnReason('');
        }} className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-white/15 px-3 text-sm text-white/80">
          <ChevronLeft className="h-4 w-4" /> Темы
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[11px] text-white/45">Тема {levelIndex + 1} из {REASONING_LEVELS.length}</p>
          <h3 className="text-lg font-semibold leading-6">{level.title}</h3>
        </div>
      </header>

      {done ? <div data-testid="reasoning-result" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <strong className="text-xl">{score} из {reasoningMaxPoints(level, cases)} баллов</strong>
          <p className="mt-2 text-[13px] leading-5 text-white/70">{passedNow
            ? 'Тема пройдена!'
            : 'Ошибки можно разобрать ниже и попробовать ещё раз.'}</p>
        </div>
        <ResultDetails cases={cases} answers={answers} />
        <div className="grid gap-2">
          {passedNow && levelIndex < REASONING_LEVELS.length - 1 ? <button type="button" onClick={() => selectLevel(levelIndex + 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-3 font-semibold text-black">Следующая тема <ArrowRight className="h-4 w-4" /></button> : null}
          {courseComplete ? <p className="text-center text-sm text-emerald-200">Все темы пройдены.</p> : null}
          <button type="button" onClick={restart} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> {level.id === 'facts' ? 'Другие ситуации' : 'Пройти ещё раз'}</button>
        </div>
      </div> : current ? <div data-testid="reasoning-task" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-white/50">Вопрос {position + 1} из {answerCount(cases)}</span>
          <span className="text-[12px] text-white/50">Баллы: {score}</span>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {decisions.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < position ? 'bg-emerald-400' : index === position ? 'bg-amber-200' : 'bg-white/15'}`} />)}
        </div>
        <div className="space-y-2 rounded-2xl bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Ситуация {Math.floor(position / 2) + 1} из {cases.length}</p>
          <h4 className="text-[15px] font-semibold">{current.case.title}</h4>
          {current.case.facts.map((fact, index) => <p key={index} className="text-[13px] leading-5 text-white/80">{fact}</p>)}
        </div>
        <div className="space-y-1">
          {multiple ? <p className="text-[12px] text-amber-100/75">Можно выбрать несколько вариантов</p> : null}
          <h4 className="text-[16px] font-semibold leading-6">{current.decision.prompt}</h4>
        </div>

        <div className="space-y-2" role="group" aria-label={current.decision.prompt}>
          {order.map((index) => {
            const option = current.decision.options[index];
            const checked = Array.isArray(selected) ? selected.includes(index) : selected === index;
            return <button key={index} type="button" disabled={revealed} aria-pressed={checked}
              data-testid={`reasoning-option-${index}`} onClick={() => setSelected((prev) => {
                if (!multiple) return index;
                const chosen = Array.isArray(prev) ? prev : [];
                return chosen.includes(index) ? chosen.filter((item) => item !== index) : [...chosen, index].sort((a, b) => a - b);
              })}
              className={`flex w-full min-h-12 items-center gap-2 rounded-2xl border px-3 py-3 text-left text-[13px] leading-5 transition-colors ${checked ? 'border-amber-200/70 bg-amber-200/[.1] text-white' : 'border-white/15 bg-white/[.025] text-white/75'} disabled:opacity-90`}>
              {multiple ? (checked ? <CheckSquare2 className="h-5 w-5 shrink-0 text-amber-200" /> : <Square className="h-5 w-5 shrink-0 text-white/40" />) : null}
              <span>{option.label}</span>
            </button>;
          })}
        </div>
        <details className="rounded-xl border border-white/10 bg-white/[.025] px-3 py-2">
          <summary className="cursor-pointer text-[12px] text-white/70">Своя версия (необязательно)</summary>
          <textarea data-testid="reasoning-own-explanation" value={ownReason} onChange={(event) => setOwnReason(event.target.value.slice(0, 350))}
            disabled={revealed} rows={2} placeholder="На чём основан выбор?"
            className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-[13px] leading-5 text-white placeholder:text-white/35 outline-none focus:border-amber-200/50 disabled:opacity-70" />
        </details>
        {revealed && hasSelection ? <div role="status" className="space-y-2 rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold">{points === 0 ? <TriangleAlert className="h-4 w-4 text-amber-200" /> : <Check className="h-4 w-4 text-emerald-200" />}{outputLabel(points)}</div>
          {ownReason.trim() ? <p data-testid="reasoning-own-review" className="text-[13px] leading-5 text-white/65"><strong>Своя версия:</strong> {ownReason.trim()}</p> : null}
          {multiple && Array.isArray(selected) ? (
            <details>
              <summary className="cursor-pointer text-[13px] font-medium text-amber-100/85">Разобрать варианты</summary>
              <div className="mt-2 space-y-2">
              {current.decision.options.map((option, index) => {
                const checked = selected.includes(index);
                if (!checked && !option.plausible) return null;
                return <p key={index} className="text-[13px] leading-5 text-white/75">
                  <strong>{checked ? (option.plausible ? 'Возможная версия:' : 'Необоснованный вывод:') : 'Возможная версия не отмечена:'}</strong> {option.label}. {option.feedback}
                </p>;
              })}
              </div>
            </details>
          ) : <>
            <p className="text-[13px] leading-5 text-white/75"><strong>Почему:</strong> {feedback?.feedback}</p>
            {points !== 2 ? <p className="text-[13px] leading-5 text-emerald-200/85"><strong>Более обоснованный ответ:</strong> {bestOption?.label}</p> : null}
          </>}
        </div> : null}
        <button type="button" disabled={!hasSelection} onClick={() => revealed ? next() : setRevealed(true)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
          {revealed ? (position === decisions.length - 1 ? 'Посмотреть разбор главы' : 'Следующий вопрос') : 'Разобрать ответ'}
          <ArrowRight className="h-4 w-4" />
        </button>

      </div> : null}
    </section>}
  </div>;
}
