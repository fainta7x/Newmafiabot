import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { GUIDE_ENTRIES, GUIDE_LESSONS, GUIDE_SHELVES } from '../../lib/guideCatalog.ts';

/**
 * «Обучение» inside «Прогресс» (owner decision 2026-10-06): the same content as the «Школа мафии»
 * page (/guide, src/lib/guideCatalog.ts). New lessons, articles and trainers appear here by themselves.
 */
const lessonHref = (index: number) => `/guide?tab=lessons&lesson=${index + 1}`;

export default function PlayerLearningBlock() {
  return (
    <div className="space-y-4" data-testid="player-learning">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-white/60" aria-hidden="true" />Путь новичка</div>
        <p className="mt-1 text-xs leading-5 text-white/50">Короткие уроки по порядку: как пройдёт вечер, роли, день и ночь, правила за столом.</p>
        <ol className="mt-3 space-y-2">
          {GUIDE_LESSONS.map((lesson, index) => (
            <li key={lesson.id}>
              <a href={lessonHref(index)} className="flex min-h-12 items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 active:bg-white/[0.08]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{lesson.title}</span><span className="block text-xs text-white/45">{lesson.description}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </section>

      {GUIDE_SHELVES.map((shelf) => {
        const entries = GUIDE_ENTRIES.filter((entry) => entry.shelf === shelf.id);
        if (!entries.length) return null;
        return (
          <section key={shelf.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-white/60" aria-hidden="true" />{shelf.title}</div>
            <p className="mt-1 text-xs leading-5 text-white/50">{shelf.lead}</p>
            <div className="mt-3 space-y-2">
              {entries.map((entry) => (
                <a key={entry.id} href={`/guide?tab=${encodeURIComponent(entry.id)}`} className="flex min-h-12 items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 active:bg-white/[0.08]">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{entry.title}</span><span className="block text-xs text-white/45">{entry.detail}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
