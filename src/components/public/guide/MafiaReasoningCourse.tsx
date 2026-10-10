import { useEffect, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, RotateCcw, Target, TriangleAlert, CheckSquare2, Square } from 'lucide-react';
import {
  REASONING_LEVELS, reasoningMaxPoints, reasoningPassed, reasoningCasesForAttempt, reasoningCasesByIds,
  reasoningDecisionPoints, reasoningOptionOrder,
  type ReasoningLevel, type ReasoningCase, type ReasoningAnswer, type ReasoningDecision,
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
    <section className="space-y-2" data-testid="reasoning-review">
      <h3 className="text-[15px] font-semibold">Что стоит переосмыслить</h3>
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
            <p className="mt-1 text-[13px] leading-5 text-white/65">Твой выбор: {chosen?.label}</p>
            <p className="mt-1 text-[13px] leading-5 text-amber-100/85">{chosen?.feedback}</p>
            <p className="mt-2 text-[13px] leading-5 text-emerald-200/85"><strong>Более обоснованный ответ:</strong> {stronger?.label}</p>
          </>}
        </article>;
      })}
    </section>
  ) : <p className="text-[13px] text-emerald-200">Во всех вопросах ты выбрал хорошо обоснованный ответ.</p>;
};

/**
 * A self-contained public coach. It never writes to game, rating, tokens or production DB.
 * Exam feedback is specific to the selected explanation; on replay, the same concepts
 * are assessed independently rather than rewarding recollection of role guesses.
 */
