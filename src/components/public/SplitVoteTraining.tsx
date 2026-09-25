import React, { useEffect, useState } from 'react';
import { SPLIT_VOTE_RULES, correctSplitVote, generateSplitVoteScenario, isCorrectSplitVoteAssignment, splitVoteAssignments, splitVoteGroups, type SplitVoteDifficulty, type SplitVoteScenario } from '../../lib/splitVoteTraining.ts';

type TrainingMode = 'practice' | 'exam' | 'endless';
type Session = { difficulty: SplitVoteDifficulty; mode: TrainingMode };
type Result = 'passed' | 'failed' | 'completed' | null;

const DIFFICULTIES = [
  { value: 'basic', title: 'Обычный уровень', description: 'Выставлены 2–4 игрока. Один из двух кандидатов в попиле — №1.' },
  { value: 'advanced', title: 'Продвинутый уровень', description: 'В попиле участвуют два игрока без №1. Порядок выставления случайный.' },
  { value: 'interactive', title: 'Сложный уровень · голосование', description: 'Выставлены 3–5 игроков. Пройди их по порядку: назначь голосующих за каждого или пропусти кандидата.' },
] as const;
type ExamAnswer = { scenario: SplitVoteScenario; answer: number | Record<number, number[]> };
type ProgressState = 'loading' | 'ready' | 'guest' | 'error';

