import { useEffect, useState } from 'react';
import { scrollPageTop } from '../../lib/scrollPageTop.ts';
import { seatList } from '../../lib/splitVoteTraining.ts';
import { SplitTableMap } from './guide/SplitTableMap.tsx';
import { assignmentMistakes } from '../../lib/splitTrainingFeedback.ts';
import { SplitThreeBreakTask } from './SplitThreeBreakTask.tsx';
import {
  generateSplitThreeBreak, generateSplitThreeChoice, isCorrectSplitThreeBreak, isCorrectSplitThreeChoice, splitThreeBreakState,
  splitThreeBreakVotes, splitThreeChoiceRule, type SplitThreeBreakScenario,
} from '../../lib/splitThreeBreak.ts';
import {
  SPLIT_THREE_ORDER, SPLIT_THREE_HARD_RULES, SPLIT_THREE_RULES, aliveSeats, blackIfReal, completeSplitThreeAnswer, correctSplitThreeVote, generateSplitThreeScenario,
  isCorrectSplitThreeAssignment, splitThreeAssignments, splitThreeVersions, type SplitThreeLevel, type SplitThreeScenario,
} from '../../lib/splitThreeTraining.ts';

type Mode = 'practice' | 'exam' | 'endless';
type Session = { level: SplitThreeLevel; mode: Mode };
type Answer = number | number[] | Record<number, number[]>;
type ProgressState = 'loading' | 'ready' | 'guest' | 'error';

const LEVEL_TITLES: Record<SplitThreeLevel, string> = {
  three_easy: 'Лёгкий уровень', three_medium: 'Средний уровень', three_break: 'Сложный уровень', three_choose: 'Кого пилить', three_hard: 'Экспертный уровень',
};
const LEVEL_DESCRIPTIONS: Record<SplitThreeLevel, string> = {
  three_easy: 'Выставлены трое, пилим всех. Выбери, в кого голосуешь ты.',
  three_medium: 'Выставлены 4–6, пилим троих из них. Распиши весь стол по кандидатам.',
  three_break: 'Кто-то из пилящихся не поставил руку. За 15 секунд распредели всех, кто ещё не голосовал.',
  three_choose: 'За столом два шерифа. По их проверкам выбери, кого пилить.',
  three_hard: 'Два шерифа, одному город верит меньше. Распиши стол так, чтобы ни одна версия не могла сломать попил.',
};
const ORDER = SPLIT_THREE_ORDER;
const LEVELS = ORDER.map((value) => ({ value, title: LEVEL_TITLES[value], description: LEVEL_DESCRIPTIONS[value] }));
const generateFor = (level: SplitThreeLevel, previous?: SplitThreeScenario): SplitThreeScenario => (level === 'three_break'
  ? generateSplitThreeBreak(previous as SplitThreeBreakScenario | undefined)
  : level === 'three_choose' ? generateSplitThreeChoice(previous) : generateSplitThreeScenario(level, previous));