export default function MafiaReasoningCourse({ onCourseComplete }: { onCourseComplete?: () => void }) {
  const [progress, setProgress] = useState<CourseProgress>(readProgress);
  const [levelIndex, setLevelIndex] = useState(0);
  const [selected, setSelected] = useState<ReasoningAnswer | null>(null);
  const [revealed, setRevealed] = useState(false);
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

  const selectLevel = (index: number) => {
    if (!reasoningUnlocked(index, progress.passed)) return;
    setLevelIndex(index);
    setSelected(null);
    setRevealed(false);
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
    if (passed && REASONING_LEVELS.every((item) => newPassed.includes(item.id)) && !courseComplete) onCourseComplete?.();
  };

  const points = current ? reasoningDecisionPoints(current.decision, selected ?? undefined) : 0;
  const feedback = current && typeof selected === 'number' ? current.decision.options[selected] : null;
  const bestOption = current?.decision.options.find((option) => option.points === 2);
  const outputLabel = (points: number) => points === 2 ? 'Хорошо подмечено' :
    points === 1 ? 'Не все варианты рассмотрены' : 'Здесь есть ошибка в рассуждении';

  return <div className="space-y-4" data-testid="mafia-reasoning-course">
    <header className="rounded-[24px] border border-amber-200/20 bg-gradient-to-br from-amber-300/[.1] to-white/[.02] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-amber-100/70"><Target className="h-4 w-4" /> Школа игрового мышления</div>
      <h2 className="mt-2 text-xl font-semibold leading-7">Не угадывай цвета. Объясняй действия.</h2>
      <p className="mt-2 text-[13px] leading-6 text-white/65">Сначала прочитай, что произошло за столом. Затем выбери ответ и посмотри разбор. Здесь важно не угадать цвет игрока, а понять его действия.</p>
      <p className="mt-2 text-[12px] leading-5 text-white/45">Ответы сохраняются только на этом устройстве. На игры, рейтинг Elo и награды обучение не влияет.</p>
    </header>

    <section aria-label="Уровни мышления" className="space-y-2">
      {REASONING_LEVELS.map((item, index) => {
        const locked = !reasoningUnlocked(index, progress.passed);
        const passed = progress.passed.includes(item.id);
        const active = index === levelIndex;
        return <button key={item.id} type="button" disabled={locked} data-testid={`reasoning-level-${item.id}`} onClick={() => selectLevel(index)}
          aria-pressed={active} className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left ${active ? 'border-amber-200/50 bg-amber-200/[.09]' : 'border-white/10 bg-white/[.035]'} ${locked ? 'opacity-50' : ''}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold ${passed ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/75'}`}>
            {locked ? <LockKeyhole className="h-4 w-4" /> : passed ? <Check className="h-5 w-5" /> : index + 1}
          </span>
          <span className="min-w-0 flex-1"><strong className="block text-[14px]">{item.title}</strong><span className="mt-0.5 block text-[11px] leading-4 text-white/50">{item.skill}</span></span>
          {progress.best[item.id] !== undefined ? <span className="shrink-0 text-[12px] text-white/45">{progress.best[item.id]} баллов</span> : null}
        </button>;
      })}
    </section>

    <section className="space-y-4 rounded-[24px] border border-white/10 bg-white/[.04] p-4" aria-label={`Глава ${levelIndex + 1}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/45">Глава {levelIndex + 1} из {REASONING_LEVELS.length}</p>
        <h3 className="mt-1 text-lg font-semibold">{level.title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-white/60">{level.lead}</p>
        {level.id === 'facts' ? <p className="mt-2 text-[12px] leading-5 text-amber-100/75">В банке {level.cases.length} ситуаций. За один раз — {cases.length}. При повторном прохождении задачи сменятся.</p> : null}
      </div>

      {done ? <div data-testid="reasoning-result" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <strong className="text-xl">{score} из {reasoningMaxPoints(level, cases)} баллов</strong>
          <p className="mt-2 text-[13px] leading-5 text-white/70">{passedNow
            ? 'Глава освоена. Можно переходить к более сложным игровым ситуациям.'
            : 'Посмотри, где ты принял догадку за факт, и попробуй ещё раз.'}</p>
          <p className="mt-2 text-[12px] text-white/50">Для следующей главы нужно {Math.ceil(reasoningMaxPoints(level, cases) * 5 / 6)} баллов. Мы оцениваем не угадывание цвета, а насколько обоснован твой ответ.</p>
        </div>
        <ResultDetails cases={cases} answers={answers} />
        <div className="grid gap-2">
          {passedNow && levelIndex < REASONING_LEVELS.length - 1 ? <button type="button" onClick={() => selectLevel(levelIndex + 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-3 font-semibold text-black">Следующая глава <ArrowRight className="h-4 w-4" /></button> : null}
          {courseComplete ? <p className="text-center text-sm text-emerald-200">Все пять глав пройдены. Попробуй применить этот подход на следующей игре.</p> : null}
          <button type="button" onClick={restart} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> {level.id === 'facts' ? 'Другие ситуации' : 'Пройти главу ещё раз'}</button>
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
          <p className="text-[11px] uppercase tracking-widest text-white/40">Ситуация {Math.floor(position / 2) + 1} из {cases.length} · Шаг {current.stepIndex + 1} из 2</p>
          <h4 className="text-[15px] font-semibold">{current.case.title}</h4>
          {current.case.facts.map((fact, index) => <p key={index} className="text-[13px] leading-5 text-white/80">{fact}</p>)}
        </div>
        <div className="space-y-1">
          {multiple ? <p className="text-[12px] text-amber-100/75">Можно выбрать несколько ответов. Отметь все версии, которые пока возможны — это не значит, что они доказаны.</p> : <p className="text-[12px] text-white/50">Выбери один наиболее обоснованный ответ.</p>}
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
        {revealed && hasSelection ? <div role="status" className="space-y-2 rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold">{points === 0 ? <TriangleAlert className="h-4 w-4 text-amber-200" /> : <Check className="h-4 w-4 text-emerald-200" />}{outputLabel(points)}</div>
          {multiple && Array.isArray(selected) ? (
            <div className="space-y-2">
              {current.decision.options.map((option, index) => {
                const checked = selected.includes(index);
                if (!checked && !option.plausible) return null;
                return <p key={index} className="text-[13px] leading-5 text-white/75">
                  <strong>{checked ? (option.plausible ? 'Возможная версия:' : 'Необоснованный вывод:') : 'Ты не отметил возможную версию:'}</strong> {option.label}. {option.feedback}
                </p>;
              })}
            </div>
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
    </section>
  </div>;
}
