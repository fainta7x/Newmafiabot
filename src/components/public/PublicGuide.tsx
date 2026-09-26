import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookA, BookOpen, Check, ChevronLeft, ChevronRight, Copy, FileText, GraduationCap, ListChecks,
  Moon, Scale, Sparkles, Users, Vote,
} from 'lucide-react';
import {
  GUIDE_ENTRIES, GUIDE_LESSONS, GUIDE_SHELVES, findGuideEntry, findGuideShelf, isGuideScreen, pluralRu,
  type GuideEntry, type GuideIcon, type GuideShelf, type GuideView,
} from '../../lib/guideCatalog.ts';
import { Article } from './guide/GuideBlocks.tsx';
import {
  EMPTY_PROGRESS, EveningScreen, GlossaryScreen, GuideQuiz, LessonPath, LessonScreen, RolesScreen, RulesScreen,
  readProgress, writeProgress, type GuideProgress,
} from './guide/GuideScreens.tsx';
import { SplitVoteTraining } from './SplitVoteTraining.tsx';
import { SplitThreeTraining } from './SplitThreeTraining.tsx';

/** 'home', 'lessons', a section (shelf id) or a catalog entry id (see src/lib/guideCatalog.ts). */
export type GuideTab = string;
type GuideScreen = { tab: GuideTab; lesson?: number };

const ICONS: Record<GuideIcon, React.ComponentType<{ className?: string }>> = {
  moon: Moon, users: Users, scale: Scale, book: BookA, vote: Vote, article: FileText, list: ListChecks,
};

type ViewProps = { entry: GuideEntry; onQuizFinish: (score: number) => void };
/** Every catalog `view` has one component. A new kind of trainer or screen is added here. */
const GUIDE_VIEWS: Record<GuideView, React.FC<ViewProps>> = {
  evening: () => <EveningScreen />,
  roles: () => <RolesScreen />,
  rules: () => <RulesScreen />,
  glossary: () => <GlossaryScreen />,
  quiz: ({ onQuizFinish }) => <GuideQuiz onFinish={onQuizFinish} />,
  split: () => <SplitVoteTraining />,
  'split-three': () => <SplitThreeTraining />,
  article: ({ entry }) => <Article blocks={entry.blocks || []} />,
};

export const guideTabFromSearch = (search: string): GuideTab => {
  const tab = new URLSearchParams(search).get('tab');
  return isGuideScreen(tab) ? tab : 'home';
};

const screenUrl = (screen: GuideScreen) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('tab');
  url.searchParams.delete('lesson');
  if (screen.tab !== 'home') url.searchParams.set('tab', screen.tab);
  if (screen.tab === 'lessons' && screen.lesson !== undefined) url.searchParams.set('lesson', String(screen.lesson + 1));
  return `${url.pathname}${url.search}`;
};
const lessonFromSearch = (search: string) => {
  const value = Number(new URLSearchParams(search).get('lesson'));
  return Number.isInteger(value) && value >= 1 && value <= GUIDE_LESSONS.length ? value - 1 : undefined;
};

type TelegramBackButton = { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
const telegramBackButton = (): TelegramBackButton | null =>
  (window as unknown as { Telegram?: { WebApp?: { BackButton?: TelegramBackButton } } }).Telegram?.WebApp?.BackButton || null;

const Tile = ({ entry, onOpen }: { entry: GuideEntry; onOpen: () => void }) => {
  const Icon = ICONS[entry.icon];
  return (
    <button type="button" data-testid={`guide-tab-${entry.id}`} onClick={onOpen} className="flex min-h-[112px] flex-col justify-between rounded-3xl border border-white/10 bg-white/[.045] p-3.5 text-left active:bg-white/[.08]">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/[.08] text-white/80"><Icon className="h-5 w-5" /></span>
      <span><strong className="block text-[15px] text-white">{entry.title}</strong><span className="mt-0.5 block text-[12px] leading-4 text-white/50">{entry.detail}</span></span>
    </button>
  );
};

const Row = ({ entry, onOpen }: { entry: GuideEntry; onOpen: () => void }) => {
  const Icon = ICONS[entry.icon];
  return (
    <button type="button" data-testid={`guide-tab-${entry.id}`} onClick={onOpen} className="flex min-h-[72px] w-full items-center gap-3 rounded-3xl border border-white/10 bg-white/[.045] p-3.5 pr-2 text-left active:bg-white/[.08]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[.08] text-white/80"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-[15px] text-white">{entry.title}</strong><span className="mt-0.5 block text-[13px] leading-5 text-white/55">{entry.detail}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
    </button>
  );
};

const ShelfTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">{children}</h2>
);

