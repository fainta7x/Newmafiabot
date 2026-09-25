import React, { useState } from 'react';
import { SPLIT_VOTE_RULES, correctSplitVote, generateSplitVoteScenario, splitVoteGroups, type SplitVoteDifficulty, type SplitVoteScenario } from '../../lib/splitVoteTraining.ts';

type TrainingMode = 'practice' | 'exam' | 'endless';
type Session = { difficulty: SplitVoteDifficulty; mode: TrainingMode };
type Result = 'passed' | 'failed' | 'completed' | null;

const DIFFICULTIES = [
  { value: 'basic', title: 'Обычный уровень', description: 'Выставлены 2–4 игрока. Один из двух кандидатов в попиле — №1.' },
  { value: 'advanced', title: 'Сложный уровень', description: 'В попиле участвуют два игрока без №1. Порядок выставления случайный.' },
] as const;

export const SplitVoteTraining: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<SplitVoteScenario | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<Result>(null);

  const start = (next: Session) => {
    setSession(next);
    setScenario(generateSplitVoteScenario(undefined, Math.random, next.difficulty));
    setChoice(null);
    setChecked(false);
    setCorrect(0);
    setAttempts(0);
    setResult(null);
  };

  const next = () => {
    if (!session || !scenario) return;
    setScenario(generateSplitVoteScenario(scenario, Math.random, session.difficulty));
    setChoice(null);
    setChecked(false);
  };

  const answer = scenario ? correctSplitVote(scenario) : null;
  const groups = scenario ? splitVoteGroups(scenario.pair) : null;
  const label = session?.difficulty === 'basic' ? 'Обычный уровень' : session?.difficulty === 'advanced' ? 'Сложный уровень' : 'Бесконечная тренировка';

  return (
    <div className="space-y-4" data-testid="split-vote-training">
      <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
        <h2 className="text-lg font-semibold">Учимся голосовать при попиле</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">За столом 10 игроков. В каждой задаче узнай свой номер и выбери кандидата, за которого тебе нужно проголосовать, чтобы голоса разделились 5:5.</p>
        <details className="mt-3 rounded-2xl border border-white/10 p-3 text-sm text-white/75">
          <summary className="cursor-pointer font-semibold text-white">Правила попила на 10 игроков</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">{SPLIT_VOTE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </details>
      </section>

      {!session || !scenario ? (
        <div className="space-y-3" data-testid="split-vote-modes">
          {DIFFICULTIES.map((difficulty) => (
            <section key={difficulty.value} className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
              <h3 className="text-base font-semibold">{difficulty.title}</h3>
              <p className="mt-1 text-sm text-white/60">{difficulty.description}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => start({ difficulty: difficulty.value, mode: 'practice' })} className="min-h-12 rounded-2xl border border-white/15 px-2 text-sm font-semibold">Практика · 5 вопросов</button>
                <button type="button" onClick={() => start({ difficulty: difficulty.value, mode: 'exam' })} className="min-h-12 rounded-2xl bg-white px-2 text-sm font-semibold text-black">Экзамен · 5 вопросов</button>
              </div>
            </section>
          ))}
          <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
            <h3 className="text-base font-semibold">Бесконечная тренировка</h3>
            <p className="mt-1 text-sm text-white/60">Решай сколько хочешь: здесь встречаются попилы с игроком №1 и без него.</p>
            <button type="button" onClick={() => start({ difficulty: 'all', mode: 'endless' })} className="mt-3 min-h-12 w-full rounded-2xl border border-white/15 px-3 text-sm font-semibold">Начать тренировку</button>
          </section>
          <p className="px-1 text-xs leading-5 text-white/45">На практике можно ошибаться. Для сдачи экзамена ответь правильно на все 5 вопросов: первая ошибка завершит попытку. Результаты пока не сохраняются.</p>
          <a href="/player" className="block min-h-11 rounded-2xl px-3 py-3 text-center text-sm text-white/65">Вернуться в кабинет игрока</a>
        </div>
      ) : (
        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="split-vote-question">
          <div className="flex items-center justify-between gap-2 text-xs text-white/50"><span>{label} · {session.mode === 'exam' ? 'экзамен' : session.mode === 'practice' ? 'практика' : 'без конца'}</span><span>{session.mode === 'endless' ? `Задача ${attempts + (checked ? 0 : 1)}` : `Вопрос ${Math.min(attempts + (checked ? 0 : 1), 5)} из 5`}</span></div>
          <p data-testid="split-vote-nominees" className="text-sm text-white/65">В нулевом круге выставлены по порядку: <strong className="text-white">{scenario.candidates.map((seat) => `№${seat}`).join(', ')}</strong>.</p>
          <p className="text-sm text-white/65">Попил между игроками <strong className="text-white">№{scenario.pair[0]} и №{scenario.pair[1]}</strong>.</p>
          <p data-testid="split-vote-seat" className="text-sm text-white/65">Твой номер за столом — <strong className="text-white">№{scenario.seat}</strong>.</p>
          <h3 className="text-base font-semibold">За кого тебе нужно проголосовать?</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Твой голос">
            {scenario.candidates.map((candidate) => (
              <button key={candidate} type="button" disabled={checked} aria-pressed={choice === candidate} onClick={() => setChoice(candidate)}
                className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-semibold ${choice === candidate ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/70'} disabled:opacity-80`}>За №{candidate}</button>
            ))}
          </div>
          {!checked ? <button type="button" disabled={choice === null} onClick={() => {
            if (choice === null) return;
            const right = choice === answer;
            setChecked(true);
            setAttempts((value) => value + 1);
            if (right) setCorrect((value) => value + 1);
            if (session.mode === 'exam' && !right) setResult('failed');
            else if (session.mode !== 'endless' && attempts + 1 === 5) setResult(session.mode === 'exam' ? 'passed' : 'completed');
          }} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40">Проверить ответ</button> : null}
          {checked && groups ? (
            <div role="status" className="space-y-2 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-semibold text-white">{choice === answer ? 'Верно!' : `Тебе нужно голосовать за игрока №${answer}.`}</p>
              <p>За игрока №{scenario.pair[0]} голосуют номера: {groups.first.map((seat) => `№${seat}`).join(', ')}.</p>
              <p>За игрока №{scenario.pair[1]} голосуют номера: {groups.second.map((seat) => `№${seat}`).join(', ')}.</p>
              <p>Каждый получает по 5 голосов. За остальных выставленных игроков не голосуют.</p>
            </div>
          ) : null}
          {result ? <div data-testid="split-vote-result" className="rounded-2xl border border-white/15 bg-white/[.06] p-4 text-sm leading-6">
            <strong className="block text-base">{result === 'passed' ? 'Экзамен сдан: 5 из 5' : result === 'failed' ? `Экзамен не сдан: ошибка в вопросе ${attempts}` : `Практика завершена: ${correct} из 5`}</strong>
            {result === 'failed' ? <p className="mt-1 text-white/65">Для сдачи нужны пять правильных ответов подряд.</p> : null}
          </div> : null}
          {checked && !result ? <button type="button" onClick={next} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Следующая задача</button> : null}
          {result ? <button type="button" onClick={() => start(session)} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Попробовать снова</button> : null}
          <button type="button" onClick={() => setSession(null)} className="min-h-11 w-full rounded-2xl text-sm text-white/60">К выбору режима</button>
          {session.mode === 'endless' && attempts > 0 ? <p className="text-center text-xs text-white/50">Правильных ответов: {correct} из {attempts}.</p> : null}
        </section>
      )}
    </div>
  );
};
