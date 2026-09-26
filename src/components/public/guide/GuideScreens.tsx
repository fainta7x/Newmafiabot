import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ListChecks, Moon, Search } from 'lucide-react';
import { GLOSSARY, GUIDE_INTRO, ROLES, SCENARIO, SIMPLE_RULES, TABLE_RULES, searchGlossary } from '../../../lib/clubGuide.ts';
import { GUIDE_QUIZ } from '../../../lib/clubGuideQuiz.ts';
import { GUIDE_LESSONS, pluralRu } from '../../../lib/guideCatalog.ts';
import { Accordion, ProgressBar, Segmented, Timeline } from './GuideBlocks.tsx';

/* Reading progress lives only in this browser: a convenience, never a requirement. */
export type GuideProgress = { lessons: string[]; quizBest: number | null; /** The last trainer, article or reference screen opened. */ recent: string | null };
const PROGRESS_KEY = 'guide-progress-v2';
export const EMPTY_PROGRESS: GuideProgress = { lessons: [], quizBest: null, recent: null };
export const readProgress = (): GuideProgress => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || '{}');
    return {
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons.filter((item: unknown) => typeof item === 'string') : [],
      quizBest: Number.isInteger(parsed.quizBest) ? parsed.quizBest : null,
      recent: typeof parsed.recent === 'string' ? parsed.recent : null,
    };
  } catch { return EMPTY_PROGRESS; }
};
export const writeProgress = (progress: GuideProgress) => {
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage may be blocked */ }
};

export const EveningScreen = () => (
  <div className="space-y-5">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[.08] to-white/[.02] p-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/50"><Moon className="h-4 w-4" />{GUIDE_INTRO.title}</div>
      <p className="mt-2 text-[15px] leading-6 text-white/80">{GUIDE_INTRO.text}</p>
    </section>
    <Timeline steps={SCENARIO} />
  </div>
);

