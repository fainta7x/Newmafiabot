import React, { useState } from 'react';
import { SPLIT_VOTE_RULES, correctSplitVote, generateSplitVoteScenario, splitVoteGroups } from '../../lib/splitVoteTraining.ts';

export const SplitVoteTraining: React.FC = () => {
  const [scenario, setScenario] = useState(() => generateSplitVoteScenario());
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const answer = correctSplitVote(scenario);
  const groups = splitVoteGroups(scenario.pair);

  const next = () => {
    setScenario(generateSplitVoteScenario(scenario));
    setChoice(null);
    setChecked(false);
  };

  return (
    <div className="space-y-4" data-testid="split-vote-training">
      <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
        <h2 className="text-lg font-semibold">Попил: твой голос</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">Нулевой круг, за столом 10 игроков. Нужно поделить голоса поровну между двумя выставленными игроками: 5 и 5. Выбери, за кого голосуешь ты.</p>
        <p className="mt-2 text-xs leading-5 text-white/50">Каждый раз меняются выставленные игроки, пара для попила и твоё место. Ответы здесь для тренировки: они не влияют на рейтинг или награды.</p>
        <details className="mt-3 rounded-2xl border border-white/10 p-3 text-sm text-white/75">
          <summary className="cursor-pointer font-semibold text-white">Правила попила на 10 игроков</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">{SPLIT_VOTE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </details>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4">
        <p className="text-sm text-white/65">Ты сидишь на месте <strong className="text-white">№{scenario.seat}</strong>.</p>
        <p className="text-sm text-white/65">Выставлены: <strong className="text-white">{scenario.candidates.map((seat) => `№${seat}`).join(', ')}</strong>.</p>
        <p className="text-sm text-white/65">Стол делит <strong className="text-white">№{scenario.pair[0]} и №{scenario.pair[1]}</strong>.</p>
        <h3 className="text-base font-semibold">За кого ты проголосуешь?</h3>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Твой голос">
          {scenario.candidates.map((candidate) => (
            <button key={candidate} type="button" disabled={checked} aria-pressed={choice === candidate} onClick={() => setChoice(candidate)}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-semibold ${choice === candidate ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/70'} disabled:opacity-80`}>За №{candidate}</button>
          ))}
        </div>
        {!checked ? <button type="button" disabled={choice === null} onClick={() => { setChecked(true); setAttempts((value) => value + 1); if (choice === answer) setCorrect((value) => value + 1); }} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40">Проверить голос</button> : null}
        {checked ? (
          <div role="status" className="space-y-2 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
            <p className="font-semibold text-white">{choice === answer ? 'Верно!' : `Сейчас правильный голос — за №${answer}.`}</p>
            <p>В №{scenario.pair[0]} голосуют: {groups.first.map((seat) => `№${seat}`).join(', ')}.</p>
            <p>В №{scenario.pair[1]} голосуют: {groups.second.map((seat) => `№${seat}`).join(', ')}.</p>
            <p>Так получается 5:5. Остальные выставленные не получают голосов.</p>
          </div>
        ) : null}
        {checked ? <button type="button" onClick={next} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Следующая задача</button> : null}
      </section>
      {attempts > 0 ? <p className="text-center text-xs text-white/50">Правильных ответов: {correct} из {attempts} в этой сессии.</p> : null}
    </div>
  );
};
