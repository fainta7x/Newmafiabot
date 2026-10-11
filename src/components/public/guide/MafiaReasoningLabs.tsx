import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, RotateCcw, ShieldQuestion, AlertCircle, GitBranch, ClipboardCheck } from 'lucide-react';
import MafiaReasoningDecisionTree from './MafiaReasoningDecisionTree.tsx';
import MafiaReasoningDiagnostic from './MafiaReasoningDiagnostic.tsx';
import {
  REASONING_LABS, VOTE_PLANS, labCasesForAttempt, type LabCase, type LabTopic,
} from '../../../lib/mafiaReasoningLabs.ts';
import { reportLearningActivity } from '../../../lib/learningActivityClient.ts';

type LabProgress = {
  attempts: Record<string, number>;
  completed: Record<string, number>;
  answers: Record<string, number[]>;
};
const storageItem = 'mafia-reasoning-labs-v1';
const blank = (): LabProgress => ({ attempts: {}, completed: {}, answers: {} });
const questions = (cases: LabCase[]) => cases.flatMap((item) =>
  item.steps.map((step, index) => ({ caseId: item.id, caseTitle: item.title, step, index })));

const readProgress = (): LabProgress => {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageItem) || '{}') as Partial<LabProgress>;
    const result = blank();
    for (const topic of REASONING_LABS) {
      const rawAttempt = value.attempts?.[topic.id];
      const attempt = Number.isSafeInteger(rawAttempt) && rawAttempt! >= 0 && rawAttempt! <= 10000 ? rawAttempt! : 0;
      const items = questions(labCasesForAttempt(topic, attempt));
      const old = value.answers?.[topic.id];
      const answers: number[] = [];
      if (Array.isArray(old)) {
        for (let i = 0; i < Math.min(items.length, old.length); i++) {
          const answer: unknown = old[i];
          if (typeof answer !== 'number' || !Number.isInteger(answer) ||
            answer < 0 || answer >= items[i].step.options.length) break;
          answers.push(answer);
        }
      }
      result.answers[topic.id] = answers;
      result.attempts[topic.id] = attempt;
      const best = value.completed?.[topic.id];
      if (typeof best === 'number' && Number.isInteger(best) && best >= 0 && best <= items.length * 2)
        result.completed[topic.id] = best;
    }
    return result;
  } catch { return blank(); }
};

const save = (data: LabProgress) => {
  try { window.localStorage.setItem(storageItem, JSON.stringify(data)); } catch { /* practice works without storage */ }
};

const scoreFor = (items: ReturnType<typeof questions>, answers: number[]) =>
  answers.reduce((total, answer, index) => total + (items[index]?.step.options[answer]?.points ?? 0), 0);

const answerOrder = (length: number, index: number, attempt: number) =>
  Array.from({ length }, (_, order) => (order + index + attempt) % length);

/**
 * A training-only screen within the existing /guide?tab=quiz route.
 * It does not award Elo, achievements or gameplay rewards.
 */