export const RolesScreen = () => {
  const [active, setActive] = useState(0);
  const role = ROLES[active];
  const red = role.team === 'red';
  return (
    <div className="space-y-3">
      <p className="px-1 text-[14px] leading-6 text-white/65">Две команды: <strong className="text-rose-200">красные</strong> — город, <strong className="text-white">чёрные</strong> — мафия. Выберите роль.</p>
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Роли">
        {ROLES.map((item, index) => (
          <button key={item.name} type="button" role="tab" data-testid="guide-role" aria-selected={active === index} onClick={() => setActive(index)}
            className={`min-h-16 rounded-2xl border px-3 py-2 text-left transition-colors ${active === index
              ? (item.team === 'red' ? 'border-rose-300/60 bg-rose-400/[.16]' : 'border-white/60 bg-white/[.14]')
              : 'border-white/10 bg-white/[.04]'}`}>
            <span className="block text-[14px] font-semibold leading-5 text-white">{item.name}</span>
            <span className={`mt-0.5 block text-[11px] font-semibold ${item.team === 'red' ? 'text-rose-200/80' : 'text-white/55'}`}>{item.team === 'red' ? 'Красные' : 'Чёрные'} · {item.count}</span>
          </button>
        ))}
      </div>
      <section role="tabpanel" data-testid="guide-role-card" className={`rounded-3xl border p-4 ${red ? 'border-rose-300/20 bg-rose-400/[.06]' : 'border-white/15 bg-white/[.05]'}`}>
        <h2 className="text-[20px] font-semibold text-white">{role.name}</h2>
        <p className="mt-2 rounded-2xl bg-black/25 px-3 py-2.5 text-[14px] leading-6 text-white"><strong>Задача:</strong> {role.task}</p>
        <ul className="mt-3 space-y-2">
          {role.how.map((point) => (
            <li key={point} className="flex gap-2.5 text-[14px] leading-6 text-white/75">
              <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${red ? 'bg-rose-300/70' : 'bg-white/50'}`} aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-2xl border border-white/10 px-3 py-2.5 text-[13px] leading-5 text-white/65">💡 {role.tip}</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={active === 0} onClick={() => setActive(active - 1)} className="flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-white/15 text-[13px] font-semibold text-white/75 disabled:opacity-30"><ChevronLeft className="h-4 w-4" />{active > 0 ? ROLES[active - 1].name : 'Назад'}</button>
        <button type="button" disabled={active === ROLES.length - 1} onClick={() => setActive(active + 1)} className="flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-white/15 text-[13px] font-semibold text-white/75 disabled:opacity-30">{active < ROLES.length - 1 ? ROLES[active + 1].name : 'Дальше'}<ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

export const RulesScreen = () => {
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple');
  return (
    <div className="space-y-3">
      {/* Plain words first for a novice; the full club terms (фол, техфол, ППК) for experienced players. */}
      <Segmented value={mode} onChange={setMode} options={[
        { value: 'simple', label: 'Простыми словами', testId: 'guide-rules-simple' },
        { value: 'detailed', label: 'Подробно', testId: 'guide-rules-detailed' },
      ]} />
      <p className="px-1 text-[13px] leading-5 text-white/50">{mode === 'simple'
        ? 'Главное для первого вечера. Нажмите на тему, чтобы раскрыть её.'
        : 'Полный свод с терминами клуба — для тех, кто уже играл. Незнакомое слово ищите в «Словаре».'}</p>
      <Accordion key={mode} blocks={mode === 'simple' ? SIMPLE_RULES : TABLE_RULES} />
    </div>
  );
};

const firstLetter = (term: string) => term.trim().charAt(0).toLocaleUpperCase('ru-RU').replace('Ё', 'Е');

export const GlossaryScreen = () => {
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const letters = useMemo(() => [...new Set(GLOSSARY.map((item) => firstLetter(item.term)))].sort((a, b) => a.localeCompare(b, 'ru')), []);
  const terms = useMemo(() => {
    const found = searchGlossary(query);
    return letter && !query.trim() ? found.filter((item) => firstLetter(item.term) === letter) : found;
  }, [query, letter]);
  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input data-testid="guide-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти слово: ПУ, фол, Дон…"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30" />
      </label>
      {!query.trim() ? (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Буквы">
          <button type="button" aria-pressed={letter === null} onClick={() => setLetter(null)} className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${letter === null ? 'bg-white text-black' : 'bg-white/[.06] text-white/65'}`}>Все</button>
          {letters.map((item) => (
            <button key={item} type="button" aria-pressed={letter === item} onClick={() => setLetter(letter === item ? null : item)} className={`min-h-9 min-w-9 shrink-0 rounded-full px-2 text-[13px] font-semibold ${letter === item ? 'bg-white text-black' : 'bg-white/[.06] text-white/65'}`}>{item}</button>
          ))}
        </div>
      ) : null}
      {terms.map((item) => (
        <article key={item.term} data-testid="guide-term" className="rounded-2xl border border-white/10 bg-white/[.035] p-3.5">
          <h2 className="text-[15px] font-semibold text-white">{item.term}</h2>
          <p className="mt-1 text-[14px] leading-6 text-white/70">{item.meaning}</p>
        </article>
      ))}
      {!terms.length ? <p className="py-8 text-center text-[14px] text-white/45">Такого слова пока нет. Спросите судью на брифинге.</p> : null}
      <p className="text-center text-[12px] text-white/35">В словаре {GLOSSARY.length} {pluralRu(GLOSSARY.length, 'слово', 'слова', 'слов')}.</p>
    </div>
  );
};

export const GuideQuiz = ({ onFinish }: { onFinish?: (score: number) => void }) => {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  if (index === GUIDE_QUIZ.length) return (
    <section className="rounded-3xl border border-white/10 bg-white/[.045] p-5 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-black"><Check className="h-7 w-7" /></div>
      <h2 className="mt-3 text-xl font-semibold">Готово: {score} из {GUIDE_QUIZ.length}</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">Это проверка для себя. Она не влияет на доступ к играм, Elo или награды.</p>
      <button type="button" className="mt-4 min-h-12 rounded-2xl bg-white px-5 font-semibold text-black" onClick={() => { setIndex(0); setSelected(null); setAnswered(false); setScore(0); }}>Пройти ещё раз</button>
    </section>
  );
  const item = GUIDE_QUIZ[index];
  return (
    <section className="space-y-4" data-testid="guide-quiz">
      <ProgressBar total={GUIDE_QUIZ.length} done={index} current={index} />
      <p className="text-xs uppercase tracking-wider text-white/50">Вопрос {index + 1} из {GUIDE_QUIZ.length}</p>
      <h2 className="text-lg font-semibold leading-7">{item.question}</h2>
      <div className="space-y-2" role="group" aria-label={item.question}>
        {item.options.map((option, optionIndex) => {
          const look = answered && optionIndex === item.correct ? 'border-emerald-400/70 bg-emerald-500/15 text-white'
            : answered && selected === optionIndex ? 'border-rose-400/60 bg-rose-500/10 text-white'
              : selected === optionIndex ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/75';
          return <button key={option} type="button" disabled={answered} aria-pressed={selected === optionIndex} onClick={() => setSelected(optionIndex)}
            className={`w-full min-h-12 rounded-2xl border px-4 py-3 text-left text-sm ${look} disabled:opacity-90`}>{option}</button>;
        })}
      </div>
      {answered ? <p role="status" className="rounded-2xl bg-white/[.05] px-3 py-2.5 text-sm leading-6 text-white/80">{selected === item.correct ? 'Верно. ' : 'Пока нет. '}{item.explanation}</p> : null}
      <button type="button" disabled={selected === null} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40"
        onClick={() => {
          if (!answered) { setAnswered(true); if (selected === item.correct) setScore((value) => value + 1); return; }
          if (index === GUIDE_QUIZ.length - 1) onFinish?.(score);
          setIndex((value) => value + 1); setSelected(null); setAnswered(false);
        }}>{answered ? (index === GUIDE_QUIZ.length - 1 ? 'Посмотреть результат' : 'Следующий вопрос') : 'Проверить ответ'}</button>
    </section>
  );
};

