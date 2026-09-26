import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPERT_SECONDS, checkExpertAnswer, completeExpertAnswer, expertHistory, generateExpertExam, generateExpertScenario,
  solveExpert, type ExpertScenario,
} from '../../lib/splitVoteExpert.ts';
import { scrollPageTop } from '../../lib/scrollPageTop.ts';
import { seatList } from '../../lib/splitVoteTraining.ts';

type Mode = 'practice' | 'exam' | 'endless';
type Answer = { scenario: ExpertScenario; answer: Record<number, number[]> };
type Outcome = { ok: boolean; timedOut: boolean; totals: Record<number, number>; reason?: string; answer: Record<number, number[]> };

const seats = (list: number[]) => (list.length ? seatList(list) : 'никто');

/** What already happened before the learner takes over. */
export const describeBreak = (scenario: ExpertScenario) => {
  const { broken } = scenario;
  if (broken.kind === 'short') return `В ${broken.nominee} проголосовали только четверо: ${seats(broken.voters)}. Нужно было пятеро.`;
  const byNominee = scenario.candidates
    .map((nominee) => ({ nominee, voters: broken.votes.filter((vote) => vote.nominee === nominee).map((vote) => vote.voter) }))
    .filter((item) => item.voters.length);
  const parts = byNominee.map((item) => `в ${item.nominee} — ${seats(item.voters)}`);
  return `По ошибке проголосовали ${parts.join('; ')}. ${broken.votes.length === 1 ? 'Этот голос уже потрачен.' : 'Эти голоса уже потрачены.'}`;
};

/** One timed rescue task. Reaching the last nominee sends everyone left to it and checks the result. */
const ExpertRound = ({ scenario, onDone }: { scenario: ExpertScenario; onDone: (outcome: Outcome) => void }) => {
  const { votes, startIndex } = useMemo(() => expertHistory(scenario), [scenario]);
  const spent = useMemo(() => Object.values(votes).flat(), [votes]);
  const [index, setIndex] = useState(startIndex);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [left, setLeft] = useState(EXPERT_SECONDS);
  const done = useRef(false);

  const finish = useCallback((answer: Record<number, number[]>, timedOut: boolean) => {
    if (done.current) return;
    done.current = true;
    const complete = completeExpertAnswer(scenario, answer);
    const check = timedOut ? { ...checkExpertAnswer(scenario, answer), ok: false } : checkExpertAnswer(scenario, answer);
    onDone({ ok: check.ok, timedOut, totals: check.totals, reason: check.reason, answer: complete });
  }, [onDone, scenario]);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, EXPERT_SECONDS - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (left === 0) finish({ ...assignments, [scenario.candidates[index]]: selected }, true); }, [left, finish, assignments, scenario, index, selected]);

  const lastIndex = scenario.candidates.length - 1;
  const candidate = scenario.candidates[index];
  const taken = [...spent, ...Object.values(assignments).flat()];
  const available = Array.from({ length: 10 }, (_, seat) => seat + 1).filter((seat) => !taken.includes(seat));

  const advance = () => {
    const next = { ...assignments, [candidate]: selected };
    setSelected([]);
    // The last nominee gets everyone who has not voted yet — no choice left, so check right away.
    if (index + 1 >= lastIndex) { setAssignments(next); finish(next, false); return; }
    setAssignments(next);
    setIndex(index + 1);
  };

  return (
    <div className="space-y-3" data-testid="split-vote-expert">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className={`h-full rounded-full transition-[width] duration-300 ${left <= 5 ? 'bg-rose-400' : 'bg-white'}`} style={{ width: `${(left / EXPERT_SECONDS) * 100}%` }} />
        </div>
        <span data-testid="split-vote-timer" className={`w-10 text-right text-sm font-bold tabular-nums ${left <= 5 ? 'text-rose-300' : 'text-white'}`}>{left} с</span>
      </div>
      <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2.5 text-sm leading-6 text-amber-100" data-testid="split-vote-break">⚠️ {describeBreak(scenario)}</p>
      {index < lastIndex ? <>
        <h3 className="text-base font-semibold">Кто голосует в {candidate}?</h3>
        <p className="text-xs text-white/60">Кто ни за кого не проголосует, уйдёт в последнего — в {scenario.candidates[lastIndex]}.</p>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Голосующие игроки">
          {available.map((seat) => (
            <button key={seat} type="button" aria-pressed={selected.includes(seat)} onClick={() => setSelected((current) => (current.includes(seat) ? current.filter((value) => value !== seat) : [...current, seat]))}
              className={`min-h-12 rounded-2xl border text-sm font-semibold ${selected.includes(seat) ? 'border-white bg-white/20' : 'border-white/15'}`}>{seat}</button>
          ))}
        </div>
        <button type="button" onClick={advance} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{selected.length ? 'Продолжить' : 'Пропустить'}</button>
      </> : null}
    </div>
  );
};

