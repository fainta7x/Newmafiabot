import { useCallback, useEffect, useRef, useState } from 'react';
import { seatList } from '../../lib/splitVoteTraining.ts';
import { SPLIT_THREE_BREAK_SECONDS, completeSplitThreeBreak, splitThreeBreakState, type SplitThreeBreakScenario } from '../../lib/splitThreeBreak.ts';

/**
 * One timed task of the «Сложный» level: the break has happened, the learner distributes everyone who
 * has not voted yet, nominee by nominee; the last nominee takes whoever is left.
 */
export const SplitThreeBreakTask = ({ scenario, onDone, onProgress }: {
  scenario: SplitThreeBreakScenario;
  onDone: (answer: Record<number, number[]>, timedOut: boolean) => void;
  /** The distribution so far, for the table picture. */
  onProgress?: (votes: Record<number, number[]>) => void;
}) => {
  const { first, voted, pool, startIndex } = splitThreeBreakState(scenario);
  const [index, setIndex] = useState(startIndex);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [left, setLeft] = useState(SPLIT_THREE_BREAK_SECONDS);
  const done = useRef(false);

  const finish = useCallback((answer: Record<number, number[]>, timedOut: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(answer, timedOut);
  }, [onDone]);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, SPLIT_THREE_BREAK_SECONDS - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  const candidate = scenario.candidates[index];
  useEffect(() => { if (left === 0) finish({ ...assignments, [candidate]: selected }, true); }, [left, finish, assignments, candidate, selected]);
  useEffect(() => { onProgress?.({ ...assignments, [candidate]: selected }); }, [onProgress, assignments, candidate, selected]);

  const lastIndex = scenario.candidates.length - 1;
  const taken = Object.values(assignments).flat();
  const available = pool.filter((seat) => !taken.includes(seat));
  const next = () => {
    const answer = { ...assignments, [candidate]: selected };
    setSelected([]);
    if (index >= lastIndex - 1) { finish(completeSplitThreeBreak(scenario, answer), false); return; }
    setAssignments(answer);
    setIndex(index + 1);
  };

  return (
    <div className="space-y-3" data-testid="split-three-break">
      <p className="text-sm font-semibold text-white" data-testid="split-three-break-split">Пилим {scenario.split.join(" / ")}</p>
      <p data-testid="split-three-break-message" className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-3 py-2.5 text-sm leading-6 text-rose-100">
        <strong>Попил сломан!</strong> <strong>{scenario.breaker}</strong> не поставил руку в <strong>{first}</strong>. Что делаем дальше?
      </p>
      <div className="flex items-center gap-3" data-testid="split-three-timer">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${left <= 5 ? 'bg-rose-400' : 'bg-white'}`} style={{ width: `${(left / SPLIT_THREE_BREAK_SECONDS) * 100}%` }} /></div>
        <span className={`w-10 text-right text-sm font-semibold tabular-nums ${left <= 5 ? 'text-rose-300' : 'text-white'}`}>{left} с</span>
      </div>
      <h3 className="text-base font-semibold">Кто голосует в {candidate}?</h3>
      <p className="text-xs text-white/60">
        {index === startIndex && voted.length ? `${seatList(voted)} уже проголосовали в ${first}. ` : ''}
        {index === lastIndex ? 'Оставшиеся руки попадут сюда автоматически.' : `Отметь свободные руки. Остальные пойдут в последнего — ${scenario.candidates[lastIndex]}.`}
      </p>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Голосующие игроки">
        {available.map((seat) => (
          <button key={seat} type="button" aria-pressed={selected.includes(seat)} onClick={() => setSelected((current) => (current.includes(seat) ? current.filter((value) => value !== seat) : [...current, seat]))}
            className={`min-h-12 rounded-2xl border text-sm font-semibold ${selected.includes(seat) ? 'border-white bg-white/20' : 'border-white/15'}`}>{seat}</button>
        ))}
      </div>
      <button type="button" onClick={index === lastIndex ? () => finish(completeSplitThreeBreak(scenario, { ...assignments, [candidate]: selected }), false) : next}
        className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{index === lastIndex ? 'Проверить' : selected.length ? 'Продолжить' : 'Пропустить'}</button>
    </div>
  );
};

export default SplitThreeBreakTask;