export const LessonScreen = ({ index, onNext, onPrevious }: { index: number; onNext: () => void; onPrevious: () => void }) => {
  const lesson = GUIDE_LESSONS[index];
  const last = index === GUIDE_LESSONS.length - 1;
  const { content } = lesson;
  return (
    <div className="space-y-4" data-testid="guide-lesson-content">
      <ProgressBar total={GUIDE_LESSONS.length} done={index + 1} />
      <header className="px-1">
        <p className="text-xs uppercase tracking-wider text-white/50">Урок {index + 1} из {GUIDE_LESSONS.length}</p>
        <p className="mt-1 text-[15px] leading-6 text-white/75">{lesson.description}</p>
      </header>
      {content.kind === 'roles' ? <RolesScreen /> : null}
      {content.kind === 'scenario' ? <Timeline steps={SCENARIO.slice(content.start, content.end)} startNumber={content.start + 1} /> : null}
      {content.kind === 'blocks' ? <Accordion blocks={content.blocks} defaultOpen={0} /> : null}
      {/* The next step stays in reach of the thumb at the bottom of a phone screen. */}
      <div className="sticky bottom-0 -mx-4 grid grid-cols-[auto_1fr] gap-2 bg-gradient-to-t from-[#090a0d] via-[#090a0d] to-transparent px-4 pt-6"
        style={{ paddingBottom: 'calc(12px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        <button type="button" onClick={onPrevious} className="grid min-h-12 w-12 place-items-center rounded-2xl border border-white/15 text-white/75" aria-label={index === 0 ? 'К списку уроков' : 'Предыдущий урок'}><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" onClick={onNext} className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-white px-4 text-sm font-semibold text-black">{last ? 'Проверить себя' : 'Следующий урок'}<ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

export const LessonPath = ({ progress, onLesson, onQuiz }: { progress: GuideProgress; onLesson: (index: number) => void; onQuiz: () => void }) => (
  <ol className="relative" data-testid="guide-path">
    {GUIDE_LESSONS.map((lesson, index) => {
      const done = progress.lessons.includes(lesson.id);
      return (
        <li key={lesson.id} className="relative pb-2">
          <span className="absolute bottom-0 left-[27px] top-12 w-px bg-white/12" aria-hidden="true" />
          <button type="button" data-testid="guide-lesson" onClick={() => onLesson(index)} className="relative flex min-h-[72px] w-full items-center gap-3 rounded-3xl border border-white/10 bg-white/[.045] p-3 pr-2 text-left active:bg-white/[.08]">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? 'bg-emerald-400 text-black' : 'bg-white text-black'}`}>{done ? <Check className="h-5 w-5" /> : index + 1}</span>
            <span className="min-w-0 flex-1"><strong className="block text-[15px] text-white">{lesson.title}</strong><span className="mt-0.5 block text-[13px] leading-5 text-white/55">{lesson.description}</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
          </button>
        </li>
      );
    })}
    <li>
      <button type="button" onClick={onQuiz} className="flex min-h-[64px] w-full items-center gap-3 rounded-3xl border border-dashed border-white/20 p-3 pr-2 text-left">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${progress.quizBest !== null ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white'}`}><ListChecks className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-[15px] text-white">Проверь себя</strong><span className="mt-0.5 block text-[13px] leading-5 text-white/55">{progress.quizBest !== null ? `Лучший результат: ${progress.quizBest} из ${GUIDE_QUIZ.length}` : 'Короткий тест в конце пути. Ни на что не влияет.'}</span></span>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
      </button>
    </li>
  </ol>
);
