import { useState } from 'react';
import { ArrowRight, BookOpenCheck, Gavel, ShieldCheck, Shuffle } from 'lucide-react';
import JudgeTestGameModal from '../player/JudgeTestGameModal.tsx';

/** Public judge practice. The live-game sandbox does not write to the club database. */
export default function JudgeConductTraining() {
  const [playing, setPlaying] = useState(false);
  const [lastResult, setLastResult] = useState<'completed' | 'exited' | null>(null);

  if (playing) {
    return (
      <JudgeTestGameModal
        judge={{ id: 'judge-training-visitor', nickname: 'Ученик' }}
        training
        onClose={(completed) => {
          setLastResult(completed ? 'completed' : 'exited');
          setPlaying(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-3 pb-8" data-testid="judge-conduct-training">
      <div className="rounded-[26px] border border-amber-300/20 bg-gradient-to-br from-amber-200/[.11] via-white/[.035] to-white/[.02] p-5">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-amber-100/20 bg-amber-100/10 text-amber-100">
          <Gavel className="h-6 w-6" />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-100/60">Интерактивный тренажёр</div>
        <h2 className="mt-1 text-[23px] font-semibold leading-7 text-white">Проведи свою первую игру</h2>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Ты — судья. Десять виртуальных игроков будут произносить речи, выставлять кандидатов, голосовать и играть ночью.
          Сначала проведи рассадку и раздачу ролей по заданиям, затем записывай их действия в настоящем Live Game Engine.
        </p>
        <button type="button" onClick={() => setPlaying(true)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-black active:bg-amber-100" data-testid="judge-trainer-start">
          Начать учебную партию <ArrowRight className="h-4 w-4" />
        </button>
        {lastResult && <p className="mt-3 text-center text-xs text-emerald-200/80">{lastResult === 'completed' ? 'Учебная партия завершена. Можно попробовать ещё раз.' : 'Тренировка прервана. Ты можешь начать заново.'}</p>}
      </div>
      <div className="grid gap-2">
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <BookOpenCheck className="mt-1 h-5 w-5 shrink-0 text-amber-200/70" />
          <div>
            <div className="text-sm font-semibold">Рассадка, роли и знакомство</div>
            <p className="mt-1 text-xs leading-5 text-white/50">Посади каждого виртуального игрока на указанное место и раздай заданные роли. Затем познакомься с подсвеченными кнопками интерфейса.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <Shuffle className="mt-1 h-5 w-5 shrink-0 text-amber-200/70" />
          <div>
            <div className="text-sm font-semibold">Затем обычная игра</div>
            <p className="mt-1 text-xs leading-5 text-white/50">Например: «Игрок #2 выставляет #1». Выполни выставление, заверши речь и получи следующее событие.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-200/70" />
          <div>
            <div className="text-sm font-semibold">Без последствий для клуба</div>
            <p className="mt-1 text-xs leading-5 text-white/50">Игра и протокол учебные. Они не попадут в результаты клуба и рейтинги. Подсказку можно свернуть.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
