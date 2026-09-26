import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GuideBlock, ScenarioStep } from '../../../lib/clubGuide.ts';
import { pluralRu } from '../../../lib/guideCatalog.ts';

/** Shared pieces of «Школа мафии»: use them for new lessons, articles and trainers. */

export const BlockBody = ({ block }: { block: GuideBlock }) => (
  <>
    {block.lead ? <p className="text-[14px] leading-6 text-white/70">{block.lead}</p> : null}
    {block.points.length ? <ul className="mt-2 space-y-2">
      {block.points.map((point) => (
        <li key={point} className="flex gap-2.5 text-[14px] leading-6 text-white/75">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" aria-hidden="true" />
          <span>{point}</span>
        </li>
      ))}
    </ul> : null}
  </>
);

/** Consecutive blocks of one `group` become a single topic with sub-headings. */
export const toTopics = (blocks: GuideBlock[]) => blocks.reduce<Array<{ title: string; blocks: GuideBlock[] }>>((topics, block) => {
  const last = topics[topics.length - 1];
  if (block.group && last && last.blocks[0].group === block.group) last.blocks.push(block);
  else topics.push({ title: block.group || block.title, blocks: [block] });
  return topics;
}, []);

/** Topics that open on tap: a long text becomes a short list of headings. */
export const Accordion = ({ blocks, defaultOpen = 0 }: { blocks: GuideBlock[]; defaultOpen?: number | null }) => {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const topics = useMemo(() => toTopics(blocks), [blocks]);
  return (
    <div className="space-y-2">
      {topics.map((topic, index) => {
        const expanded = open === index;
        const grouped = Boolean(topic.blocks[0].group);
        return (
          <section key={topic.title} data-testid="guide-rule" className={`overflow-hidden rounded-3xl border transition-colors ${expanded ? 'border-white/20 bg-white/[.07]' : 'border-white/10 bg-white/[.035]'}`}>
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-5 text-white">{topic.title}</span>
                {grouped && !expanded ? <span className="mt-0.5 block text-[12px] text-white/45">{topic.blocks.length} {pluralRu(topic.blocks.length, 'короткая часть', 'короткие части', 'коротких частей')}</span> : null}
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-white/45 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {expanded ? (
              <div className="space-y-4 px-4 pb-4">
                {topic.blocks.map((block) => (
                  <div key={block.title}>
                    {grouped ? <h3 className="mb-1.5 text-[14px] font-semibold leading-5 text-white/90">{block.title}</h3> : null}
                    <BlockBody block={block} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};

/** An article read top to bottom: headings with their text, no tapping needed. */
export const Article = ({ blocks }: { blocks: GuideBlock[] }) => (
  <article className="space-y-5" data-testid="guide-article">
    {blocks.map((block) => (
      <section key={block.title}>
        <h2 className="mb-1.5 text-[17px] font-semibold leading-6 text-white">{block.title}</h2>
        <BlockBody block={block} />
      </section>
    ))}
  </article>
);

export const Segmented = <T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; testId?: string }>; onChange: (value: T) => void }) => (
  <div className="grid gap-1 rounded-2xl border border-white/10 bg-white/[.04] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => (
      <button key={option.value} type="button" data-testid={option.testId} aria-pressed={value === option.value} onClick={() => onChange(option.value)}
        className={`min-h-11 rounded-xl px-2 text-[13px] font-semibold ${value === option.value ? 'bg-white text-black' : 'text-white/60'}`}>{option.label}</button>
    ))}
  </div>
);

/** Numbered steps joined by a line: an evening, a game, any sequence. */
export const Timeline = ({ steps, startNumber = 1 }: { steps: ScenarioStep[]; startNumber?: number }) => (
  <ol className="relative">
    {steps.map((step, index) => (
      <li key={step.title} data-testid="guide-step" className="relative flex gap-3 pb-5 last:pb-0">
        {index < steps.length - 1 ? <span className="absolute bottom-0 left-4 top-9 w-px bg-white/15" aria-hidden="true" /> : null}
        <span className="relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[14px] font-bold text-black">{startNumber + index}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          {step.when ? <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{step.when}</div> : null}
          <h3 className="text-[16px] font-semibold leading-6 text-white">{step.title}</h3>
          <p className="mt-1 text-[14px] leading-6 text-white/75">{step.text}</p>
          {step.points?.length ? (
            <ul className="mt-2 space-y-1.5 rounded-2xl bg-white/[.04] px-3 py-2.5">
              {step.points.map((point) => <li key={point} className="text-[13.5px] leading-6 text-white/65">— {point}</li>)}
            </ul>
          ) : null}
        </div>
      </li>
    ))}
  </ol>
);

export const ProgressBar = ({ total, done, current }: { total: number; done: number; current?: number }) => (
  <div className="flex gap-1" aria-hidden="true">
    {Array.from({ length: total }, (_, index) => (
      <span key={index} className={`h-1.5 flex-1 rounded-full ${index < done ? 'bg-white' : index === current ? 'bg-white/60' : 'bg-white/15'}`} />
    ))}
  </div>
);
