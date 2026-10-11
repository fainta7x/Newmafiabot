import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, RotateCcw, ClipboardCheck } from 'lucide-react';
import {
  CHECK_CRITERIA, diagnosticForAttempt,
} from '../../../lib/mafiaReasoningDiagnostic.ts';
import { reportLearningActivity } from '../../../lib/learningActivityClient.ts';

type Reflection = {
  observed: string;
  alternatives: string;
  refutation: string;
  submitted: boolean;
  checks: (boolean | null)[];
};
type DiagnosticState = { attempt: number; index: number; entries: Record<string, Reflection> };
const storageItem = 'mafia-reasoning-diagnostic-v1';
const fresh = (): Reflection => ({ observed: '', alternatives: '', refutation: '', submitted: false, checks: [null, null, null] });
const initial = (): DiagnosticState => {
  try {
    const input = JSON.parse(window.localStorage.getItem(storageItem) || '{}') as Partial<DiagnosticState>;
    const attempt = Number.isSafeInteger(input.attempt) && input.attempt! >= 0 && input.attempt! <= 10000 ? input.attempt! : 0;
    const cases = diagnosticForAttempt(attempt);
    const index = Number.isInteger(input.index) && input.index! >= 0 && input.index! <= cases.length ? input.index! : 0;
    const entries: Record<string, Reflection> = {};
    for (const item of cases) {
      const value = input.entries?.[item.id];
      if (!value || typeof value !== 'object') continue;
      const observed = typeof value.observed === 'string' ? value.observed.slice(0, 450) : '';
      const alternatives = typeof value.alternatives === 'string' ? value.alternatives.slice(0, 450) : '';
      const refutation = typeof value.refutation === 'string' ? value.refutation.slice(0, 450) : '';
      const submitted = value.submitted === true &&
        [observed, alternatives, refutation].every((item) => item.trim().length >= 8);
      entries[item.id] = { observed, alternatives, refutation, submitted,
        checks: submitted && Array.isArray(value.checks)
          ? CHECK_CRITERIA.map((_, i) => typeof value.checks[i] === 'boolean' ? value.checks[i] : null)
          : [null, null, null],
      };
    }
    return { attempt, index, entries };
  } catch { return { attempt: 0, index: 0, entries: {} }; }
};