const shelfEntries = (shelf: GuideShelf) => GUIDE_ENTRIES.filter((entry) => entry.shelf === shelf.id);

/** A big section card on the home screen: everything is at most two taps away. */
const SectionCard = ({ id, icon: Icon, title, detail, onOpen, children }: {
  id: string; icon: React.ComponentType<{ className?: string }>; title: string; detail: string; onOpen: () => void; children?: React.ReactNode;
}) => (
  <button type="button" data-testid={`guide-section-${id}`} onClick={onOpen} className="flex min-h-[124px] flex-col justify-between rounded-3xl border border-white/10 bg-white/[.055] p-3.5 text-left active:bg-white/[.09]">
    <span className="flex items-center justify-between gap-2">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[.09] text-white/85"><Icon className="h-5 w-5" /></span>
      <ChevronRight className="h-5 w-5 text-white/30" aria-hidden="true" />
    </span>
    <span className="mt-3 block">
      <strong className="block text-[16px] text-white">{title}</strong>
      <span className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-white/55">{detail}</span>
      {children}
    </span>
  </button>
);

const HomeScreen = ({ progress, go }: { progress: GuideProgress; go: (screen: GuideScreen) => void }) => {
  const nextLesson = GUIDE_LESSONS.findIndex((lesson) => !progress.lessons.includes(lesson.id));
  const doneCount = GUIDE_LESSONS.filter((lesson) => progress.lessons.includes(lesson.id)).length + (progress.quizBest !== null ? 1 : 0);
  const total = GUIDE_LESSONS.length + 1;
  const started = doneCount > 0;
  const recent = progress.recent ? findGuideEntry(progress.recent) : null;
  const RecentIcon = recent ? ICONS[recent.icon] : null;
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2" data-testid="guide-sections" aria-label="Разделы">
        <SectionCard id="lessons" icon={GraduationCap} title="Уроки" onOpen={() => go({ tab: 'lessons' })}
          detail={started ? `Пройдено ${doneCount} из ${total}` : `${GUIDE_LESSONS.length} ${pluralRu(GUIDE_LESSONS.length, 'короткий урок', 'коротких урока', 'коротких уроков')} для новичка`}>
          <span className="mt-2 flex gap-0.5" aria-hidden="true">
            {Array.from({ length: total }, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < doneCount ? 'bg-white' : 'bg-white/15'}`} />)}
          </span>
        </SectionCard>
        {GUIDE_SHELVES.map((shelf) => {
          const entries = shelfEntries(shelf);
          if (!entries.length) return null;
          return <SectionCard key={shelf.id} id={shelf.id} icon={ICONS[shelf.icon]} title={shelf.title} detail={shelf.summary} onOpen={() => go({ tab: shelf.id })} />;
        })}
      </section>

      {recent && RecentIcon ? (
        <section className="space-y-2">
          <ShelfTitle>Вы недавно открывали</ShelfTitle>
          <button type="button" data-testid="guide-recent" onClick={() => go({ tab: recent.id })} className="flex min-h-[64px] w-full items-center gap-3 rounded-3xl border border-white/10 bg-white/[.045] p-3 pr-2 text-left active:bg-white/[.08]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[.08] text-white/80"><RecentIcon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-[15px] text-white">{recent.title}</strong><span className="mt-0.5 block truncate text-[13px] text-white/55">{findGuideShelf(recent.shelf)?.title}</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
          </button>
        </section>
      ) : null}

      {doneCount < total ? (
        <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[.10] via-white/[.04] to-transparent p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/50"><GraduationCap className="h-4 w-4" />Путь новичка</div>
          <p className="mt-1.5 text-[15px] leading-6 text-white/80">{started ? `Пройдено ${doneCount} из ${total}. Продолжим?` : 'Впервые в мафии? Короткие уроки — и вы готовы к первой игре.'}</p>
          <button type="button" data-testid="guide-continue" onClick={() => (nextLesson >= 0 ? go({ tab: 'lessons', lesson: nextLesson }) : go({ tab: 'quiz' }))}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-4 text-[14px] font-semibold text-black">
            {nextLesson >= 0 ? (started ? `Продолжить: «${GUIDE_LESSONS[nextLesson].title}»` : 'Начать первый урок') : 'Проверить себя'}<ChevronRight className="h-4 w-4" />
          </button>
        </section>
      ) : null}
    </div>
  );
};

const EntryList = ({ shelf, entries, go }: { shelf: GuideShelf; entries: GuideEntry[]; go: (screen: GuideScreen) => void }) => (
  <div className={shelf.layout === 'tiles' ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
    {entries.map((entry) => (shelf.layout === 'tiles'
      ? <Tile key={entry.id} entry={entry} onOpen={() => go({ tab: entry.id })} />
      : <Row key={entry.id} entry={entry} onOpen={() => go({ tab: entry.id })} />))}
  </div>
);

/** One section: its entries, grouped when the catalog gives them a group. */
const SectionScreen = ({ shelf, go }: { shelf: GuideShelf; go: (screen: GuideScreen) => void }) => {
  const entries = shelfEntries(shelf);
  const groups = [...new Set(entries.map((entry) => entry.group || ''))];
  return (
    <div className="space-y-5 pt-2" data-testid={`guide-shelf-${shelf.id}`}>
      <p className="px-1 text-sm leading-6 text-white/65">{shelf.lead}</p>
      {groups.map((group) => (
        <section key={group || 'all'} className="space-y-2">
          {group ? <ShelfTitle>{group}</ShelfTitle> : null}
          <EntryList shelf={shelf} entries={entries.filter((entry) => (entry.group || '') === group)} go={go} />
        </section>
      ))}
    </div>
  );
};

/** At the end of every entry: the rest of its section, so the next trainer or article is one tap away. */
const MoreInSection = ({ entry, go }: { entry: GuideEntry; go: (screen: GuideScreen) => void }) => {
  const shelf = findGuideShelf(entry.shelf);
  const others = shelf ? shelfEntries(shelf).filter((item) => item.id !== entry.id) : [];
  if (!shelf || !others.length) return null;
  return (
    <section className="space-y-2 pt-2" data-testid="guide-more">
      <ShelfTitle>Ещё в разделе «{shelf.title}»</ShelfTitle>
      <div className="space-y-2">{others.map((item) => <Row key={item.id} entry={item} onOpen={() => go({ tab: item.id })} />)}</div>
    </section>
  );
};

/**
 * «Школа мафии» — a public page (no sign-in) to send a novice before the first evening.
 * The home screen leads through the lessons and opens the catalog (src/lib/guideCatalog.ts);
 * every screen has its own address (/guide?tab=rules, /guide?tab=lessons&lesson=2) and the
 * phone's back button (browser or Telegram) returns to the previous screen.
 */
export const PublicGuide: React.FC<{ initialTab?: GuideTab }> = ({ initialTab = 'home' }) => {
  const [screen, setScreen] = useState<GuideScreen>(() => ({
    tab: isGuideScreen(initialTab) ? initialTab : 'home',
    lesson: initialTab === 'lessons' ? lessonFromSearch(typeof window === 'undefined' ? '' : window.location.search) : undefined,
  }));
  const [progress, setProgress] = useState<GuideProgress>(() => (typeof window === 'undefined' ? EMPTY_PROGRESS : readProgress()));
  const [copied, setCopied] = useState(false);
  const depth = useRef(0);

  const updateProgress = useCallback((change: (current: GuideProgress) => GuideProgress) => {
    setProgress((current) => { const next = change(current); writeProgress(next); return next; });
  }, []);

  const go = useCallback((next: GuideScreen) => {
    setScreen(next);
    window.scrollTo?.({ top: 0 });
    try {
      window.history.pushState({ guide: next }, '', screenUrl(next));
      depth.current += 1;
    } catch { /* the page works without updating the address */ }
  }, []);

  // Remember the open entry however it was reached: a tap, a shared link or the back button.
  useEffect(() => {
    if (!findGuideEntry(screen.tab)) return;
    updateProgress((current) => (current.recent === screen.tab ? current : { ...current, recent: screen.tab }));
  }, [screen.tab, updateProgress]);

  const back = useCallback(() => {
    if (depth.current > 0) { window.history.back(); return; }
    // Opened straight on a section (a shared link): go up one level instead of leaving the page.
    const parent = findGuideEntry(screen.tab)?.shelf;
    const up: GuideScreen = screen.tab === 'lessons' && screen.lesson !== undefined ? { tab: 'lessons' } : parent ? { tab: parent } : { tab: 'home' };
    setScreen(up);
    window.scrollTo?.({ top: 0 });
    try { window.history.replaceState({ guide: up }, '', screenUrl(up)); } catch { /* ignore */ }
  }, [screen]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      depth.current = Math.max(0, depth.current - 1);
      const state = (event.state as { guide?: GuideScreen } | null)?.guide;
      setScreen(state || { tab: guideTabFromSearch(window.location.search), lesson: lessonFromSearch(window.location.search) });
      window.scrollTo?.({ top: 0 });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Inside Telegram the native «Назад» button in the header does the same as ours.
  useEffect(() => {
    const button = telegramBackButton();
    if (!button) return undefined;
    if (screen.tab === 'home') { button.hide(); return undefined; }
    button.show();
    button.onClick(back);
    return () => { button.offClick(back); };
  }, [screen.tab, back]);

  const finishLesson = (index: number) => {
    const id = GUIDE_LESSONS[index].id;
    updateProgress((current) => ({ ...current, lessons: current.lessons.includes(id) ? current.lessons : [...current.lessons, id] }));
    go(index === GUIDE_LESSONS.length - 1 ? { tab: 'quiz' } : { tab: 'lessons', lesson: index + 1 });
  };
  const finishQuiz = (score: number) => updateProgress((current) => ({ ...current, quizBest: Math.max(score, current.quizBest ?? 0) }));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/guide`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be unavailable in some webviews */ }
  };

  const home = screen.tab === 'home';
  const lessonOpen = screen.tab === 'lessons' && screen.lesson !== undefined;
  const entry = findGuideEntry(screen.tab);
  const shelf = findGuideShelf(screen.tab);
  const View = entry ? GUIDE_VIEWS[entry.view] : null;
  const title = lessonOpen ? GUIDE_LESSONS[screen.lesson!].title : screen.tab === 'lessons' ? 'Уроки' : shelf?.title || entry?.title || 'Школа мафии';
  // Where this screen lives, shown above the title.
  const place = lessonOpen ? 'Уроки' : entry ? findGuideShelf(entry.shelf)?.title : 'Школа мафии';

  return (
    <main data-testid="public-guide" className="min-h-screen bg-[#090a0d] px-4 pb-10 text-white" style={{ paddingTop: home ? 20 : 0 }}>
      <div className="mx-auto max-w-md space-y-4">
        {home ? (
          <header className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 text-[11px] uppercase tracking-wider text-white/55"><Sparkles className="h-3.5 w-3.5" />2LA Noire · Тула</div>
            <h1 className="mt-3 flex items-center justify-center gap-2 text-2xl font-semibold"><BookOpen className="h-6 w-6 text-white/60" />Школа мафии</h1>
            <p className="mt-1.5 text-[14px] leading-6 text-white/55">Уроки, тренажёры и правила спортивной мафии.</p>
          </header>
        ) : (
          /* Sticks below Telegram's top safe area (header, device cutout). */
          <nav className="sticky z-10 -mx-4 flex min-h-14 items-center gap-1 border-b border-white/[.06] bg-[#090a0d]/95 px-2 backdrop-blur" style={{ top: 'var(--tg-content-safe-area-top, 0px)' }} aria-label="Навигация">
            <button type="button" data-testid="guide-back" onClick={back} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 active:bg-white/10" aria-label="Назад"><ChevronLeft className="h-6 w-6" /></button>
            <div className="min-w-0 flex-1">
              <div data-testid="guide-place" className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">{place}</div>
              <h1 className="truncate text-[17px] font-semibold leading-6">{title}</h1>
            </div>
            <span className="w-11 shrink-0" aria-hidden="true" />
          </nav>
        )}

        {home ? <HomeScreen progress={progress} go={go} /> : null}
        {screen.tab === 'lessons' && !lessonOpen ? (
          <div className="space-y-3 pt-2">
            <p className="px-1 text-sm leading-6 text-white/65">Короткие уроки по материалам памятки. Можно читать в любом порядке, без регистрации.</p>
            <LessonPath progress={progress} onLesson={(lesson) => go({ tab: 'lessons', lesson })} onQuiz={() => go({ tab: 'quiz' })} />
          </div>
        ) : null}
        {lessonOpen ? <div className="pt-2"><LessonScreen key={screen.lesson} index={screen.lesson!} onNext={() => finishLesson(screen.lesson!)} onPrevious={() => (screen.lesson! > 0 ? go({ tab: 'lessons', lesson: screen.lesson! - 1 }) : back())} /></div> : null}
        {shelf ? <SectionScreen shelf={shelf} go={go} /> : null}
        {entry && View ? <div className="pt-2"><View entry={entry} onQuizFinish={finishQuiz} /></div> : null}
        {entry ? <MoreInSection entry={entry} go={go} /> : null}

        {home || entry?.view === 'quiz' ? (
          <section className="rounded-3xl border border-white/10 bg-white/[.045] p-4 text-center">
            <p className="text-[14px] leading-6 text-white/60">Готовы попробовать? Запишитесь на ближайший вечер в кабинете игрока.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href="/player/events" className="flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 text-[14px] font-semibold text-black">Выбрать вечер</a>
              <button type="button" onClick={() => void copyLink()} className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/15 px-3 text-[14px] font-semibold text-white/80">
                {copied ? <><Check className="h-4 w-4" />Скопировано</> : <><Copy className="h-4 w-4" />Ссылка другу</>}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};

export default PublicGuide;
