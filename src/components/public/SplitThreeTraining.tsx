import { useEffect, useState } from 'react';
import { seatList } from '../../lib/splitVoteTraining.ts';
import {
  SPLIT_THREE_RULES, aliveSeats, completeSplitThreeAnswer, correctSplitThreeVote, generateSplitThreeScenario,
  isCorrectSplitThreeAssignment, splitThreeAssignments, type SplitThreeLevel, type SplitThreeScenario,
} from '../../lib/splitThreeTraining.ts';

type Mode = 'practice' | 'exam' | 'endless';
type Session = { level: SplitThreeLevel; mode: Mode };
type Answer = number | Record<number, number[]>;
type ProgressState = 'loading' | 'ready' | 'guest' | 'error';

const LEVELS: Array<{ value: SplitThreeLevel; title: string; description: string }> = [
  { value: 'three_easy', title: 'Лёгкий уровень', description: 'Выставлены трое, пилим всех. Выбери, в кого голосуешь ты.' },
  { value: 'three_medium', title: 'Средний уровень', description: 'Выставлены 4–6, пилим троих из них. Распиши весь стол по кандидатам.' },
];
const LEVEL_TITLES: Record<SplitThreeLevel, string> = { three_easy: 'Лёгкий уровень', three_medium: 'Средний уровень' };

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

  const unlocked = (level: SplitThreeLevel) => level === 'three_easy' || passed.includes('three_easy');
  const scenario = queue[position];
  const medium = session?.level === 'three_medium';

  const resetTask = () => { setChoice(null); setNomineeIndex(0); setAssignments({}); setSelected([]); setChecked(null); };
  const start = (next: Session) => {
    if (!unlocked(next.level) || (next.mode === 'exam' && progress !== 'ready')) return;
    setSession(next);
    setQueue(initial?.length ? initial : [generateSplitThreeScenario(next.level)]);
    setPosition(0); setCorrect(0); setAnswers([]); setResult(null); setSaveError(false);
    resetTask();
  };
  const advance = () => {
    if (!session) return;
    setQueue((current) => (current[position + 1] ? current : [...current, generateSplitThreeScenario(session.level, current[position])]));
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

  const expected = scenario ? splitThreeAssignments(scenario) : null;
  const taken = Object.values(assignments).flat();

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
              {!unlocked(level.value) ? <p className="mt-2 text-sm text-amber-200">🔒 Сначала сдай экзамен лёгкого уровня.</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={!unlocked(level.value)} onClick={() => start({ level: level.value, mode: 'practice' })} className="min-h-12 rounded-2xl border border-white/15 px-2 text-sm font-semibold disabled:opacity-40">Практика · 5 вопросов</button>
                <button type="button" disabled={!unlocked(level.value) || progress !== 'ready'} onClick={() => start({ level: level.value, mode: 'exam' })} className="min-h-12 rounded-2xl bg-white px-2 text-sm font-semibold text-black disabled:opacity-40">{passed.includes(level.value) ? 'Пройти ещё раз' : 'Экзамен · 5 вопросов'}</button>
              </div>
              <button type="button" disabled={!unlocked(level.value)} onClick={() => start({ level: level.value, mode: 'endless' })} className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 px-3 text-sm font-semibold disabled:opacity-40">Бесконечная практика</button>
            </section>
          ))}
          <p className="px-1 text-xs leading-5 text-white/55">{progress === 'guest' ? 'Чтобы сдавать экзамены и сохранять прогресс, войди в кабинет игрока.' : progress === 'error' ? 'Не удалось загрузить прогресс. Обнови страницу.' : 'Сложный и экспертный уровни появятся позже.'}</p>
        </div>
      ) : (
        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="split-three-question">
          <div className="flex items-center justify-between gap-2 text-xs text-white/50">
            <span>{LEVEL_TITLES[session.level]} · {session.mode === 'exam' ? 'экзамен' : session.mode === 'practice' ? 'практика' : 'без конца'}</span>
            <span>{session.mode === 'endless' ? `Задача ${position + 1}` : `Вопрос ${position + 1} из 5`}</span>
          </div>
          <p className="text-sm text-white/65">Убит <strong className="text-white" data-testid="split-three-killed">{scenario.killed}</strong>. За столом 9 человек.</p>
          <p className="text-sm text-white/65" data-testid="split-three-nominees">Выставлены по порядку: <strong className="text-white">{scenario.candidates.join(', ')}</strong>.</p>
          <p className="text-sm text-white/65" data-testid="split-three-split">{medium ? <>Пилим: <strong className="text-white">{scenario.split.join(', ')}</strong>.</> : 'Пилим всех троих.'}</p>
          {!medium ? <p className="text-sm text-white/65" data-testid="split-three-seat">Твой номер за столом — <strong className="text-white">{scenario.seat}</strong>.</p> : null}

          {!medium && !checked ? <>
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
              <p className="text-xs text-white/60">Кандидат {nomineeIndex + 1} из {scenario.candidates.length}. Кто ни за кого не проголосует, уйдёт в последнего — в {scenario.candidates[scenario.candidates.length - 1]}.</p>
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

          {checked && expected ? (
            <div role="status" className="space-y-1 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-6 text-white/80">
              <p className="font-semibold text-white">{checked.right ? 'Верно!' : medium ? 'Распределение голосов неверное.' : `Тебе нужно голосовать в ${correctSplitThreeVote(scenario)}.`}</p>
              {scenario.candidates.map((candidate) => (
                <p key={candidate}>В {candidate} {expected[candidate].length ? `голосуют ${seatList(expected[candidate])}` : 'никто не голосует'}{candidate === scenario.split[0] ? ' — сами пилящиеся' : ''}.</p>
              ))}
              <p>Каждый из трёх пилящихся получает по 3 голоса.</p>
            </div>
          ) : null}

          {result ? <div data-testid="split-three-result" className={`rounded-2xl border p-4 text-sm leading-6 ${result === 'passed' ? 'border-emerald-400/50 bg-emerald-500/[.12] text-emerald-100' : 'border-white/15 bg-white/[.06]'}`}>
            <strong className="block text-base">{result === 'passed' ? 'Экзамен сдан: 5 из 5' : result === 'failed' ? `Экзамен не сдан: ошибка в вопросе ${position + 1}` : `Практика завершена: ${correct} из 5`}</strong>
            {result === 'passed' && session.level === 'three_easy' ? <p className="mt-1 text-white/75">Средний уровень открыт.</p> : null}
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