export default function MafiaReasoningLabs({ onBack }: { onBack: () => void }) {
  const [progress, setProgress] = useState<LabProgress>(readProgress);
  const [extra, setExtra] = useState<'tree' | 'diagnostic' | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ownVersion, setOwnVersion] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const topic = REASONING_LABS.find((item) => item.id === topicId);
  const cases = topic ? labCasesForAttempt(topic, progress.attempts[topic.id] || 0) : [];
  const steps = questions(cases);
  const answers = topic ? (progress.answers[topic.id] || []) : [];
  const position = answers.length;
  const finished = !!topic && position === steps.length;
  const current = !finished ? steps[position] : null;
  const votePlan = current ? VOTE_PLANS.find((plan) => `vote-${plan.id}` === current.caseId) : undefined;
  const firstInCase = current?.index === 0;
  const promptSelf = (topic?.id === 'hypotheses' || topic?.id === 'timeline') && firstInCase;
  const visibleOptions = !promptSelf || showOptions;
  const totalScore = scoreFor(steps, answers);
  const correct = current && selected !== null ? current.step.options[selected] : null;
  const stronger = current?.step.options.find((item) => item.points === 2);

  useEffect(() => save(progress), [progress]);
  const moveTop = () => top.current?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
  const clearCurrent = () => {
    setSelected(null);
    setRevealed(false);
    setOwnVersion('');
    setShowOptions(false);
  };
  const selectTopic = (value: LabTopic) => {
    setTopicId(value.id);
    clearCurrent();
    moveTop();
  };
  const backToTopics = () => {
    setTopicId(null);
    clearCurrent();
    moveTop();
  };
  const next = () => {
    if (!topic || selected === null || !revealed) return;
    const updated = [...answers, selected];
    const isFinished = updated.length === steps.length;
    // One finished practice goes to the organizer's learning statistics (a practice has no pass mark: it counts as done).
    if (isFinished) reportLearningActivity({ track: 'reasoning-labs', item: topic.id, score: scoreFor(steps, updated), maxScore: steps.length * 2, passed: true });
    setProgress((prev) => ({
      ...prev,
      answers: { ...prev.answers, [topic.id]: updated },
      completed: isFinished ? {
        ...prev.completed,
        [topic.id]: Math.max(prev.completed[topic.id] || 0, scoreFor(steps, updated)),
      } : prev.completed,
    }));
    clearCurrent();
    moveTop();
  };
  const restart = () => {
    if (!topic) return;
    const nextAttempt = (progress.attempts[topic.id] || 0) + 1;
    setProgress((prev) => ({
      ...prev,
      attempts: { ...prev.attempts, [topic.id]: nextAttempt },
      answers: { ...prev.answers, [topic.id]: [] },
    }));
    clearCurrent();
    moveTop();
  };

  if (extra === 'tree') return <MafiaReasoningDecisionTree onBack={() => setExtra(null)} />;
  if (extra === 'diagnostic') return <MafiaReasoningDiagnostic onBack={() => setExtra(null)} />;

  return <div ref={top} data-testid="mafia-reasoning-labs" className="space-y-4">
    <header className="flex items-center gap-3">
      <button type="button" onClick={topic ? backToTopics : onBack}
        data-testid="reasoning-labs-back" className="flex min-h-11 items-center gap-1 rounded-xl border border-white/15 px-3 text-sm">
        <ChevronLeft className="h-4 w-4" /> {topic ? 'Упражнения' : 'Темы'}
      </button>
      <div className="min-w-0">
        <p className="text-[11px] text-white/45">Игровое мышление</p>
        <h2 className="text-lg font-semibold">{topic ? topic.title : 'Разборы партий'}</h2>
      </div>
    </header>

    {!topic ? <div className="space-y-2" data-testid="reasoning-labs-topics">
      <p className="px-1 text-[13px] text-white/60">Выберите, что потренировать. Каждое прохождение короткое.</p>
      {REASONING_LABS.map((item) => {
        const attempt = progress.attempts[item.id] || 0;
        const count = questions(labCasesForAttempt(item, attempt)).length;
        const answered = progress.answers[item.id]?.length || 0;
        return <button key={item.id} type="button" onClick={() => selectTopic(item)}
          data-testid={`reasoning-lab-topic-${item.id}`}
          className="flex min-h-[75px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100">
            {progress.completed[item.id] !== undefined ? <Check className="h-5 w-5" /> : <ShieldQuestion className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1"><strong className="block text-[14px]">{item.title}</strong>
            <span className="block text-[12px] text-white/50">{answered && answered < count ? `Продолжить · ${answered}/${count}` : item.detail}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/45" />
        </button>;
      })}
      <div className="space-y-2 pt-2">
        <p className="px-1 text-[12px] font-semibold text-white/65">Следующий уровень</p>
        <button type="button" data-testid="reasoning-lab-open-tree" onClick={() => setExtra('tree')}
          className="flex min-h-[75px] w-full items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-200/[.04] p-3 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><GitBranch className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[14px]">Дерево голосов</strong>
            <span className="block text-[12px] text-white/55">Что возможно, а что уже не изменить</span></span><ArrowRight className="h-4 w-4 text-white/50" />
        </button>
        <button type="button" data-testid="reasoning-lab-open-diagnostic" onClick={() => setExtra('diagnostic')}
          className="flex min-h-[75px] w-full items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-200/[.04] p-3 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><ClipboardCheck className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[14px]">Проверка мышления</strong>
            <span className="block text-[12px] text-white/55">Три ситуации без вариантов ответа</span></span><ArrowRight className="h-4 w-4 text-white/50" />
        </button>
      </div>
    </div> : finished ? <section data-testid="reasoning-labs-result" className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/[.05] p-4">
        <p className="text-xl font-semibold">{totalScore} из {steps.length * 2}</p>
        <p className="mt-1 text-sm text-white/60">Упражнение завершено. Можно разобрать ошибки или пройти другие ситуации.</p>
      </div>
      {steps.some((item, index) => item.step.options[answers[index]]?.points !== 2) ?
        <details className="rounded-2xl border border-white/15 p-3" data-testid="reasoning-labs-review">
          <summary className="cursor-pointer text-sm font-semibold">Разобрать ошибки</summary>
          <div className="mt-3 space-y-3">
            {steps.map((item, index) => item.step.options[answers[index]]?.points === 2 ? null :
              <div key={index} className="rounded-xl bg-white/[.04] p-3 text-[13px]">
                <p className="font-semibold">{item.step.question}</p>
                <p className="mt-1 text-white/65">{item.step.options[answers[index]]?.why}</p>
                <p className="mt-1 text-emerald-200/85">{item.step.options.find((option) => option.points === 2)?.label}</p>
              </div>)}
          </div>
        </details> : <p className="text-sm text-emerald-200">Все решения обоснованы.</p>}
      <button type="button" onClick={restart} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-black">
        <RotateCcw className="h-4 w-4" /> {topic.cases.length > 2 ? 'Другие ситуации' : 'Пройти ещё раз'}
      </button>
      <button type="button" onClick={backToTopics} className="min-h-12 w-full rounded-2xl border border-white/15 text-sm">Выбрать упражнение</button>
    </section> : current ? <section className="space-y-4" data-testid="reasoning-labs-task">
      <div className="flex items-center justify-between gap-2 text-[12px] text-white/55">
        <span>Вопрос {position + 1} из {steps.length}</span>
        <span>{totalScore} баллов</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">{steps.map((_, index) =>
        <span key={index} className={`h-1.5 flex-1 rounded-full ${index < position ? 'bg-emerald-300' : index === position ? 'bg-amber-200' : 'bg-white/15'}`} />)}</div>
      <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3 space-y-2">
        <p className="text-[11px] text-amber-100/70">{current.step.phase}</p>
        <h3 className="text-[16px] font-semibold">{current.caseTitle}</h3>
        {current.step.facts.map((fact, index) =>
          votePlan && index === 1 && current.index === 0 ? null :
            <p key={index} className="text-[13px] leading-5 text-white/80">{fact}</p>)}
        {votePlan && current.index === 0 ? <div data-testid="reasoning-vote-board" className="grid grid-cols-2 gap-2">
          {votePlan.candidates.map((candidate) => {
            const voters = Object.entries(votePlan.otherVotes).filter(([, target]) => target === candidate)
              .map(([voter]) => Number(voter)).sort((a, b) => a - b);
            return <div key={candidate} className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <p className="text-[13px] font-semibold">Кандидат №{candidate}</p>
              <p className="mt-0.5 text-[11px] text-white/50">{votePlan.black.includes(candidate) ? 'Чёрный' : 'Красный'}</p>
              <div className="mt-2 flex min-h-8 flex-wrap gap-1">
                {voters.map((voter) => <span key={voter}
                  className="grid h-7 min-w-7 place-items-center rounded-lg bg-white/10 px-1 text-[12px] text-white/85">{voter}</span>)}
              </div>
              <p className="mt-2 text-[11px] text-white/55">Рук: {voters.length}</p>
            </div>;
          })}
        </div> : null}
      </div>
      <h4 className="text-[16px] font-semibold leading-6">{current.step.question}</h4>
      {promptSelf && !showOptions ? <div className="space-y-2 rounded-2xl border border-white/10 p-3" data-testid="reasoning-labs-self-explain">
        <label htmlFor="reasoning-own-version" className="block text-[13px] text-white/75">Сначала своя версия — коротко, как за столом</label>
        <textarea id="reasoning-own-version" value={ownVersion} onChange={(e) => setOwnVersion(e.target.value.slice(0, 400))}
          rows={2} placeholder="Что произошло и почему?" className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-[13px] text-white placeholder:text-white/40" />
        <button type="button" onClick={() => setShowOptions(true)}
          className="min-h-11 w-full rounded-xl border border-white/20 text-sm">Сравнить с вариантами <ArrowRight className="ml-1 inline h-4 w-4" /></button>
      </div> : null}
      {visibleOptions ? <>
        <div className="space-y-2" role="group" aria-label={current.step.question}>
          {answerOrder(current.step.options.length, position, progress.attempts[topic.id] || 0).map((index) => {
            const option = current.step.options[index];
            return <button key={index} type="button" disabled={revealed} aria-pressed={selected === index}
              data-testid={`reasoning-lab-option-${index}`} onClick={() => setSelected(index)}
              className={`w-full min-h-12 rounded-2xl border px-3 py-3 text-left text-[13px] leading-5 ${selected === index ? 'border-amber-200/75 bg-amber-200/[.09]' : 'border-white/15 bg-white/[.02]'}`}>{option.label}</button>;
          })}
        </div>
        {revealed && correct ? <div role="status" className="rounded-2xl border border-white/10 bg-white/[.05] p-3 text-[13px] leading-5">
          <p className="flex items-center gap-2 font-semibold">{correct.points === 2 ? <Check className="h-4 w-4 text-emerald-200" /> : <AlertCircle className="h-4 w-4 text-amber-200" />}
            {correct.points === 2 ? 'Верно' : correct.points === 1 ? 'Частично' : 'Есть ошибка'}
          </p>
          {ownVersion.trim() ? <p className="mt-2 text-white/65">Своя версия: {ownVersion.trim()}</p> : null}
          <p className="mt-2 text-white/75">{correct.why}</p>
          {correct.points !== 2 ? <p className="mt-2 text-emerald-200/85"><strong>Лучше:</strong> {stronger?.label}</p> : null}
        </div> : null}
        <button type="button" disabled={selected === null} onClick={revealed ? next : () => setRevealed(true)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
          {revealed ? position === steps.length - 1 ? 'Результат' : 'Дальше' : 'Разобрать ответ'} <ArrowRight className="h-4 w-4" />
        </button>
      </> : null}
    </section> : null}
  </div>;
}