export const SplitVoteTraining: React.FC = () => {
  const [progressState, setProgressState] = useState<ProgressState>('loading');
  const [passed, setPassed] = useState<SplitVoteDifficulty[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [examAnswers, setExamAnswers] = useState<ExamAnswer[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<SplitVoteScenario | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<Result>(null);
  const [nomineeIndex, setNomineeIndex] = useState(0);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/player/split-vote-progress', { credentials: 'include' }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) return setProgressState('guest');
      if (!response.ok) throw new Error('progress');
      const data = await response.json();
      if (active) { setPassed(data.passed); setProgressState('ready'); }
    }).catch(() => { if (active) setProgressState('error'); });
    return () => { active = false; };
  }, []);

  const unlocked = (difficulty: SplitVoteDifficulty) => difficulty === 'basic' ||
    (difficulty === 'advanced' && passed.includes('basic')) ||
    ((difficulty === 'interactive' || difficulty === 'all') && passed.includes('advanced'));

  const savePassedExam = async (answers: ExamAnswer[], level: SplitVoteDifficulty) => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch('/api/player/split-vote-progress', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, answers }),
      });
      if (!response.ok) throw new Error('save');
      const data = await response.json();
      setPassed(data.passed);
      setResult('passed');
    } catch {
      setSaveError('Не удалось сохранить результат. Проверь соединение и попробуй ещё раз.');
    } finally { setSaving(false); }
  };

  const start = (next: Session) => {
    if (!unlocked(next.difficulty) || (next.mode === 'exam' && progressState !== 'ready')) return;
    setSession(next);
    setScenario(generateSplitVoteScenario(undefined, Math.random, next.difficulty));
    setChoice(null);
    setChecked(false);
    setCorrect(0);
    setAttempts(0);
    setResult(null);
    setNomineeIndex(0);
    setAssignments({});
    setSelectedSeats([]);
    setExamAnswers([]);
    setSaveError('');
  };

  const next = () => {
    if (!session || !scenario) return;
    setScenario(generateSplitVoteScenario(scenario, Math.random, session.difficulty));
    setChoice(null);
    setChecked(false);
    setNomineeIndex(0);
    setAssignments({});
    setSelectedSeats([]);
  };

  const finishQuestion = (right: boolean, submitted: number | Record<number, number[]>) => {
    if (!session || !scenario) return;
    setChecked(true);
    setAttempts((value) => value + 1);
    if (right) setCorrect((value) => value + 1);
    if (session.mode === 'exam' && !right) setResult('failed');
    else if (session.mode === 'exam' && attempts + 1 === 5) {
      const answers = [...examAnswers, { scenario, answer: submitted }];
      setExamAnswers(answers);
      void savePassedExam(answers, session.difficulty);
    } else if (session.mode === 'exam') setExamAnswers((current) => [...current, { scenario, answer: submitted }]);
    else if (session.mode === 'practice' && attempts + 1 === 5) setResult('completed');
  };

  const advanceNominee = () => {
    if (!scenario) return;
    const candidate = scenario.candidates[nomineeIndex];
    setAssignments((current) => ({ ...current, [candidate]: selectedSeats }));
    setSelectedSeats([]);
    setNomineeIndex((index) => index + 1);
  };

  const answer = scenario ? correctSplitVote(scenario) : null;
  const groups = scenario ? splitVoteGroups(scenario.pair) : null;
  const label = session?.difficulty === 'basic' ? 'Обычный уровень' : session?.difficulty === 'advanced' ? 'Продвинутый уровень' : session?.difficulty === 'interactive' ? 'Сложный уровень · голосование' : 'Бесконечная тренировка';
  const interactive = session?.difficulty === 'interactive';
  const assignedSeats = Object.values(assignments).flat();

  return (
    <div className="space-y-4" data-testid="split-vote-training">
      <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
        <h2 className="text-lg font-semibold">Учимся голосовать при попиле</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">За столом 10 игроков. В первых двух уровнях выбери свой голос. В сложном уровне распредели все 10 голосов по выставленным кандидатам в нужном порядке.</p>
        <details className="mt-3 rounded-2xl border border-white/10 p-3 text-sm text-white/75">
          <summary className="cursor-pointer font-semibold text-white">Правила попила на 10 игроков</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">{SPLIT_VOTE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </details>
      </section>

      {!session || !scenario ? (
        <div className="space-y-3" data-testid="split-vote-modes">
          {DIFFICULTIES.map((difficulty) => (
            <section key={difficulty.value} className="rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid={`split-vote-level-${difficulty.value}`}>
              <h3 className="text-base font-semibold">{difficulty.title} {passed.includes(difficulty.value) ? '✓' : null}</h3>
              <p className="mt-1 text-sm text-white/60">{difficulty.description}</p>
              {!unlocked(difficulty.value) ? <p className="mt-2 text-sm text-amber-200">🔒 Сначала сдай экзамен предыдущего уровня.</p> : null}
              {difficulty.value === 'basic' && progressState === 'guest' ? <p className="mt-2 text-sm text-white/60">Практика доступна без входа. Для экзамена войди в кабинет игрока.</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={!unlocked(difficulty.value)} onClick={() => start({ difficulty: difficulty.value, mode: 'practice' })} className="min-h-12 rounded-2xl border border-white/15 px-2 text-sm font-semibold disabled:opacity-40">Практика · 5 вопросов</button>
                <button type="button" disabled={!unlocked(difficulty.value) || progressState !== 'ready'} onClick={() => start({ difficulty: difficulty.value, mode: 'exam' })} className="min-h-12 rounded-2xl bg-white px-2 text-sm font-semibold text-black disabled:opacity-40">Экзамен · 5 вопросов</button>
              </div>
              {difficulty.value === 'interactive' ? <button type="button" disabled={!unlocked('interactive')} onClick={() => start({ difficulty: 'interactive', mode: 'endless' })} className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 px-3 text-sm font-semibold disabled:opacity-40">Бесконечная практика</button> : null}
            </section>
          ))}
          <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
            <h3 className="text-base font-semibold">Бесконечная тренировка</h3>
            <p className="mt-1 text-sm text-white/60">Решай сколько хочешь: здесь встречаются попилы с игроком №1 и без него.</p>
            <button type="button" disabled={!unlocked('all')} onClick={() => start({ difficulty: 'all', mode: 'endless' })} className="mt-3 min-h-12 w-full rounded-2xl border border-white/15 px-3 text-sm font-semibold disabled:opacity-40">Начать тренировку</button>
          </section>
          <p className="px-1 text-xs leading-5 text-white/55">{progressState === 'guest' ? 'Чтобы сдавать экзамены и сохранять прогресс, войди в кабинет игрока.' : progressState === 'error' ? 'Не удалось загрузить прогресс. Обнови страницу и попробуй снова.' : progressState === 'loading' ? 'Загружаем твой прогресс…' : 'Следующий уровень откроется после пяти правильных ответов на экзамене. Прогресс хранится в твоём аккаунте.'}</p>
          <a href="/player" className="block min-h-11 rounded-2xl px-3 py-3 text-center text-sm text-white/65">Вернуться в кабинет игрока</a>
        </div>
      ) : (
        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="split-vote-question">
          <div className="flex items-center justify-between gap-2 text-xs text-white/50"><span>{label} · {session.mode === 'exam' ? 'экзамен' : session.mode === 'practice' ? 'практика' : 'без конца'}</span><span>{session.mode === 'endless' ? `Задача ${attempts + (checked ? 0 : 1)}` : `Вопрос ${Math.min(attempts + (checked ? 0 : 1), 5)} из 5`}</span></div>
          <p data-testid="split-vote-nominees" className="text-sm text-white/65">В нулевом круге выставлены по порядку: <strong className="text-white">{scenario.candidates.map((seat) => `№${seat}`).join(', ')}</strong>.</p>
          <p className="text-sm text-white/65">Попил между игроками <strong className="text-white">№{scenario.pair[0]} и №{scenario.pair[1]}</strong>.</p>
          <p data-testid="split-vote-seat" className="text-sm text-white/65">Твой номер за столом — <strong className="text-white">№{scenario.seat}</strong>.</p>
          {interactive && !checked ? (
            nomineeIndex < scenario.candidates.length ? <div className="space-y-3" data-testid="split-vote-interactive">
              <h3 className="text-base font-semibold">Кто голосует за №{scenario.candidates[nomineeIndex]}?</h3>
              <p className="text-xs text-white/60">Кандидат {nomineeIndex + 1} из {scenario.candidates.length}. Выбери номера игроков; выбранные на прошлых шагах больше недоступны.</p>
              <div className="grid grid-cols-5 gap-2" role="group" aria-label="Голосующие игроки">
                {Array.from({ length: 10 }, (_, index) => index + 1).filter((seat) => !assignedSeats.includes(seat)).map((seat) => (
                  <button key={seat} type="button" aria-pressed={selectedSeats.includes(seat)} onClick={() => setSelectedSeats((current) => current.includes(seat) ? current.filter((value) => value !== seat) : [...current, seat])}
                    className={`min-h-12 rounded-2xl border text-sm font-semibold ${selectedSeats.includes(seat) ? 'border-white bg-white/20' : 'border-white/15'}`}>№{seat}</button>
                ))}
              </div>
              <button type="button" onClick={advanceNominee} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{selectedSeats.length ? 'Продолжить' : 'Пропустить'}</button>
              {nomineeIndex > 0 ? <button type="button" onClick={() => {
                const prior = scenario.candidates[nomineeIndex - 1];
                setSelectedSeats(assignments[prior] ?? []);
                setAssignments((current) => { const updated = { ...current }; delete updated[prior]; return updated; });
                setNomineeIndex((index) => index - 1);
              }} className="min-h-11 w-full rounded-2xl text-sm text-white/70">Вернуться к предыдущему</button> : null}
            </div> : <div className="space-y-3" data-testid="split-vote-review">
              <h3 className="text-base font-semibold">Проверь распределение голосов</h3>
              {scenario.candidates.map((candidate) => <p key={candidate} className="text-sm text-white/75">За №{candidate}: {(assignments[candidate] ?? []).length ? assignments[candidate].map((seat) => `№${seat}`).join(', ') : 'никто'}</p>)}
              <button type="button" onClick={() => finishQuestion(isCorrectSplitVoteAssignment(scenario, assignments), assignments)} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Проверить голосование</button>
              <button type="button" onClick={() => {
                const index = scenario.candidates.length - 1;
                const prior = scenario.candidates[index];
                setSelectedSeats(assignments[prior] ?? []);
                setAssignments((current) => { const updated = { ...current }; delete updated[prior]; return updated; });
                setNomineeIndex(index);
              }} className="min-h-11 w-full rounded-2xl text-sm text-white/70">Исправить последний шаг</button>
            </div>
          ) : !interactive ? <><h3 className="text-base font-semibold">За кого тебе нужно проголосовать?</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Твой голос">
            {scenario.candidates.map((candidate) => (
              <button key={candidate} type="button" disabled={checked} aria-pressed={choice === candidate} onClick={() => setChoice(candidate)}
                className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-semibold ${choice === candidate ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/70'} disabled:opacity-80`}>За №{candidate}</button>
            ))}
          </div>
          {!checked ? <button type="button" disabled={choice === null} onClick={() => {
            if (choice === null) return;
            finishQuestion(choice === answer, choice);
          }} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40">Проверить ответ</button> : null}</> : null}
          {checked && groups ? (
            <div role="status" className="space-y-2 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-semibold text-white">{interactive ? (isCorrectSplitVoteAssignment(scenario, assignments) ? 'Верно!' : 'Распределение голосов неверное.') : choice === answer ? 'Верно!' : `Тебе нужно голосовать за игрока №${answer}.`}</p>
              {interactive ? scenario.candidates.map((candidate) => <p key={candidate}>За №{candidate}: ты выбрал {(assignments[candidate] ?? []).length ? assignments[candidate].map((seat) => `№${seat}`).join(', ') : 'никого'}; правильно — {(splitVoteAssignments(scenario)[candidate]).length ? splitVoteAssignments(scenario)[candidate].map((seat) => `№${seat}`).join(', ') : 'никого'}.</p>) : null}
              <p>За игрока №{scenario.pair[0]} голосуют номера: {groups.first.map((seat) => `№${seat}`).join(', ')}.</p>
              <p>За игрока №{scenario.pair[1]} голосуют номера: {groups.second.map((seat) => `№${seat}`).join(', ')}.</p>
              <p>Каждый получает по 5 голосов. За остальных выставленных игроков не голосуют.</p>
            </div>
          ) : null}
          {result ? <div data-testid="split-vote-result" className="rounded-2xl border border-white/15 bg-white/[.06] p-4 text-sm leading-6">
            <strong className="block text-base">{result === 'passed' ? 'Экзамен сдан: 5 из 5' : result === 'failed' ? `Экзамен не сдан: ошибка в вопросе ${attempts}` : `Практика завершена: ${correct} из 5`}</strong>
            {result === 'passed' && session.difficulty !== 'interactive' ? <p className="mt-1 text-white/75">Следующий уровень открыт. Вернись к выбору режима, чтобы начать.</p> : null}
            {result === 'failed' ? <p className="mt-1 text-white/65">Для сдачи нужны пять правильных ответов подряд.</p> : null}
          </div> : null}
          {saving ? <p role="status" className="text-sm text-white/70">Сохраняем результат экзамена…</p> : null}
          {saveError ? <div role="alert" className="text-sm text-amber-200">{saveError}<button type="button" onClick={() => void savePassedExam(examAnswers, session.difficulty)} className="mt-2 min-h-11 w-full rounded-2xl border border-white/30">Повторить сохранение</button></div> : null}
          {checked && !result && !saving && !saveError ? <button type="button" onClick={next} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Следующая задача</button> : null}
          {result ? <button type="button" onClick={() => start(session)} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Попробовать снова</button> : null}
          <button type="button" onClick={() => setSession(null)} className="min-h-11 w-full rounded-2xl text-sm text-white/60">К выбору режима</button>
          {session.mode === 'endless' && attempts > 0 ? <p className="text-center text-xs text-white/50">Правильных ответов: {correct} из {attempts}.</p> : null}
        </section>
      )}
    </div>
  );
};
