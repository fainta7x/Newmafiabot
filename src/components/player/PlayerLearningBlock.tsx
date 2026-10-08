import { ArrowUpRight, BookOpen, ChevronRight, GraduationCap } from 'lucide-react';

/** Legacy profile «Обучение» links to the one canonical School, not a second catalog. */
export default function PlayerLearningBlock() {
  return (
    <section className="space-y-3" data-testid="player-learning">
      <div className="rounded-[24px] border border-amber-200/20 bg-gradient-to-br from-amber-200/[.10] to-white/[.025] p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-amber-100/70">
          <GraduationCap className="h-4 w-4" /> Школа мафии
        </div>
        <h2 className="mt-2 text-xl font-semibold">Учись играть и вести игры</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Все уроки, правила и тренажёры находятся в отдельном разделе «Школа».
          Его можно открыть в любой момент через нижнее меню кабинета.
        </p>
        <a href="/guide?from=progress" data-testid="profile-open-school"
          className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-[#111114]">
          Открыть Школу <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      <a href="/guide?from=progress&tab=trainers" className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-4">
        <BookOpen className="h-5 w-5 shrink-0 text-white/55" />
        <span className="min-w-0 flex-1"><strong className="block text-sm">Сразу к тренажёрам</strong><span className="mt-1 block text-xs text-white/45">Попил, судейство, проверка знаний</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/45" />
      </a>
    </section>
  );
}
