import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Users } from 'lucide-react';
import {
  TRAINING_PEOPLE, trainingSeatPlacementAllowed, trainingSeatingComplete,
} from '../../lib/judgeTrainingSetup.ts';

type Props = {
  plan: string[];
  onComplete: (lineup: string[]) => void;
  onClose: () => void;
};

/** Uses the real judge's sequential seat-picking workflow, but validates an assigned virtual lineup locally. */
export default function JudgeTrainingSeating({ plan, onComplete, onClose }: Props) {
  const [lineup, setLineup] = useState<string[]>([]);
  const [error, setError] = useState('');
  const options = useMemo(() => [...TRAINING_PEOPLE].sort((a, b) => {
    // A fixed list order distinct from seating order: numbers in participant names are NOT seat numbers.
    return Number(a.slice(6)) % 3 - Number(b.slice(6)) % 3 || a.localeCompare(b, 'ru');
  }), []);
  const expected = plan[lineup.length];
  const complete = trainingSeatingComplete(plan, lineup);

  const select = (player: string) => {
    if (lineup.includes(player)) return;
    if (!trainingSeatPlacementAllowed(plan, lineup, player)) {
      setError('Пока не тот игрок. На место №' + (lineup.length + 1) + ' садится ' + expected + '.');
      return;
    }
    setLineup((old) => [...old, player]);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[135] overflow-y-auto bg-[#090a0d] p-3 pb-[max(2rem,env(safe-area-inset-bottom))] text-white" data-testid="judge-training-seating">
      <div className="mx-auto max-w-lg space-y-3">
        <header className="flex items-center gap-3 py-2">
          <button type="button" onClick={onClose} aria-label="Выйти из тренажёра" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10"><ChevronLeft className="h-5 w-5"/></button>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] text-amber-200/70">Задание 1 · рассадка</div>
            <h1 className="text-xl font-semibold">Подготовь стол</h1>
          </div>
          <span className="ml-auto rounded-xl bg-white/[.07] px-3 py-2 text-sm font-semibold">{lineup.length}/10</span>
        </header>

        <section className="rounded-2xl border border-amber-200/25 bg-amber-200/[.065] px-4 py-3" data-testid="judge-training-seat-task">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-200"><Users className="h-4 w-4"/> ЗАДАНИЕ · РАССАДКА</div>
          <div className="text-lg font-semibold" aria-live="polite">{complete ? 'Все 10 игроков на своих местах!' : expected + ' садится за место №' + (lineup.length + 1)}</div>
          <p className="mt-1 text-xs leading-5 text-white/55">{complete ? 'Проверь состав и переходи к раздаче ролей.' : 'Выбери этого игрока из списка ниже. Игроки будут садиться по одному, в порядке мест №1–10.'}</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <div className="mb-3 text-xs font-semibold text-white/60">Рассадка за игровым столом</div>
          <div className="grid grid-cols-5 gap-1.5">
            {plan.map((_, index) => {
              const player = lineup[index];
              return (
                <button key={index} type="button" onClick={() => {
                  if (index < lineup.length) { setLineup((old) => old.slice(0, index)); setError(''); }
                }} disabled={!player} className={'min-h-[68px] min-w-0 rounded-xl border p-1 text-center ' + (player ? 'border-emerald-300/20 bg-emerald-300/[.06]' : index === lineup.length ? 'border-amber-200/55 bg-amber-200/[.07]' : 'border-white/10 bg-black/20')}>
                  <div className="text-[10px] text-white/45">#{index + 1}</div>
                  <div className="mt-2 truncate text-[10px] font-semibold text-white">{player || '—'}</div>
                  {player && <Check className="mx-auto mt-1 h-3 w-3 text-emerald-200/70"/>}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-white/40">Как в настоящей судейской: порядок выбора определяет номер места. Нажми заполненное место, чтобы исправить рассадку с него.</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <h2 className="mb-3 text-xs font-semibold text-white/60">Игроки, которые пришли на вечер</h2>
          <div className="grid grid-cols-2 gap-2">
            {options.map((player) => {
              const placed = lineup.indexOf(player);
              return <button key={player} type="button" onClick={() => select(player)} disabled={placed >= 0} className={'flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-medium ' + (placed >= 0 ? 'border-emerald-200/15 bg-emerald-300/[.05] text-white/40' : 'border-white/10 bg-black/30 text-white')}>
                <span>{player}</span><span className="shrink-0 text-xs text-amber-200/75">{placed >= 0 ? '#' + (placed + 1) : '+'}</span>
              </button>;
            })}
          </div>
          {error && <p className="mt-3 rounded-xl bg-rose-400/[.08] px-3 py-2 text-xs text-rose-200" role="alert">{error}</p>}
        </section>

        <button type="button" disabled={!complete} onClick={() => onComplete(lineup)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black disabled:bg-white/[.06] disabled:text-white/30" data-testid="judge-training-seat-finish">
          Рассадка готова · к раздаче ролей <ArrowRight className="h-4 w-4"/>
        </button>
      </div>
    </div>
  );
}