export default function MafiaReasoningDiagnostic({ onBack }: { onBack: () => void }) {
  const [progress, setProgress] = useState<DiagnosticState>(initial);
  const batch = diagnosticForAttempt(progress.attempt);
  const finished = progress.index === batch.length;
  const item = finished ? null : batch[progress.index];
  const current = item ? (progress.entries[item.id] || fresh()) : null;
  const ready = current && [current.observed, current.alternatives, current.refutation]
    .every((value) => value.trim().length >= 8);
  const checked = current?.checks.every((value) => value !== null);
  const completed = batch.map((part) => progress.entries[part.id]).filter(Boolean);
  const positive = completed.reduce((sum, entry) => sum + entry.checks.filter((mark) => mark === true).length, 0);

  useEffect(() => {
    try { window.localStorage.setItem(storageItem, JSON.stringify(progress)); } catch { /* browser storage optional */ }
  }, [progress]);

  const edit = (field: 'observed' | 'alternatives' | 'refutation', value: string) => {
    if (!item || current?.submitted) return;
    setProgress((prev) => ({
      ...prev, entries: { ...prev.entries,
        [item.id]: { ...(prev.entries[item.id] || fresh()), [field]: value.slice(0, 450) },
      },
    }));
  };
  const submit = () => {
    if (!item || !ready) return;
    setProgress((prev) => ({ ...prev, entries: {
      ...prev.entries, [item.id]: { ...(prev.entries[item.id] || fresh()), submitted: true },
    } }));
  };
  const mark = (index: number, value: boolean) => {
    if (!item || !current?.submitted) return;
    setProgress((prev) => {
      const entry = prev.entries[item.id] || fresh();
      const checks = [...entry.checks]; checks[index] = value;
      return { ...prev, entries: { ...prev.entries, [item.id]: { ...entry, checks } } };
    });
  };
  const next = () => {
    if (!checked || !current?.submitted) return;
    // The last situation checked finishes one self-check (no pass mark: it counts as done, with the matched criteria as the score).
    if (progress.index + 1 === batch.length) reportLearningActivity({ track: 'reasoning-extra', item: 'diagnostic', score: positive, maxScore: batch.length * CHECK_CRITERIA.length, passed: true });
    setProgress((prev) => ({ ...prev, index: Math.min(batch.length, prev.index + 1) }));
  };
  const restart = () => setProgress((prev) => ({ attempt: prev.attempt + 1, index: 0, entries: {} }));
  return <section data-testid="reasoning-diagnostic" className="space-y-4">
    <header className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 rounded-xl border border-white/15 px-3 text-sm">
        <ChevronLeft className="h-4 w-4" /> Упражнения
      </button>
      <div>
        <p className="text-[11px] text-white/50">Без готовых вариантов</p>
        <h3 className="text-lg font-semibold">Проверка мышления</h3>
      </div>
    </header>
    {finished ? <div data-testid="reasoning-diagnostic-result" className="space-y-3">
      <div className="rounded-2xl border border-white/15 bg-white/[.04] p-4 space-y-2">
        <ClipboardCheck className="h-6 w-6 text-amber-100" />
        <p className="text-xl font-semibold">Разобрано {batch.length} ситуации</p>
        <p className="text-[13px] text-white/75">Совпало с критериями: {positive} из {batch.length * CHECK_CRITERIA.length}</p>
        <p className="text-[12px] text-white/55">Это самостоятельная оценка объяснений, а не экзамен с автоматической проверкой и наградами.</p>
      </div>
      {CHECK_CRITERIA.map((criterion, index) => {
        const total = completed.filter((entry) => entry.checks[index] === true).length;
        return <div key={index} className="rounded-xl bg-white/[.04] p-3 text-[13px]">
          <p>{criterion}</p>
          <p className="mt-1 text-white/55">{total} из {batch.length}</p>
        </div>;
      })}
      <button type="button" onClick={restart} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-black">
        <RotateCcw className="h-4 w-4" /> Другие ситуации
      </button>
    </div> : item && current ? <div data-testid="reasoning-diagnostic-task" className="space-y-4">
      <div className="flex items-center justify-between text-[12px] text-white/55">
        <span>Ситуация {progress.index + 1} из {batch.length}</span>
        <span>Свой разбор</span>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">{batch.map((_, index) =>
        <span key={index} className={`h-1.5 flex-1 rounded-full ${index < progress.index ? 'bg-emerald-300' : index === progress.index ? 'bg-amber-200' : 'bg-white/15'}`} />)}</div>
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[.04] p-3">
        <h4 className="text-base font-semibold">{item.title}</h4>
        {item.facts.map((fact, index) => <p key={index} className="text-[13px] leading-5 text-white/80">{fact}</p>)}
        <p className="text-[12px] text-amber-100/75">{item.task}</p>
      </div>
      <p className="text-[13px] text-white/65">Сначала самостоятельный ответ. Образец откроется после всех трёх полей.</p>
      {([
        ['observed', 'Что точно произошло?', 'Только факты, без предположений о роли'],
        ['alternatives', 'Какие есть объяснения?', 'Как минимум две разные версии или стратегии'],
        ['refutation', 'Как проверить свою версию?', 'Что могло бы её ослабить?'],
      ] as const).map(([field, label, placeholder]) =>
        <label key={field} className="block space-y-1">
          <span className="text-[13px] font-medium">{label}</span>
          <textarea disabled={current.submitted} value={current[field]} rows={3}
            data-testid={`reasoning-diagnostic-${field}`}
            onChange={(event) => edit(field, event.target.value)}
            placeholder={placeholder}
            className="w-full resize-y rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-[13px] leading-5 text-white placeholder:text-white/35 disabled:opacity-70" />
        </label>)}
      {!current.submitted ? <button type="button" onClick={submit} disabled={!ready}
        data-testid="reasoning-diagnostic-submit"
        className="min-h-12 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
        Сравнить с разбором
      </button> : <div data-testid="reasoning-diagnostic-reference" className="space-y-3 rounded-2xl border border-amber-200/20 bg-amber-200/[.03] p-3">
        <h4 className="text-sm font-semibold">Образец рассуждения</h4>
        {item.reference.map((reference, index) =>
          <div key={index} className="text-[13px] leading-5">
            <p className="font-medium text-white/85">{['Факт', 'Альтернативы', 'Как проверить'][index]}</p>
            <p className="mt-1 text-white/65">{reference}</p>
          </div>)}
        <div className="space-y-3 border-t border-white/10 pt-3">
          <p className="text-[13px] font-semibold">Самопроверка: получилось ли в своём ответе?</p>
          {CHECK_CRITERIA.map((criterion, index) =>
            <div key={index} className="space-y-2">
              <p className="text-[12px] text-white/80">{criterion}</p>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((value) =>
                  <button key={String(value)} type="button" onClick={() => mark(index, value)}
                    data-testid={`reasoning-diagnostic-mark-${index}-${value}`}
                    aria-pressed={current.checks[index] === value}
                    className={`min-h-10 rounded-xl border text-[12px] ${current.checks[index] === value ? 'border-amber-200 bg-amber-200/15 text-amber-100' : 'border-white/15 text-white/70'}`}>
                    {value ? 'Получилось' : 'Пока нет'}
                  </button>)}
              </div>
            </div>)}
        </div>
        <button type="button" disabled={!checked} onClick={next} data-testid="reasoning-diagnostic-next"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
          {progress.index === batch.length - 1 ? 'Посмотреть итог' : 'Следующая ситуация'} <ArrowRight className="h-4 w-4" />
        </button>
      </div>}
    </div> : null}
  </section>;
}
