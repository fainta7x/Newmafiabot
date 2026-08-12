import React, { useEffect, useMemo, useState } from 'react';

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

type PulseHighlight = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  type: 'win_streak' | 'hot_form' | string;
  value: number;
  text: string;
};

type PowerEntry = {
  place: number;
  player_id: string;
  nickname: string;
  avatar_url: string;
  elo: number;
  games: number;
  wins: number;
  win_rate: number;
  last5_wins: number;
  streak: number;
  score: number;
  movement: number | null;
};

type PulseData = {
  viewer_id: string;
  highlights: PulseHighlight[];
  power_ranking: PowerEntry[];
  players_with_form: number;
  meta?: { formula?: string };
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

const movementLabel = (value: number | null) => {
  if (value == null) return 'NEW';
  if (value > 0) return `▲${value}`;
  if (value < 0) return `▼${Math.abs(value)}`;
  return '—';
};

export default function PlayerFormCenter({ games }: { games: FormGame[] }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'mine' | 'club'>('mine');
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const form = useMemo(() => games
    .filter((game) => game.status === 'completed' && typeof game.won === 'boolean')
    .slice(0, 10), [games]);

  useEffect(() => {
    if (!open || section !== 'club' || pulse !== null) return;
    let cancelled = false;
    setPulseLoading(true);
    setPulseError(null);
    void fetch('/api/player/pulse', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить пульс клуба');
        if (!cancelled) setPulse(body as PulseData);
      })
      .catch((error: any) => {
        if (!cancelled) setPulseError(error?.message || 'Не удалось загрузить пульс клуба');
      })
      .finally(() => {
        if (!cancelled) setPulseLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, section, pulse]);

  const wins = form.filter((game) => game.won).length;
  const firstResult = form[0]?.won;
  let streak = 0;
  for (const game of form) {
    if (game.won !== firstResult) break;
    streak += 1;
  }
  const streakText = !form.length
    ? 'Сыграй первую завершённую игру — здесь появится форма.'
    : streak >= 2
      ? `${streak} ${firstResult ? 'победы' : 'поражения'} подряд`
      : firstResult ? 'последняя — победа' : 'последняя — поражение';

  return (
    <>
      <button
        type="button"
        onClick={() => { if (!form.length) setSection('club'); setOpen(true); }}
        className="fixed bottom-[104px] left-3 z-40 flex min-h-9 max-w-[58vw] items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1c21]/95 px-3 py-2 text-left shadow-xl backdrop-blur"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{form.length ? 'Форма' : 'Пульс'}</span>
        {form.length ? <>
          <span className="flex min-w-0 items-center gap-1">
            {form.slice(0, 5).map((game, index) => (
              <span key={`${game.id}:${index}`} className={`h-2 w-2 shrink-0 rounded-full ${game.won ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            ))}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-white/70">{wins}/{form.length}</span>
        </> : <span className="text-sm">🔥</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Форма и пульс клуба"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[86dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">2LA Noire</div>
                <h2 className="mt-1 text-xl font-semibold">Форма и пульс</h2>
                <p className="mt-1 text-xs text-white/40">Личные результаты и кто сейчас набрал ход в клубе.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
              <button type="button" onClick={() => setSection('mine')} className={`min-h-10 rounded-xl text-xs font-semibold ${section === 'mine' ? 'bg-white text-black' : 'text-white/45'}`}>Моя форма</button>
              <button type="button" onClick={() => setSection('club')} className={`min-h-10 rounded-xl text-xs font-semibold ${section === 'club' ? 'bg-white text-black' : 'text-white/45'}`}>Пульс клуба</button>
            </div>

            {section === 'mine' ? (
              form.length ? <>
                <div className="mt-4 rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Последние {form.length} игр</div>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <div><div className="text-3xl font-black">{wins}<span className="text-white/25">/{form.length}</span></div><div className="mt-1 text-[11px] text-white/35">{streakText}</div></div>
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
              </> : <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center"><div className="text-2xl">🎭</div><div className="mt-2 text-sm font-semibold">Личная форма ещё не началась</div><p className="mt-1 text-xs text-white/35">После первой завершённой игры здесь появятся результаты и серии.</p><button type="button" onClick={() => setSection('club')} className="mt-4 min-h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black">Смотреть пульс клуба</button></div>
            ) : (
              <div className="mt-4">
                {pulseError && <div className="rounded-2xl bg-rose-400/10 px-3 py-3 text-xs text-rose-200/70">{pulseError}</div>}
                {pulseLoading && !pulse ? <div className="rounded-2xl bg-white/[0.04] px-3 py-6 text-center text-xs text-white/35">Считаем форму клуба…</div> : null}
                {pulse ? (
                  <>
                    <div className="rounded-[22px] border border-amber-300/10 bg-amber-300/[0.04] p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/55">🔥 Кто сейчас в огне</div>
                      {pulse.highlights.length ? <div className="mt-3 space-y-2">{pulse.highlights.map((item) => (
                        <div key={`${item.player_id}:${item.type}`} className="flex items-center gap-3 rounded-2xl bg-black/20 p-2.5">
                          <img src={item.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.nickname}</div><div className="mt-0.5 text-[11px] text-amber-100/55">{item.text}</div></div>
                          <span className="text-lg">{item.type === 'win_streak' ? '🔥' : '⚡'}</span>
                        </div>
                      ))}</div> : <p className="mt-3 text-xs text-white/35">Пока никто не собрал серию — самое время начать.</p>}
                    </div>

                    <div className="mt-4">
                      <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Power Ranking</div><div className="mt-1 text-sm font-semibold">Кто сильнее всех выглядит прямо сейчас</div></div><div className="text-[10px] text-white/25">{pulse.players_with_form} в форме</div></div>
                      <div className="mt-3 space-y-1.5">
                        {pulse.power_ranking.slice(0, 10).map((item) => (
                          <div key={item.player_id} className={`flex items-center gap-2.5 rounded-2xl border px-2.5 py-2.5 ${item.player_id === pulse.viewer_id ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.04] bg-white/[0.035]'}`}>
                            <div className="w-6 shrink-0 text-center text-sm font-black text-white/40">{item.place}</div>
                            <img src={item.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.nickname}{item.player_id === pulse.viewer_id ? ' · вы' : ''}</div><div className="mt-0.5 text-[10px] text-white/30">{item.wins}/{item.games} · {item.win_rate}%{item.streak >= 2 ? ` · серия ${item.streak}` : ''}</div></div>
                            <div className="shrink-0 text-right"><div className="text-xs font-black">{item.score}</div><div className={`text-[9px] font-semibold ${item.movement != null && item.movement > 0 ? 'text-emerald-300' : item.movement != null && item.movement < 0 ? 'text-rose-300' : 'text-white/25'}`}>{movementLabel(item.movement)}</div></div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10px] leading-4 text-white/25">{pulse.meta?.formula || 'Power Ranking — развлекательный рейтинг текущей формы и не заменяет официальный Elo.'}</p>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
