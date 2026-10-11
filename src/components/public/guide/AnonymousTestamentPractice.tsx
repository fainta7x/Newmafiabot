import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, RefreshCw } from 'lucide-react';
import {
  STRENGTH_OPTIONS, type TestamentExercise, type TestamentStrength,
} from '../../../lib/anonymousTestamentTraining.ts';

const storageItem = 'mafia-anonymous-testament-v1';
const loadSaved = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(storageItem) || '{}');
    return {
      attempt: Number.isSafeInteger(v.attempt) && v.attempt >= 0 && v.attempt <= 10000 ? v.attempt : 0,
      index: Number.isSafeInteger(v.index) && v.index >= 0 && v.index <= 100 ? v.index : 0,
    };
  } catch { return { attempt: 0, index: 0 }; }
};

/** Fully automated scenarios. The suggested speech is an EXERCISE, not a historical quotation. */
export default function AnonymousTestamentPractice({ onBack }: { onBack: () => void }) {
  const [position, setPosition] = useState(loadSaved);
  const [cases, setCases] = useState<TestamentExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TestamentStrength | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reloadSerial, setReloadSerial] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/learning/anonymous-testaments?attempt=' + position.attempt, {credentials:'same-origin'})
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Не удалось загрузить задания');
        return result;
      })
      .then((data) => {
        if (!active) return;
        setCases(Array.isArray(data.cases) ? data.cases : []);
        setLoading(false);
      })
      .catch((err) => { if (active) { setError(err instanceof Error ? err.message : 'Ошибка сети'); setLoading(false); } });
    return () => { active = false; };
  }, [position.attempt, reloadSerial]);

  const index = cases.length ? position.index % cases.length : 0;
  const current = cases[index];
  const next = () => {
    setSelected(null); setRevealed(false);
    const nextIndex = index + 1;
    const nextPosition = nextIndex >= cases.length
      ? { attempt: position.attempt + 1, index: 0 }
      : { ...position, index: nextIndex };
    setPosition(nextPosition);
    try { window.localStorage.setItem(storageItem, JSON.stringify(nextPosition)); } catch { /* optional */ }
  };

  return <section data-testid="anonymous-testament-practice" className="space-y-3">
    <header className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 rounded-xl border border-white/15 px-3 text-[13px]">
        <ChevronLeft className="h-4 w-4"/>Упражнения
      </button>
      <div>
        <p className="text-[11px] text-white/45">Учимся взвешивать аргументы</p>
        <h3 className="text-lg font-semibold">Сила завещания</h3>
      </div>
    </header>
    <p className="text-[12px] leading-5 text-white/60">Все реплики составлены для тренировки, а не записаны со слов реальных игроков. В основе части заданий — обезличенные события клубных партий.</p>
    {loading ? <p className="text-[13px] text-white/60">Подбираем ситуации…</p> :
      error ? <div className="space-y-2">
        <p role="alert" className="text-[13px] text-rose-200">{error}</p>
        <button type="button" onClick={() => setReloadSerial((n) => n + 1)}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-[13px]">
          <RefreshCw className="h-4 w-4"/>Повторить
        </button>
      </div> : current ? <div className="space-y-3" data-testid="anonymous-testament-case">
        <div className="text-[12px] text-white/45">Ситуация {index+1} из {cases.length}</div>
        <div className="space-y-2 rounded-2xl border border-white/15 bg-white/[.04] p-3">
          <h4 className="text-[15px] font-semibold">{current.title}</h4>
          {current.facts.map((fact, i) => <p key={i} className="text-[13px] leading-5 text-white/70">{fact}</p>)}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-100/70">Учебная реплика завещания</p>
          <p className="text-[14px] leading-6 text-white">{current.teachingWill}</p>
        </div>
        <p className="text-[14px] font-semibold">Насколько обоснован вывод о чёрном цвете?</p>
        <div className="space-y-2">
          {STRENGTH_OPTIONS.map((option) => {
            const correct = option.id === current.strength;
            return <button key={option.id} type="button"
              data-testid={'testament-answer-' + option.id}
              aria-pressed={selected===option.id}
              disabled={revealed}
              onClick={() => setSelected(option.id)}
              className={`min-h-12 w-full rounded-xl border p-3 text-left text-[13px] leading-5 ${revealed && correct
                ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-100'
                : selected===option.id ? 'border-white/70 bg-white/10' : 'border-white/15 bg-white/[.035]'}`}>
              {option.label}
            </button>;
          })}
        </div>
        {!revealed ? <button type="button" disabled={!selected} onClick={() => setRevealed(true)}
          data-testid="testament-check"
          className="min-h-12 w-full rounded-xl bg-white px-3 text-[13px] font-semibold text-black disabled:opacity-40">
          Проверить ответ
        </button> : <div data-testid="testament-explanation" className="space-y-2 rounded-2xl border border-amber-200/20 bg-amber-200/[.035] p-3">
          <p className="text-[14px] font-semibold">{selected === current.strength ? 'Хороший разбор' : 'Разберём точнее'}</p>
          <p className="text-[13px] leading-5 text-white/80">{current.explanation}</p>
          <p className="text-[12px] font-semibold text-amber-100/80">Как использовать завещание</p>
          <p className="text-[13px] leading-5 text-white/70">{current.nextStep}</p>
          <button type="button" onClick={next}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-[13px]">
            {index + 1 >= cases.length ? 'Другие ситуации' : 'Следующая ситуация'}
            <ArrowRight className="h-4 w-4"/>
          </button>
        </div>}
      </div> : <p className="text-[13px] text-white/60">Нет доступных заданий.</p>}
  </section>;
}
