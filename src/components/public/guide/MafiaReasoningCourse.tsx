import { useEffect, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, RotateCcw, Target, TriangleAlert } from 'lucide-react';
import {
  REASONING_LEVELS, reasoningMaxPoints, reasoningPassed,
  type ReasoningLevel,
} from '../../../lib/mafiaReasoningCourse.ts';

type CourseProgress = { answers: Record<string, number[]>; passed: string[]; best: Record<string, number> };
const STORAGE_KEY = 'mafia-reasoning-course-v1';
const blank = (): CourseProgress => ({ answers: {}, passed: [], best: {} });
const allDecisions = (level: ReasoningLevel) => level.cases.flatMap((item) =>
  item.steps.map((decision, stepIndex) => ({ case: item, decision, stepIndex })));
export const reasoningScore = (level: ReasoningLevel, answers: number[]): number =>
  allDecisions(level).reduce((total, { decision }, index) => total + (decision.options[answers[index]]?.points ?? 0), 0);
export const reasoningUnlocked = (levelIndex: number, passed: string[]): boolean =>
  levelIndex === 0 || passed.includes(REASONING_LEVELS[levelIndex - 1]?.id);
const readProgress = (): CourseProgress => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const result = blank();
    for (const level of REASONING_LEVELS) {
      const decisions = allDecisions(level);
      if (Array.isArray(raw.answers?.[level.id])) {
        result.answers[level.id] = raw.answers[level.id]
          .slice(0, decisions.length)
          .filter((value: unknown, index: number) =>
            typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < decisions[index].decision.options.length);
      }
      if (typeof raw.best?.[level.id] === 'number') {
        result.best[level.id] = Math.max(0, Math.min(reasoningMaxPoints(level), raw.best[level.id]));
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

const answerCount = (level: ReasoningLevel) => allDecisions(level).length;
const ResultDetails = ({ level, answers }: { level: ReasoningLevel; answers: number[] }) => {
  const mistakes = allDecisions(level).flatMap(({ decision, case: item }, index) =>
    decision.options[answers[index]]?.points === 2 ? [] : [{ decision, title: item.title, selected: answers[index] }]);
  return mistakes.length ? (
    <section className="space-y-2" data-testid="reasoning-review">
      <h3 className="text-[15px] font-semibold">Что стоит переосмыслить</h3>
      {mistakes.map(({ decision, title, selected }, index) => {
        const chosen = decision.options[selected];
        const stronger = decision.options.find((option) => option.points === 2);
        return <article key={index} className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[11px] text-white/45">{title}</p>
          <h4 className="mt-1 text-sm font-semibold leading-6">{decision.prompt}</h4>
          <p className="mt-1 text-[13px] leading-5 text-white/65">Твой выбор: {chosen?.label}</p>
          <p className="mt-1 text-[13px] leading-5 text-amber-100/85">{chosen?.feedback}</p>
          <p className="mt-2 text-[13px] leading-5 text-emerald-200/85"><strong>Сильнее:</strong> {stronger?.label}</p>
        </article>;
      })}
    </section>
  ) : <p className="text-[13px] text-emerald-200">Все решения опирались на сильную аргументацию.</p>;
};

/**
 * A self-contained public coach. It never writes to game, rating, tokens or production DB.
 * Exam feedback is specific to the selected explanation; on replay, the same concepts
 * are assessed independently rather than rewarding recollection of role guesses.
 */
export default function MafiaReasoningCourse({ onCourseComplete }: { onCourseComplete?: () => void }) {
  const [progress, setProgress] = useState<CourseProgress>(readProgress);
  const [levelIndex, setLevelIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const level = REASONING_LEVELS[levelIndex];
  const decisions = allDecisions(level);
  const answers = progress.answers[level.id] || [];
  const position = answers.length;
  const done = position >= decisions.length;
  const current = done ? null : decisions[position];
  const score = reasoningScore(level, answers);
  const passedNow = done && reasoningPassed(score, level);
  const courseComplete = REASONING_LEVELS.every((item) => progress.passed.includes(item.id));

  useEffect(() => saveProgress(progress), [progress]);

  const selectLevel = (index: number) => {
    if (!reasoningUnlocked(index, progress.passed)) return;
    setLevelIndex(index);
    setSelected(null);
    setRevealed(false);
  };
  const restart = () => {
    setProgress((prev) => ({ ...prev, answers: { ...prev.answers, [level.id]: [] } }));
    setSelected(null);
    setRevealed(false);
  };
  const next = () => {
    if (!revealed || selected === null || !current) return;
    const nextAnswers = [...answers, selected];
    const isFinal = nextAnswers.length === decisions.length;
    const nextScore = reasoningScore(level, nextAnswers);
    const passed = isFinal && reasoningPassed(nextScore, level);
    const newPassed = passed && !progress.passed.includes(level.id) ? [...progress.passed, level.id] : progress.passed;
    setProgress((prev) => ({
      answers: { ...prev.answers, [level.id]: nextAnswers },
      best: isFinal ? { ...prev.best, [level.id]: Math.max(prev.best[level.id] || 0, nextScore) } : prev.best,
      passed: newPassed,
    }));
    setSelected(null);
    setRevealed(false);
    if (passed && REASONING_LEVELS.every((item) => newPassed.includes(item.id)) && !courseComplete) onCourseComplete?.();
  };

  const feedback = current && selected !== null ? current.decision.options[selected] : null;
  const bestOption = current?.decision.options.find((option) => option.points === 2);
  const outputLabel = (points: number) => points === 2 ? 'Сильное рассуждение' : points === 1 ? 'Разумно, но не хватает проверки' : 'Логическая ловушка';

  return <div className="space-y-4" data-testid="mafia-reasoning-course">
    <header className="rounded-[24px] border border-amber-200/20 bg-gradient-to-br from-amber-300/[.1] to-white/[.02] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-amber-100/70"><Target className="h-4 w-4" /> Школа игрового мышления</div>
      <h2 className="mt-2 text-xl font-semibold leading-7">Не угадывай цвета. Объясняй действия.</h2>
      <p className="mt-2 text-[13px] leading-6 text-white/65">Пять ступеней: от факта и выгоды до построения чёрных троек. В каждой ситуации сделай два решения и объясни себе их последствия.</p>
      <p className="mt-2 text-[12px] leading-5 text-white/45">Результат сохраняется в этом браузере. На игры, Elo и награды не влияет.</p>
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
          {progress.best[item.id] !== undefined ? <span className="shrink-0 text-[12px] text-white/45">{progress.best[item.id]}/{reasoningMaxPoints(item)}</span> : null}
        </button>;
      })}
    </section>

    <section className="space-y-4 rounded-[24px] border border-white/10 bg-white/[.04] p-4" aria-label={`Глава ${levelIndex + 1}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/45">Глава {levelIndex + 1} из {REASONING_LEVELS.length}</p>
        <h3 className="mt-1 text-lg font-semibold">{level.title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-white/60">{level.lead}</p>
      </div>

      {done ? <div data-testid="reasoning-result" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <strong className="text-xl">{score} из {reasoningMaxPoints(level)} баллов</strong>
          <p className="mt-2 text-[13px] leading-5 text-white/70">{passedNow
            ? 'Глава освоена. Можно переходить к более сложным игровым ситуациям.'
            : 'Пока не хватает устойчивости. Посмотри конкретные ошибки и попробуй ещё раз.'}</p>
          <p className="mt-2 text-[12px] text-white/50">Для перехода нужно {Math.ceil(reasoningMaxPoints(level) * 5 / 6)} баллов. Слабое объяснение = 0, частичное = 1, сильное = 2.</p>
        </div>
        <ResultDetails level={level} answers={answers} />
        <div className="grid gap-2">
          {passedNow && levelIndex < REASONING_LEVELS.length - 1 ? <button type="button" onClick={() => selectLevel(levelIndex + 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-3 font-semibold text-black">Следующая глава <ArrowRight className="h-4 w-4" /></button> : null}
          {courseComplete ? <p className="text-center text-sm text-emerald-200">Все пять глав пройдены. Теперь повторяй ситуации и применяй этот алгоритм в реальных играх.</p> : null}
          <button type="button" onClick={restart} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Пройти главу ещё раз</button>
        </div>
      </div> : current ? <div data-testid="reasoning-task" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-white/50">Решение {position + 1} из {answerCount(level)}</span>
          <span className="text-[12px] text-white/50">Баллы: {score}</span>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {decisions.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < position ? 'bg-emerald-400' : index === position ? 'bg-amber-200' : 'bg-white/15'}`} />)}
        </div>
        <div className="space-y-2 rounded-2xl bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Ситуация {Math.floor(position / 2) + 1} из {level.cases.length} · {current.case.title}</p>
          {current.case.facts.map((fact, index) => <p key={index} className="text-[13px] leading-5 text-white/80">{fact}</p>)}
        </div>
        <h4 className="text-[16px] font-semibold leading-6">{current.decision.prompt}</h4>
        <div className="space-y-2" role="group" aria-label={current.decision.prompt}>
          {current.decision.options.map((option, index) => (
            <button key={option.label} type="button" disabled={revealed} aria-pressed={selected === index}
              data-testid={`reasoning-option-${index}`} onClick={() => setSelected(index)}
              className={`w-full min-h-12 rounded-2xl border px-3 py-3 text-left text-[13px] leading-5 transition-colors ${selected === index ? 'border-amber-200/70 bg-amber-200/[.1] text-white' : 'border-white/15 bg-white/[.025] text-white/75'} disabled:opacity-90`}>
              {option.label}
            </button>
          ))}
        </div>
        {revealed && feedback ? <div role="status" className="space-y-2 rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold">{feedback.points === 0 ? <TriangleAlert className="h-4 w-4 text-amber-200" /> : <Check className="h-4 w-4 text-emerald-200" />}{outputLabel(feedback.points)}</div>
          <p className="text-[13px] leading-5 text-white/75">{feedback.feedback}</p>
          {feedback.points !== 2 ? <p className="text-[13px] leading-5 text-emerald-200/85"><strong>Сильнее:</strong> {bestOption?.label}</p> : null}
        </div> : null}
        <button type="button" disabled={selected === null && !revealed} onClick={() => revealed ? next() : setRevealed(true)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
          {revealed ? (position === decisions.length - 1 ? 'Посмотреть разбор главы' : 'Следующее решение') : 'Проверить рассуждение'}
          <ArrowRight className="h-4 w-4" />
        </button>

      </div> : null}
    </section>
  </div>;
}
