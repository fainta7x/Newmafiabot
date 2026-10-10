import { ArrowRight, BookOpen, BookOpenCheck, ChevronRight, GraduationCap, Gavel, LibraryBig } from 'lucide-react';

/** Learning lives in Progress; the public guide is the one canonical content source. */
const guideLink = (tab: string) => `/guide?from=progress&tab=${encodeURIComponent(tab)}`;

export default function PlayerLearningBlock() {
  return (
    <div className="space-y-4" data-testid="player-learning">
      <section className="rounded-[24px] border border-amber-200/20 bg-gradient-to-br from-amber-200/[.09] via-white/[.04] to-transparent p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-amber-100/75">
          <GraduationCap className="h-4 w-4" /> Обучение
        </div>
        <h2 className="mt-2 text-xl font-semibold">Осваивай мафию в своём темпе</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">Правила и уроки для новичков, тренажёры для игроков и практика ведения клуба — всё в одном месте.</p>
        <a href={guideLink('quiz')} data-testid="player-learning-reasoning" className="mt-4 flex min-h-[74px] items-center gap-3 rounded-2xl border border-amber-100/25 bg-[#211e19] p-3 text-left">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-200"><Brain className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Школа игрового мышления</strong><span className="mt-1 block text-xs text-white/55">Пять ступеней: логика, мотивация, чёрные тройки</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-100/60" />
        </a>
        <a href={guideLink('judge-conduct')} data-testid="player-learning-judge"
          className="mt-4 flex min-h-[66px] items-center gap-3 rounded-2xl border border-amber-100/15 bg-[#1c1b18] p-3 text-left">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-200"><Gavel className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Тренажёр судьи</strong><span className="mt-1 block text-xs text-white/55">Рассадка, роли, нулевая ночь и первый круг</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-100/60" />
        </a>
      </section>

      <section className="space-y-2" aria-label="Разделы обучения">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[.13em] text-white/45">Выбери направление</h3>
        {[
          { id:'lessons', title:'Уроки', detail:'Первые шаги, роли и ход игры', Icon:BookOpenCheck },
          { id:'trainers', title:'Тренажёры', detail:'Логика, попил, голосование и судейство', Icon:BookOpen },
          { id:'reference', title:'Правила и справочник', detail:'Все игровые правила и термины', Icon:LibraryBig },
        ].map(({ id, title, detail, Icon })=>
          <a key={id} href={guideLink(id)} data-testid={`player-learning-section-${id}`}
            className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 text-left active:bg-white/[.07]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.065] text-white/65"><Icon className="h-5 w-5"/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">{title}</strong><span className="mt-1 block text-xs text-white/50">{detail}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/35"/>
          </a>
        )}
      </section>
    </div>
  );
}
