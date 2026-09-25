import React, { useMemo, useState } from 'react';
import { BookOpen, Check, Copy, Search, Sparkles } from 'lucide-react';
import { GLOSSARY, GUIDE_INTRO, ROLES, SCENARIO, SIMPLE_RULES, TABLE_RULES, searchGlossary, type GuideBlock } from '../../lib/clubGuide.ts';
import { GUIDE_QUIZ } from '../../lib/clubGuideQuiz.ts';

export type GuideTab = 'evening' | 'roles' | 'rules' | 'glossary' | 'quiz';

const TABS: Array<{ id: GuideTab; label: string }> = [
  { id: 'evening', label: 'Вечер' },
  { id: 'roles', label: 'Роли' },
  { id: 'rules', label: 'Правила' },
  { id: 'glossary', label: 'Словарь' },
  { id: 'quiz', label: 'Тест' },
];

export const guideTabFromSearch = (search: string): GuideTab => {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'roles' || tab === 'rules' || tab === 'glossary' || tab === 'quiz' ? tab : 'evening';
};

const Blocks = ({ blocks }: { blocks: GuideBlock[] }) => (
  <div className="space-y-3">
    {blocks.map((block) => (
      <section key={block.title} className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
        <h2 className="text-[16px] font-semibold text-white">{block.title}</h2>
        {block.lead ? <p className="mt-1.5 text-[14px] leading-6 text-white/65">{block.lead}</p> : null}
        {block.points.length ? <ul className="mt-2.5 space-y-2">
          {block.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-[14px] leading-6 text-white/75">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul> : null}
      </section>
    ))}
  </div>
);

const Scenario = () => (
  <div className="space-y-3">
    <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4">
      <h2 className="text-[18px] font-semibold text-white">{GUIDE_INTRO.title}</h2>
      <p className="mt-2 text-[15px] leading-6 text-white/75">{GUIDE_INTRO.text}</p>
    </section>
    <h2 className="px-1 pt-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/45">Ваш первый вечер — шаг за шагом</h2>
    <ol className="space-y-2.5">
      {SCENARIO.map((step, index) => (
        <li key={step.title} data-testid="guide-step" className="flex gap-3 rounded-3xl border border-white/10 bg-white/[.035] p-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[14px] font-bold text-black">{index + 1}</span>
          <div className="min-w-0 flex-1">
            {step.when ? <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/45">{step.when}</div> : null}
            <h3 className="text-[16px] font-semibold text-white">{step.title}</h3>
            <p className="mt-1 text-[14px] leading-6 text-white/75">{step.text}</p>
            {step.points?.length ? (
              <ul className="mt-2 space-y-1.5">
                {step.points.map((point) => <li key={point} className="text-[14px] leading-6 text-white/60">— {point}</li>)}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  </div>
);

const Roles = () => (
  <div className="space-y-3">
    <p className="px-1 text-[14px] leading-6 text-white/65">За столом две команды: <strong className="text-rose-200">красные</strong> — город, и <strong className="text-white">чёрные</strong> — мафия. У каждой роли своя задача.</p>
    {ROLES.map((role) => (
      <section key={role.name} data-testid="guide-role" className={`rounded-3xl border p-4 ${role.team === 'red' ? 'border-rose-300/20 bg-rose-400/[.06]' : 'border-white/15 bg-white/[.05]'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-white">{role.name}</h2>
          <span className={`shrink-0 text-[12px] font-semibold ${role.team === 'red' ? 'text-rose-200/80' : 'text-white/55'}`}>{role.team === 'red' ? 'Красные' : 'Чёрные'} · {role.count}</span>
        </div>
        <p className="mt-2 rounded-2xl bg-black/25 px-3 py-2.5 text-[14px] leading-6 text-white"><strong>Задача:</strong> {role.task}</p>
        <ul className="mt-2.5 space-y-1.5">
          {role.how.map((point) => <li key={point} className="text-[14px] leading-6 text-white/70">— {point}</li>)}
        </ul>
        <p className="mt-2.5 text-[13px] italic leading-5 text-white/55">💡 {role.tip}</p>
      </section>
    ))}
  </div>
);

const GuideQuiz = () => {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  if (index === GUIDE_QUIZ.length) return (
    <section className="rounded-3xl border border-white/10 bg-white/[.045] p-5 text-center">
      <h2 className="text-xl font-semibold">Готово: {score} из {GUIDE_QUIZ.length}</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">Это проверка для себя. Она не влияет на доступ к играм, Elo или награды.</p>
      <button type="button" className="mt-4 min-h-12 rounded-2xl bg-white px-5 font-semibold text-black" onClick={() => { setIndex(0); setSelected(null); setAnswered(false); setScore(0); }}>Пройти ещё раз</button>
    </section>
  );
  const item = GUIDE_QUIZ[index];
  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[.045] p-4" data-testid="guide-quiz">
      <p className="text-xs uppercase tracking-wider text-white/50">Вопрос {index + 1} из {GUIDE_QUIZ.length}</p>
      <h2 className="text-lg font-semibold">{item.question}</h2>
      <div className="space-y-2" role="group" aria-label={item.question}>
        {item.options.map((option, optionIndex) => (
          <button key={option} type="button" disabled={answered} aria-pressed={selected === optionIndex}
            onClick={() => setSelected(optionIndex)}
            className={`w-full min-h-12 rounded-2xl border px-4 py-3 text-left text-sm ${selected === optionIndex ? 'border-white bg-white/15 text-white' : 'border-white/15 text-white/75'} disabled:opacity-80`}>{option}</button>
        ))}
      </div>
      {answered ? <p role="status" className="text-sm leading-6 text-white/80">{selected === item.correct ? 'Верно. ' : 'Пока нет. '}{item.explanation}</p> : null}
      <button type="button" disabled={selected === null} className="min-h-12 w-full rounded-2xl bg-white px-4 font-semibold text-black disabled:opacity-40"
        onClick={() => {
          if (!answered) { setAnswered(true); if (selected === item.correct) setScore((value) => value + 1); }
          else { setIndex((value) => value + 1); setSelected(null); setAnswered(false); }
        }}>{answered ? (index === GUIDE_QUIZ.length - 1 ? 'Посмотреть результат' : 'Следующий вопрос') : 'Проверить ответ'}</button>
    </section>
  );
};

/**
 * «Правила и словарь» — a public page (no sign-in) to send a novice before the first evening:
 * /guide, /guide?tab=rules, /guide?tab=glossary.
 */
export const PublicGuide: React.FC<{ initialTab?: GuideTab }> = ({ initialTab = 'evening' }) => {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [detailedRules, setDetailedRules] = useState(false);
  const terms = useMemo(() => searchGlossary(query), [query]);

  const selectTab = (next: GuideTab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'evening') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    } catch { /* the page works without updating the address */ }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/guide`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be unavailable in some webviews */ }
  };

  return (
    <main data-testid="public-guide" className="min-h-screen bg-[#090a0d] px-4 pb-10 pt-7 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 text-[11px] uppercase tracking-wider text-white/55"><Sparkles className="h-3.5 w-3.5" />2LA Noire · Тула</div>
          <h1 className="mt-4 flex items-center justify-center gap-2 text-2xl font-semibold"><BookOpen className="h-6 w-6 text-white/60" />Правила и словарь</h1>
          <p className="mt-2 text-[14px] leading-6 text-white/55">Как пройдёт ваш первый вечер спортивной мафии — от входа до финала игры.</p>
        </header>

        {/* Sticks below Telegram's top safe area (header, device cutout). */}
        <nav className="sticky z-10 -mx-4 bg-[#090a0d]/95 px-4 py-2 backdrop-blur" style={{ top: 'var(--tg-content-safe-area-top, 0px)' }} aria-label="Разделы">
          <div className="grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-white/[.04] p-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`guide-tab-${item.id}`}
                aria-pressed={tab === item.id}
                onClick={() => selectTab(item.id)}
                className={`min-h-11 min-w-0 rounded-xl px-1 text-[12px] font-semibold ${tab === item.id ? 'bg-white text-black' : 'text-white/60'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {tab === 'evening' ? <Scenario /> : null}
        {tab === 'roles' ? <Roles /> : null}
        {tab === 'quiz' ? <GuideQuiz /> : null}
        {tab === 'rules' ? (
          <div className="space-y-3">
            {/* Plain words first for a novice; the full club terms (фол, техфол, ППК) for experienced players. */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[.04] p-1">
              <button type="button" data-testid="guide-rules-simple" aria-pressed={!detailedRules} onClick={() => setDetailedRules(false)} className={`min-h-11 rounded-xl px-2 text-[13px] font-semibold ${!detailedRules ? 'bg-white text-black' : 'text-white/60'}`}>Простыми словами</button>
              <button type="button" data-testid="guide-rules-detailed" aria-pressed={detailedRules} onClick={() => setDetailedRules(true)} className={`min-h-11 rounded-xl px-2 text-[13px] font-semibold ${detailedRules ? 'bg-white text-black' : 'text-white/60'}`}>Подробно</button>
            </div>
            {detailedRules
              ? <p className="px-1 text-[13px] leading-5 text-white/50">Полный свод с терминами клуба — для тех, кто уже играл. Незнакомое слово ищите во вкладке «Словарь».</p>
              : null}
            <Blocks blocks={detailedRules ? TABLE_RULES : SIMPLE_RULES} />
          </div>
        ) : null}
        {tab === 'glossary' ? (
          <div className="space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                data-testid="guide-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти слово: ПУ, фол, Дон…"
                className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30"
              />
            </label>
            {terms.map((item) => (
              <article key={item.term} data-testid="guide-term" className="rounded-2xl border border-white/10 bg-white/[.035] p-3.5">
                <h2 className="text-[15px] font-semibold text-white">{item.term}</h2>
                <p className="mt-1 text-[14px] leading-6 text-white/70">{item.meaning}</p>
              </article>
            ))}
            {!terms.length ? <p className="py-8 text-center text-[14px] text-white/45">Такого слова пока нет. Спросите судью на брифинге.</p> : null}
            <p className="text-center text-[12px] text-white/35">В словаре {GLOSSARY.length} слов.</p>
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4 text-center">
          <p className="text-[14px] leading-6 text-white/60">Готовы попробовать? Запишитесь на ближайший вечер в кабинете игрока.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/player/events" className="flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 text-[14px] font-semibold text-black">Выбрать вечер</a>
            <button type="button" onClick={() => void copyLink()} className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/15 px-3 text-[14px] font-semibold text-white/80">
              {copied ? <><Check className="h-4 w-4" />Скопировано</> : <><Copy className="h-4 w-4" />Ссылка другу</>}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};

export default PublicGuide;
