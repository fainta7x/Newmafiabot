import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, RotateCcw, Undo2 } from 'lucide-react';
import {
  availableVotes, evaluateVotes, exploreVotes, outcomeName, outcomeSummary,
  pendingVoters, treeScenarioForAttempt, type Seat,
} from '../../../lib/mafiaReasoningDecisionTree.ts';
import { reportLearningActivity } from '../../../lib/learningActivityClient.ts';

type SavedTree = { attempt: number; choices: Record<number, Seat> };
const storageItem = 'mafia-reasoning-tree-v1';
const initial = (): SavedTree => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageItem) || 'null') as Partial<SavedTree> | null;
    const attempt = stored?.attempt;
    if (!Number.isSafeInteger(attempt) || attempt! < 0 || attempt! > 10000) return { attempt: 0, choices: {} };
    const scenario = treeScenarioForAttempt(attempt!);
    const choices: Record<number, Seat> = {};
    for (const voter of pendingVoters(scenario)) {
      const raw = stored?.choices?.[voter];
      if (typeof raw === 'number' && availableVotes(scenario, voter).includes(raw)) choices[voter] = raw;
    }
    return { attempt: attempt!, choices };
  } catch { return { attempt: 0, choices: {} }; }
};

export default function MafiaReasoningDecisionTree({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SavedTree>(initial);
  const [revealed, setRevealed] = useState(false);
  // A try is reported once: taking the last hand back and choosing it again is the same try.
  const reportedAttempt = useRef<number | null>(null);
  const scenario = treeScenarioForAttempt(state.attempt);
  const [first, last] = scenario.nominated;
  const pending = pendingVoters(scenario);
  const next = pending.find((voter) => state.choices[voter] === undefined);
  const complete = next === undefined;
  const possible = exploreVotes(scenario, state.choices);
  const summary = outcomeSummary(possible);
  const final = complete ? evaluateVotes(scenario, state.choices) : null;
  const partialFirst = scenario.firstHands.length + Object.values(state.choices).filter((candidate) => candidate === first).length;
  const partialLast = Object.values(state.choices).filter((candidate) => candidate === last).length;
  const chosenVoters = pending.filter((voter) => state.choices[voter] !== undefined);

  useEffect(() => {
    try { window.localStorage.setItem(storageItem, JSON.stringify(state)); } catch { /* local browser storage optional */ }
  }, [state]);

  const choose = (voter: number, vote: number) => {
    if (next !== voter || !availableVotes(scenario, voter).includes(vote)) return;
    setState((prev) => ({ ...prev, choices: { ...prev.choices, [voter]: vote } }));
    // The last hand placed finishes one try of the exercise (it has no pass mark: it counts as done).
    if (pending.every((other) => other === voter || state.choices[other] !== undefined) && reportedAttempt.current !== state.attempt) {
      reportedAttempt.current = state.attempt;
      reportLearningActivity({ track: 'reasoning-extra', item: 'tree', passed: true });
    }
    setRevealed(false);
  };
  const undo = () => {
    const lastVoter = chosenVoters.at(-1);
    if (lastVoter === undefined) return;
    setState((prev) => {
      const choices = { ...prev.choices };
      delete choices[lastVoter];
      return { ...prev, choices };
    });
    setRevealed(false);
  };
  const restart = () => {
    setState((prev) => ({ attempt: prev.attempt + 1, choices: {} }));
    setRevealed(false);
  };
  const choiceList = next === undefined ? [] : availableVotes(scenario, next);

  return <section data-testid="reasoning-tree" className="space-y-4">
    <header className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 rounded-xl border border-white/15 px-3 text-sm">
        <ChevronLeft className="h-4 w-4" /> Упражнения
      </button>
      <div><p className="text-[11px] text-white/45">Просчитай все варианты</p>
        <h3 className="text-lg font-semibold">Дерево голосов</h3></div>
    </header>
    <div className="rounded-2xl border border-white/10 bg-white/[.045] p-3 space-y-2">
      <h4 className="text-[15px] font-semibold">{scenario.title}</h4>
      <p className="text-[13px] text-white/70">{scenario.context}</p>
      <p className="text-[12px] text-white/60">Остались №{scenario.alive.join(', №')}. Чёрные: №{scenario.black.join(', №')}.</p>
      <p className="text-[12px] text-white/60">Судья вызывает №{first}, затем №{last}. Уже подняли руки за №{first}: №{scenario.firstHands.join(', №')}.</p>
    </div>
    <div data-testid="reasoning-tree-board" className="grid grid-cols-2 gap-2">
      {[first, last].map((seat, index) => <div key={seat}
        className="rounded-2xl border border-white/15 bg-black/20 p-3 space-y-2">
        <p className="text-[11px] text-white/50">{index === 0 ? 'Сейчас голосуют' : 'Последний кандидат'}</p>
        <p className="text-lg font-semibold">№{seat}</p>
        <p className="text-[12px] text-white/60">{scenario.black.includes(seat) ? 'Чёрный' : 'Красный'}</p>
        <p className="text-sm font-semibold tabular-nums">{seat === first ? partialFirst : partialLast} рук{!complete ? ' пока' : ''}</p>
      </div>)}
    </div>
    {chosenVoters.length > 0 ? <div className="flex items-start gap-2 rounded-xl border border-white/10 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-white/55">Выбранные руки</p>
        <div className="mt-1 flex flex-wrap gap-1.5">{chosenVoters.map((voter) =>
          <span key={voter} className="rounded-lg bg-white/10 px-2 py-1 text-[12px]">№{voter} → №{state.choices[voter]}</span>)}</div>
      </div>
      <button type="button" data-testid="reasoning-tree-undo" onClick={undo}
        className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-white/15 px-3 text-[12px]">
        <Undo2 className="h-4 w-4" /> Назад
      </button>
    </div> : null}
    {!complete && next !== undefined ? <div className="space-y-3 rounded-2xl border border-amber-200/20 bg-amber-200/[.035] p-3">
      <p className="text-[12px] text-white/60">Рука {chosenVoters.length + 1} из {pending.length}</p>
      <p className="text-[16px] font-semibold">Как голосует №{next}?</p>
      <p className="text-[12px] text-white/65">За первого кандидата можно поднять руку сейчас. Иначе голос достанется последнему.</p>
      <div className="grid gap-2">{choiceList.map((candidate) =>
        <button key={candidate} type="button" data-testid={`reasoning-tree-vote-${candidate}`}
          onClick={() => choose(next, candidate)}
          className="flex min-h-12 items-center justify-between rounded-xl border border-white/20 bg-white/[.045] px-3 text-[14px]">
          <span>{candidate === first ? `Поднять за №${candidate}` : `Дождаться №${candidate}`}</span><ArrowRight className="h-4 w-4" />
        </button>)}</div>
    </div> : <div className="space-y-3">
      <button type="button" onClick={() => setRevealed((prev) => !prev)}
        data-testid="reasoning-tree-reveal"
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-black">
        {revealed ? 'Скрыть разбор' : 'Сравнить с другими исходами'}
      </button>
      {revealed && final ? <div data-testid="reasoning-tree-result" className="rounded-2xl border border-white/15 bg-white/[.045] p-3 space-y-3">
        <p className="text-base font-semibold">{outcomeName(final.outcome)}</p>
        <p className="text-[13px] text-white/70">
          Итог: №{first} — {final.counts[first]} рук, №{last} — {final.counts[last]} рук.
          {final.votedOut !== null ? ` Заголосован №${final.votedOut}.` : ' Никто пока не заголосован.'}
        </p>
        <div className="rounded-xl bg-black/25 p-3 space-y-2 text-[13px]">
          <p className="font-semibold">А если другие игроки решат иначе?</p>
          <p className="text-white/70">В полном дереве {outcomeSummary(exploreVotes(scenario)).alternatives} допустимых сочетаний рук.</p>
          {outcomeSummary(exploreVotes(scenario)).possible.map((outcome) =>
            <p key={outcome} className="text-white/70">• {outcomeName(outcome)}</p>)}
          <p className="text-amber-100/85">{outcomeSummary(exploreVotes(scenario)).forced
            ? 'Этот итог неизбежен при любом допустимом выборе оставшихся игроков.'
            : 'Одно решение не гарантирует итог: существуют другие возможные продолжения.'}</p>
        </div>
        <p className="text-[12px] text-white/60">Упущенная победа или голос против напарника помогают проверять версию, но сами по себе не доказывают цвет игрока.</p>
        <button type="button" onClick={restart}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-sm">
          <RotateCcw className="h-4 w-4" /> Следующая ситуация
        </button>
      </div> : null}
    </div>}
    {!complete ? <p className="text-[12px] text-white/55">В этом ответвлении осталось {summary.alternatives} возможных продолжений. Исход откроется после распределения всех рук.</p> : null}
  </section>;
}