const OutcomeView = ({ scenario, outcome }: { scenario: ExpertScenario; outcome: Outcome }) => {
  const example = useMemo(() => solveExpert(scenario), [scenario]);
  const { votes, startIndex } = expertHistory(scenario);
  return (
    <div role="status" className="space-y-2 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
      <p className="font-semibold text-white">{outcome.ok ? 'Попил спасён!' : outcome.timedOut ? 'Время вышло.' : 'Попил не состоялся.'}</p>
      {!outcome.ok && outcome.reason && !outcome.timedOut ? <p>{outcome.reason}</p> : null}
      <p className="text-white/60">Итог голосования:</p>
      <ul className="space-y-0.5">
        {scenario.candidates.map((candidate) => <li key={candidate}>{candidate}: <strong className="text-white">{outcome.totals[candidate] ?? 0}</strong></li>)}
      </ul>
      {!outcome.ok && example ? <>
        <p className="pt-1 text-white/60">Например, так:</p>
        <ul className="space-y-0.5">
          {scenario.candidates.map((candidate, index) => (
            <li key={candidate}>В {candidate}: {seats(index < startIndex ? votes[candidate] : example[candidate] ?? [])}{index < startIndex ? ' (уже проголосовали)' : ''}</li>
          ))}
        </ul>
        <p className="text-white/60">Кто страхует — неважно. Остальные голосуют как по обычным правилам попила.</p>
      </> : null}
    </div>
  );
};

/** Practice, exam and endless play of the expert level. */
export const SplitVoteExpertSession = ({ mode, onExit, onPassed, scenarios }: {
  mode: Mode;
  onExit: () => void;
  onPassed: (answers: Answer[]) => Promise<boolean>;
  /** Fixed tasks instead of generated ones (tests and previews). */
  scenarios?: ExpertScenario[];
}) => {
  const [queue, setQueue] = useState<ExpertScenario[]>(() => scenarios || (mode === 'endless' ? [generateExpertScenario()] : generateExpertExam()));
  const [position, setPosition] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState<'passed' | 'failed' | 'completed' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [round, setRound] = useState(0);
  const scenario = queue[position];
  // A timed task must open from its conditions.
  useEffect(() => { scrollPageTop(); }, [position, round]);

  const save = async (list: Answer[]) => {
    setSaving(true); setSaveError(false);
    const ok = await onPassed(list).catch(() => false);
    setSaving(false);
    if (ok) setFinished('passed'); else setSaveError(true);
  };

  const done = useCallback((result: Outcome) => {
    setOutcome(result);
    if (result.ok) setCorrect((value) => value + 1);
    const list = [...answers, { scenario: queue[position], answer: result.answer }];
    setAnswers(list);
    if (mode === 'exam' && !result.ok) setFinished('failed');
    else if (mode === 'exam' && position === 4) void save(list);
    else if (mode === 'practice' && position === 4) setFinished('completed');
  }, [answers, mode, position, queue]);

  const next = () => {
    setOutcome(null);
    if (mode === 'endless') setQueue((current) => [...current, generateExpertScenario()]);
    setPosition((value) => value + 1);
    setRound((value) => value + 1);
  };
  const restart = () => {
    setQueue(mode === 'endless' ? [generateExpertScenario()] : generateExpertExam());
    setPosition(0); setOutcome(null); setAnswers([]); setCorrect(0); setFinished(null); setSaveError(false); setRound((value) => value + 1);
  };

  return (
    <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="split-vote-question">
      <div className="flex items-center justify-between gap-2 text-xs text-white/50">
        <span>Эксперт · {mode === 'exam' ? 'экзамен' : mode === 'practice' ? 'практика' : 'без конца'}</span>
        <span>{mode === 'endless' ? `Задача ${position + 1}` : `Задача ${Math.min(position + 1, 5)} из 5`}</span>
      </div>
      <p data-testid="split-vote-nominees" className="text-sm text-white/65">В нулевом круге выставлены по порядку: <strong className="text-white">{scenario.candidates.join(', ')}</strong>.</p>
      <p className="text-sm text-white/65">Договорились о попиле между <strong className="text-white">{scenario.pair[0]} и {scenario.pair[1]}</strong>. За 15 секунд распредели оставшихся так, чтобы попил состоялся.</p>
      {!outcome ? <ExpertRound key={round} scenario={scenario} onDone={done} /> : <>
        <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2.5 text-sm leading-6 text-amber-100">⚠️ {describeBreak(scenario)}</p>
        <OutcomeView scenario={scenario} outcome={outcome} />
      </>}
      {finished ? <div data-testid="split-vote-result" className={`rounded-2xl border p-4 text-sm leading-6 ${finished === 'passed' ? 'border-emerald-400/50 bg-emerald-500/[.12] text-emerald-100' : 'border-white/15 bg-white/[.06]'}`}>
        <strong className="block text-base">{finished === 'passed' ? 'Экзамен сдан: 5 из 5' : finished === 'failed' ? `Экзамен не сдан: ошибка в задаче ${position + 1}` : `Практика завершена: ${correct} из 5`}</strong>
        {finished === 'failed' ? <p className="mt-1 text-white/65">Для сдачи нужно спасти пять попилов подряд.</p> : null}
      </div> : null}
      {saving ? <p role="status" className="text-sm text-white/70">Сохраняем результат экзамена…</p> : null}
      {saveError ? <div role="alert" className="text-sm text-amber-200">Не удалось сохранить результат. Проверь соединение и попробуй ещё раз.<button type="button" onClick={() => void save(answers)} className="mt-2 min-h-11 w-full rounded-2xl border border-white/30">Повторить сохранение</button></div> : null}
      {outcome && !finished && !saving && !saveError ? <button type="button" onClick={next} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Следующая задача</button> : null}
      {finished ? <button type="button" onClick={restart} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{finished === 'passed' ? 'Пройти ещё раз' : 'Попробовать снова'}</button> : null}
      <button type="button" onClick={onExit} className="min-h-11 w-full rounded-2xl text-sm text-white/60">К выбору режима</button>
      {mode === 'endless' && position > 0 ? <p className="text-center text-xs text-white/50">Спасено попилов: {correct} из {position + (outcome ? 1 : 0)}.</p> : null}
    </section>
  );
};

export default SplitVoteExpertSession;