/** «Попил на троих, за столом 9 человек»: levels open one after another by an exam of 5 correct answers. */
export const SplitThreeTraining = ({ initial }: { initial?: SplitThreeScenario[] } = {}) => {
  const [progress, setProgress] = useState<ProgressState>('loading');
  const [passed, setPassed] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<SplitThreeScenario[]>([]);
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [nomineeIndex, setNomineeIndex] = useState(0);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState<null | { right: boolean; answer: Answer }>(null);
  const [correct, setCorrect] = useState(0);
  const [answers, setAnswers] = useState<Array<{ scenario: SplitThreeScenario; answer: Answer }>>([]);
  const [result, setResult] = useState<null | 'passed' | 'failed' | 'completed'>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/player/split-vote-progress', { credentials: 'include' }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { setProgress('guest'); return; }
      if (!response.ok) throw new Error('progress');
      const data = await response.json();
      if (active) { setPassed(Array.isArray(data.passed) ? data.passed : []); setProgress('ready'); }
    }).catch(() => { if (active) setProgress('error'); });
    return () => { active = false; };
  }, []);

  // Each level opens after the exam of the previous one (a level once passed stays open).
  const unlocked = (level: SplitThreeLevel) => ORDER.indexOf(level) === 0 || passed.includes(level) || passed.includes(ORDER[ORDER.indexOf(level) - 1]);
  const scenario = queue[position];
  const breakLevel = session?.level === 'three_break';
  const chooseLevel = session?.level === 'three_choose';
  /** Medium and expert: distribute the whole table. */
  const medium = session?.level === 'three_medium' || session?.level === 'three_hard';
  const sheriffs = scenario?.sheriffs;
  const [breakVotes, setBreakVotes] = useState<Record<number, number[]>>({});
  const [picked, setPicked] = useState<number[]>([]);

  const resetTask = () => { setChoice(null); setNomineeIndex(0); setAssignments({}); setSelected([]); setChecked(null); setBreakVotes({}); setPicked([]); };
  // Every task opens from its conditions, not from where the previous screen was scrolled.
  const taskKey = session ? `${session.level}:${session.mode}:${position}` : '';
  useEffect(() => { if (taskKey) scrollPageTop(); }, [taskKey]);
  const start = (next: Session) => {
    if (!unlocked(next.level) || (next.mode === 'exam' && progress !== 'ready')) return;
    setSession(next);
    setQueue(initial?.length ? initial : [generateFor(next.level)]);
    setPosition(0); setCorrect(0); setAnswers([]); setResult(null); setSaveError(false);
    resetTask();
  };
  const advance = () => {
    if (!session) return;
    setQueue((current) => (current[position + 1] ? current : [...current, generateFor(session.level, current[position])]));
    setPosition((value) => value + 1);
    resetTask();
  };

  const save = async (list: Array<{ scenario: SplitThreeScenario; answer: Answer }>, level: SplitThreeLevel) => {
    setSaveError(false);
    setSaving(true);
    try {
      const response = await fetch('/api/player/split-vote-progress', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, answers: list }),
      });
      if (!response.ok) throw new Error('save');
      const data = await response.json();
      setPassed(data.passed);
      setResult('passed');
    } catch { setSaveError(true); } finally { setSaving(false); }
  };

  const finish = (right: boolean, answer: Answer) => {
    if (!session || !scenario) return;
    setChecked({ right, answer });
    if (right) setCorrect((value) => value + 1);
    const list = [...answers, { scenario, answer }];
    setAnswers(list);
    if (session.mode === 'exam' && !right) setResult('failed');
    else if (session.mode === 'exam' && position === 4) void save(list, session.level);
    else if (session.mode === 'practice' && position === 4) setResult('completed');
  };

  const nextNominee = () => {
    if (!scenario) return;
    const candidate = scenario.candidates[nomineeIndex];
    const next = { ...assignments, [candidate]: selected };
    setSelected([]);
    if (nomineeIndex + 1 >= scenario.candidates.length - 1) {
      // The last nominee takes everyone who has not voted yet.
      const complete = completeSplitThreeAnswer(scenario, next);
      setAssignments(complete);
      setNomineeIndex(scenario.candidates.length);
      return;
    }
    setAssignments(next);
    setNomineeIndex(nomineeIndex + 1);
  };

  const expected = scenario && !chooseLevel ? splitThreeAssignments(scenario) : null;
  const taken = Object.values(assignments).flat();
  const broken = breakLevel && scenario ? scenario as SplitThreeBreakScenario : null;
  const breakState = broken ? splitThreeBreakState(broken) : null;
  const choiceRule = chooseLevel && scenario ? splitThreeChoiceRule(scenario) : null;
  // The table picture: the correct split after the answer, the learner's own distribution while filling it in.
  const mapVotes = broken && breakState
    ? (checked ? splitThreeBreakVotes(broken, { [broken.breaker]: breakState.pool }) : { ...breakVotes, [breakState.first]: [...breakState.voted, ...(breakVotes[breakState.first] ?? [])] })
    : chooseLevel ? undefined
      : checked ? expected ?? undefined
        : medium && scenario ? { ...assignments, ...(nomineeIndex < scenario.candidates.length ? { [scenario.candidates[nomineeIndex]]: selected } : {}) } : undefined;

  // On the timed level the task comes first and the picture below it.
  const tableMap = scenario && session ? (
    <SplitTableMap killed={scenario.killed} candidates={scenario.candidates} split={chooseLevel && !checked ? [] : scenario.split} seat={session.level === 'three_easy' ? scenario.seat : null}
              claims={sheriffs ? [sheriffs.trusted, sheriffs.doubted].map(({ seat, check, black }) => ({ seat, check, black })) : []} votes={mapVotes} />
  ) : null;

  return (
    <div className="space-y-4" data-testid="split-three-training">
      {/* The intro stays on the level list; during a task the question comes first. */}
      {!session ? (
        <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
          <p className="text-sm leading-6 text-white/75">Одного игрока убили, за столом 9 человек. Голоса делят поровну между тремя выставленными — по 3 голоса каждому.</p>
          <details className="mt-3 rounded-2xl border border-white/10 p-3 text-sm text-white/75">
            <summary className="cursor-pointer font-semibold text-white">Правила попила на троих</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">{SPLIT_THREE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            <p className="mt-2 leading-6 text-white/60">Пример: убит 10, выставлены 7, 2, 5, 9, 4, пилим 2, 9, 4. В 2 голосуют 249, в 9 — 135, в 4 — 678, в 7 и 5 — никто.</p>
            <p className="mt-3 font-semibold text-white">Сложный уровень: попил сломан</p>
            <p className="mt-2 leading-6">Пилящиеся первыми ставят руки в первого пилящегося. Если кто-то из них руку не поставил — попил сломан: все, кто ещё не голосовал, голосуют в того, кто сломал. Сломавший хочет вывести не себя, а другого, поэтому с ним никто не голосует. Кто уже поднял руку, переголосовать не может.</p>
            <p className="mt-2 leading-6 text-white/60">Пример: пилим 1, 2, 3, и 3 не поставил руку в 1. 1 и 2 уже проголосовали в 1, все остальные голосуют в 3.</p>
            <p className="mt-3 font-semibold text-white">«Кого пилить» и экспертный уровень: два шерифа</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">{SPLIT_THREE_HARD_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            <p className="mt-2 leading-6 text-white/60">Пример: убит 10, шерифы 1 и 4, город меньше верит шерифу 4. Шериф 4 проверил 2 — чёрный, шериф 1 проверил 6 — красный. Выставлены 4, 2, 7. Если прав 4, то 1 и 2 — мафия: они голосуют в 4. Если прав 1, то мафия 4: он голосует в 2. Пилящийся 7 голосует в 4. Ответ: в 4 — 127, в 2 — 345, в 7 — 689.</p>
          </details>
        </section>
      ) : null}

      {!session || !scenario ? (
        <div className="space-y-3" data-testid="split-three-modes">
          {LEVELS.map((level) => (
            <section key={level.value} data-testid={`split-three-level-${level.value}`} className={`rounded-3xl border p-4 ${passed.includes(level.value) ? 'border-emerald-400/50 bg-emerald-500/[.08]' : 'border-white/10 bg-white/[.045]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{level.title}</h3>
                {passed.includes(level.value) ? <span className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">✓ Экзамен сдан</span> : null}
              </div>
              <p className="mt-1 text-sm text-white/60">{level.description}</p>
              {!unlocked(level.value) ? <p className="mt-2 text-sm text-amber-200">🔒 Сначала сдай экзамен уровня «{LEVEL_TITLES[ORDER[ORDER.indexOf(level.value) - 1]]}».</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={!unlocked(level.value)} onClick={() => start({ level: level.value, mode: 'practice' })} className="min-h-12 rounded-2xl border border-white/15 px-2 text-sm font-semibold disabled:opacity-40">Практика · 5 вопросов</button>
                <button type="button" disabled={!unlocked(level.value) || progress !== 'ready'} onClick={() => start({ level: level.value, mode: 'exam' })} className="min-h-12 rounded-2xl bg-white px-2 text-sm font-semibold text-black disabled:opacity-40">{passed.includes(level.value) ? 'Пройти ещё раз' : 'Экзамен · 5 вопросов'}</button>
              </div>
              <button type="button" disabled={!unlocked(level.value)} onClick={() => start({ level: level.value, mode: 'endless' })} className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 px-3 text-sm font-semibold disabled:opacity-40">Бесконечная практика</button>
            </section>
          ))}
          <p className="px-1 text-xs leading-5 text-white/55">{progress === 'guest' ? 'Чтобы сдавать экзамены и сохранять прогресс, войди в кабинет игрока.' : progress === 'error' ? 'Не удалось загрузить прогресс. Обнови страницу.' : 'Каждый уровень открывается после экзамена предыдущего.'}</p>
        </div>
      ) : (
        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="split-three-question">
          <div className="flex items-center justify-between gap-2 text-xs text-white/50">
            <span>{LEVEL_TITLES[session.level]} · {session.mode === 'exam' ? 'экзамен' : session.mode === 'practice' ? 'практика' : 'без конца'}</span>
            <span>{session.mode === 'endless' ? `Задача ${position + 1}` : `Вопрос ${position + 1} из 5`}</span>
          </div>
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[.06] p-3">
             <h2 className="text-lg font-black leading-6 text-white">{chooseLevel ? 'Выбери троих для попила' : breakLevel ? 'Спаси сломанный попил' : session.level === 'three_easy' ? 'В кого голосуешь ты?' : 'Распредели 9 голосов'}</h2>
             <div className="flex flex-wrap gap-1.5 text-[12px]">
               {!breakLevel ? <span className="rounded-lg border border-rose-400/25 px-2.5 py-1.5 text-rose-200">Убит: <strong data-testid="split-three-killed">{scenario.killed}</strong></span> : null}
               {!breakLevel ? <span className="rounded-lg bg-black/25 px-2.5 py-1.5 text-white">В игре: 9</span> : null}
               {!chooseLevel && !breakLevel ? <span className="rounded-lg bg-black/25 px-2.5 py-1.5 text-white">Попил: 3 / 3 / 3</span> : null}
               {session.level === 'three_easy' ? <span data-testid="split-three-seat" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 font-bold text-emerald-200">Ты: {scenario.seat}</span> : null}
             </div>
             {!breakLevel ? <p data-testid="split-three-nominees" className="text-[12px] leading-5 text-white/75">Выставлены: <strong className="text-white">{scenario.candidates.join(' → ')}</strong></p> : null}
             {!chooseLevel && !breakLevel ? <p data-testid="split-three-split" className="text-[12px] text-white/75">Пилим: <b className="text-white">{scenario.split.join(' / ')}</b></p> : null}
           </div>
           {sheriffs && !breakLevel ? (
            <div data-testid="split-three-sheriffs" className="space-y-2 rounded-2xl border border-amber-300/30 bg-amber-400/[.07] p-3 text-sm leading-5">
               <p className="font-bold text-amber-200">Два шерифа · меньше верят {sheriffs.doubted.seat}</p>
               <div className="grid gap-2 sm:grid-cols-2">
                 {(['trusted', 'doubted'] as const).map((who) => <div key={who} className="rounded-xl bg-black/20 p-2.5">
                   <span className="text-[11px] text-white/55">{who === 'trusted' ? 'Больше доверяют' : 'Меньше доверяют'}</span>
                   <p className="font-bold text-white">Шериф {sheriffs[who].seat}</p>
                   <p className="text-white/80">Проверка {sheriffs[who].check}: <b className={sheriffs[who].black ? 'text-rose-200' : 'text-emerald-200'}>{sheriffs[who].black ? 'чёрный' : 'красный'}</b></p>
                 </div>)}
               </div>
               <div data-testid="split-three-teams" className="space-y-0.5 border-t border-amber-300/20 pt-2 text-[12px] text-white/75">
                 {(['doubted', 'trusted'] as const).map((who) => <p key={who}>Если прав {sheriffs[who].seat} → чёрные: <b className="text-white">{blackIfReal(sheriffs, who).join(', ')}</b></p>)}
               </div>
             </div>
           ) : null}
           {!broken ? tableMap : null}
          {broken && !checked ? (
            <SplitThreeBreakTask key={`${position}`} scenario={broken} onProgress={setBreakVotes}
              onDone={(answer, timedOut) => finish(!timedOut && isCorrectSplitThreeBreak(broken, answer), answer)} />
          ) : null}
          {broken ? tableMap : null}

          {chooseLevel && !checked ? <div className="space-y-3" data-testid="split-three-choose">
            <h3 className="text-base font-semibold">Кого пилить? Выбери троих</h3>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Кого пилить">
              {scenario.candidates.map((candidate) => (
                <button key={candidate} type="button" aria-pressed={picked.includes(candidate)}
                  onClick={() => setPicked((current) => (current.includes(candidate) ? current.filter((value) => value !== candidate) : current.length < 3 ? [...current, candidate] : current))}
                  className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold ${picked.includes(candidate) ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/70'}`}>{candidate}</button>
              ))}
            </div>
            <button type="button" disabled={picked.length !== 3} onClick={() => finish(isCorrectSplitThreeChoice(scenario, picked), [...picked].sort((a, b) => a - b))}
              className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40">Проверить ответ</button>
          </div> : null}

          {session.level === 'three_easy' && !checked ? <>
            <h3 className="text-base font-semibold">В кого ты голосуешь?</h3>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Твой голос">
              {scenario.candidates.map((candidate) => (
                <button key={candidate} type="button" aria-pressed={choice === candidate} onClick={() => setChoice(candidate)}
                  className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold ${choice === candidate ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/70'}`}>В {candidate}</button>
              ))}
            </div>
            <button type="button" disabled={choice === null} onClick={() => choice !== null && finish(choice === correctSplitThreeVote(scenario), choice)}
              className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40">Проверить ответ</button>
          </> : null}

          {medium && !checked ? (nomineeIndex < scenario.candidates.length ? (
            <div className="space-y-3" data-testid="split-three-interactive">
              <h3 className="text-base font-semibold">Кто голосует в {scenario.candidates[nomineeIndex]}?</h3>
              <p className="text-xs text-white/60">{nomineeIndex + 1} из {scenario.candidates.length} · Отметь руки. Оставшиеся пойдут в последнего: {scenario.candidates[scenario.candidates.length - 1]}.</p>
              <div className="grid grid-cols-5 gap-2" role="group" aria-label="Голосующие игроки">
                {aliveSeats(scenario.killed).filter((seat) => !taken.includes(seat)).map((seat) => (
                  <button key={seat} type="button" aria-pressed={selected.includes(seat)} onClick={() => setSelected((current) => (current.includes(seat) ? current.filter((value) => value !== seat) : [...current, seat]))}
                    className={`min-h-12 rounded-2xl border text-sm font-semibold ${selected.includes(seat) ? 'border-white bg-white/20' : 'border-white/15'}`}>{seat}</button>
                ))}
              </div>
              <button type="button" onClick={nextNominee} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{selected.length ? 'Продолжить' : 'Пропустить'}</button>
            </div>
          ) : (
            <div className="space-y-2" data-testid="split-three-review">
              <h3 className="text-base font-semibold">Проверь распределение голосов</h3>
              {scenario.candidates.map((candidate) => <p key={candidate} className="text-sm text-white/75">В {candidate}: {(assignments[candidate] ?? []).length ? seatList(assignments[candidate]) : 'никто'}</p>)}
              <button type="button" onClick={() => finish(isCorrectSplitThreeAssignment(scenario, assignments), assignments)} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Проверить голосование</button>
              <button type="button" onClick={() => { setAssignments({}); setNomineeIndex(0); }} className="min-h-11 w-full rounded-2xl text-sm text-white/70">Начать заново</button>
            </div>
          )) : null}

          {checked && broken && breakState ? (
            <div role="status" className="space-y-1 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-bold text-white">{checked.right ? '✓ Верно' : 'Разбор ошибки'}</p>
               {!checked.right ? assignmentMistakes(
                 splitThreeBreakVotes(broken, { [broken.breaker]: breakState.pool }),
                 splitThreeBreakVotes(broken, checked.answer as Record<number, number[]>),
                 aliveSeats(broken.killed).filter((seat) => seat !== broken.breaker),
               ).map((mistake) => <p key={mistake} className="text-amber-200">{mistake}</p>) : null}
               <p><b className="text-white">Почему:</b> {broken.breaker} не поставил руку — оставшиеся голоса должны идти в {broken.breaker}: <strong>{seatList(breakState.pool)}</strong>.</p>
               <p className="text-white/70">Сломавший хочет вывести не себя, а другого, поэтому с ним никто не голосует.</p>
              {breakState.voted.length ? <p>{seatList(breakState.voted)} уже подняли руки за {breakState.first} — переголосовать не могут.</p> : null}
            </div>
          ) : null}
          {checked && chooseLevel && choiceRule && sheriffs ? (
            <div role="status" className="space-y-1 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-bold text-white">{checked.right ? '✓ Верно' : 'Разбор ошибки'}</p>
               {!checked.right ? <p className="text-amber-200">Ты выбрал {Array.isArray(checked.answer) ? checked.answer.join(', ') : 'другие номера'}. Обязательные номера: {choiceRule.required.join(', ')}{choiceRule.freeThird ? ' + третий вне этих проверок и шерифов' : ''}.</p> : null}
               <p><b className="text-white">Почему:</b> смотри, кого проверки считают чёрным в обеих версиях.</p>
               <p>{sheriffs.trusted.black && sheriffs.doubted.black
                ? `Чёрные проверки у обоих шерифов — пилим обе чёрные проверки и шерифа, которому город верит меньше: ${choiceRule.required.join(', ')}.`
                : sheriffs.doubted.black
                  ? `Чёрная проверка только у шерифа ${sheriffs.doubted.seat}, которому город верит меньше, — пилим его и его чёрную проверку: ${choiceRule.required.join(', ')}, и ещё одного игрока.`
                  : `Чёрная проверка только у шерифа ${sheriffs.trusted.seat}, которому город верит больше, — пилим второго шерифа и эту чёрную проверку: ${choiceRule.required.join(', ')}, и ещё одного игрока.`}</p>
              {choiceRule.freeThird ? <p>Третьим подойдёт любой выставленный без проверок и не шериф.</p> : null}
            </div>
          ) : null}
          {checked && expected && !broken ? (
            <div role="status" className="space-y-1 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-bold text-white">{checked.right ? '✓ Верно' : 'Разбор ошибки'}</p>
               {!checked.right && !medium ? <p className="text-amber-200">Твой голос: в {checked.answer as number}. Правильно — в {correctSplitThreeVote(scenario)}.</p> : null}
               {!checked.right && medium ? assignmentMistakes(expected, checked.answer as Record<number, number[]>, aliveSeats(scenario.killed))
                 .map((mistake) => <p key={mistake} className="text-amber-200">{mistake}</p>) : null}
               <p><b className="text-white">Почему:</b> {sheriffs ? 'Сначала учитываем опасные руки из двух версий шерифов, затем заполняем свободные тройки.' : 'Сами пилящиеся первыми голосуют в первого. Остальные шесть по порядку мест — тройками во второго и третьего.'}</p>
               {sheriffs ? splitThreeVersions(scenario).map(({ sheriff, blacks, into }) => (
                <p key={sheriff} className="text-white/70">Если прав шериф {sheriff}, мафия — {blacks.join(' и ')}: {into.length ? `${blacks.length > 1 ? 'они голосуют' : 'он голосует'} в ${into.join(' или ')}` : `чёрных по другой версии в попиле нет — ${blacks.length > 1 ? 'голосуют' : 'голосует'} как обычно`}.</p>
              )) : null}
              <details className="rounded-xl border border-white/10 p-2.5">
                 <summary className="cursor-pointer font-semibold text-white">Все правильные голоса</summary>
                 <div className="mt-2 space-y-1">{scenario.candidates.map((candidate) => <p key={candidate}>В {candidate}: {expected[candidate].length ? seatList(expected[candidate]) : 'никто'}.</p>)}</div>
               </details>
               <p>Каждый из трёх пилящихся получает по 3 голоса.</p>
            </div>
          ) : null}

          {result ? <div data-testid="split-three-result" className={`rounded-2xl border p-4 text-sm leading-6 ${result === 'passed' ? 'border-emerald-400/50 bg-emerald-500/[.12] text-emerald-100' : 'border-white/15 bg-white/[.06]'}`}>
            <strong className="block text-base">{result === 'passed' ? 'Экзамен сдан: 5 из 5' : result === 'failed' ? `Экзамен не сдан: ошибка в вопросе ${position + 1}` : `Практика завершена: ${correct} из 5`}</strong>
            {result === 'passed' && ORDER.indexOf(session.level) < ORDER.length - 1 ? <p className="mt-1 text-white/75">Открыт следующий уровень: «{LEVEL_TITLES[ORDER[ORDER.indexOf(session.level) + 1]]}».</p> : null}
          </div> : null}
          {saveError ? <div role="alert" className="text-sm text-amber-200">Не удалось сохранить результат. Проверь соединение.<button type="button" onClick={() => void save(answers, session.level)} className="mt-2 min-h-11 w-full rounded-2xl border border-white/30">Повторить сохранение</button></div> : null}
          {saving ? <p role="status" className="text-sm text-white/70">Сохраняем результат экзамена…</p> : null}
          {checked && !result && !saveError && !saving && !(session.mode === 'exam' && position === 4) ? <button type="button" onClick={advance} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">Следующая задача</button> : null}
          {result ? <button type="button" onClick={() => start(session)} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black">{result === 'passed' ? 'Пройти ещё раз' : 'Попробовать снова'}</button> : null}
          <button type="button" onClick={() => setSession(null)} className="min-h-11 w-full rounded-2xl text-sm text-white/60">К выбору режима</button>
          {session.mode === 'endless' && position > 0 ? <p className="text-center text-xs text-white/50">Правильных ответов: {correct} из {position + (checked ? 1 : 0)}.</p> : null}
        </section>
      )}
    </div>
  );
};

export default SplitThreeTraining;
