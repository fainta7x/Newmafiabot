import React, { useMemo, useState } from 'react';

type FormGame = {
  id: string;
  title?: string | null;
  date?: string | null;
  status?: string | null;
  won?: boolean | null;
  role?: string | null;
  game_number?: number | null;
  source?: string | null;
};

const roleLabel = (role: string | null | undefined) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return role || 'Роль не указана';
};

const shortDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
};

export default function PlayerFormCenter({ games }: { games: FormGame[] }) {
  const [open, setOpen] = useState(false);
  const form = useMemo(() => games
    .filter((game) => game.status === 'completed' && typeof game.won === 'boolean')
    .slice(0, 10), [games]);

  if (!form.length) return null;

  const wins = form.filter((game) => game.won).length;
  const firstResult = form[0]?.won;
  let streak = 0;
  for (const game of form) {
    if (game.won !== firstResult) break;
    streak += 1;
  }
  const streakText = streak >= 2
    ? `${streak} ${firstResult ? 'победы' : 'поражения'} подряд`
    : firstResult ? 'последняя — победа' : 'последняя — поражение';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[104px] left-3 z-40 flex min-h-9 max-w-[58vw] items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1c21]/95 px-3 py-2 text-left shadow-xl backdrop-blur"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">Форма</span>
        <span className="flex min-w-0 items-center gap-1">
          {form.slice(0, 5).map((game, index) => (
            <span key={`${game.id}:${index}`} className={`h-2 w-2 shrink-0 rounded-full ${game.won ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          ))}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-white/70">{wins}/{form.length}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Форма игрока"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[82dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Последние {form.length} игр</div>
                <h2 className="mt-1 text-xl font-semibold">Текущая форма</h2>
                <p className="mt-1 text-xs text-white/40">{streakText}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
              <div className="flex items-end justify-between gap-4">
                <div><div className="text-3xl font-black">{wins}<span className="text-white/25">/{form.length}</span></div><div className="mt-1 text-[11px] text-white/35">побед в последних играх</div></div>
                <div className="text-right"><div className="text-2xl font-semibold">{Math.round((wins / form.length) * 100)}%</div><div className="mt-1 text-[10px] text-white/30">винрейт формы</div></div>
              </div>
              <div className="mt-4 flex gap-1.5">
                {form.map((game, index) => (
                  <div key={`${game.id}:bar:${index}`} className={`h-3 flex-1 rounded-full ${game.won ? 'bg-emerald-400' : 'bg-rose-400'}`} title={game.won ? 'Победа' : 'Поражение'} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-white/25"><span>сейчас</span><span>раньше</span></div>
            </div>

            <div className="mt-4 space-y-1.5">
              {form.map((game, index) => (
                <div key={`${game.id}:row:${index}`} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm ${game.won ? 'bg-emerald-400/12 text-emerald-300' : 'bg-rose-400/12 text-rose-300'}`}>{game.won ? '✓' : '×'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{game.title || 'Игра 2LA Noire'}</div>
                    <div className="mt-0.5 truncate text-[10px] text-white/30">{[shortDate(game.date), game.game_number ? `игра ${game.game_number}` : null, roleLabel(game.role)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold ${game.won ? 'text-emerald-300' : 'text-rose-300'}`}>{game.won ? 'Победа' : 'Поражение'}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
