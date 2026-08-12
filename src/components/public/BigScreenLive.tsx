import React, { useEffect, useState } from 'react';

type LivePayload =
  | { mode: 'live'; generated_at: string; evening: any; safety?: string }
  | { mode: 'recap'; generated_at: string; evening: any }
  | { mode: 'idle'; generated_at: string; next_evening: any | null };

const dateTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
};

export default function BigScreenLive() {
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const response = await fetch('/api/public/live', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('live');
      setData(await response.json() as LivePayload);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data && !error) return <main className="grid min-h-screen place-items-center bg-[#07080b] text-white"><div className="text-center"><div className="text-5xl">🎭</div><div className="mt-4 text-sm uppercase tracking-[0.3em] text-white/30">2LA Noire</div></div></main>;
  if (error && !data) return <main className="grid min-h-screen place-items-center bg-[#07080b] px-6 text-white"><div className="text-center"><div className="text-5xl">🎭</div><h1 className="mt-5 text-3xl font-black">2LA Noire</h1><p className="mt-2 text-white/35">Live-экран временно не получил данные. Обновление продолжится автоматически.</p></div></main>;

  if (data?.mode === 'live') {
    const evening = data.evening;
    return <main className="min-h-screen overflow-hidden bg-[#07080b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-[4vw] py-[4vh]">
        <header className="flex items-start justify-between gap-8"><div><div className="text-[clamp(12px,1.1vw,20px)] font-semibold uppercase tracking-[0.28em] text-white/30">2LA Noire · LIVE</div><h1 className="mt-2 text-[clamp(34px,4vw,76px)] font-black leading-none">{evening.title}</h1><div className="mt-3 text-[clamp(14px,1.2vw,24px)] text-white/35">{dateTime(evening.starts_at)}{evening.venue ? ` · ${evening.venue}` : ''}</div></div><div className="rounded-full border border-rose-400/30 bg-rose-400/10 px-5 py-2 text-[clamp(12px,1vw,18px)] font-black tracking-[0.16em] text-rose-200">● В ЭФИРЕ</div></header>

        <section className="mt-[5vh] grid grid-cols-[1fr_auto_1fr] items-center gap-[3vw] text-center"><div><div className="text-[clamp(18px,1.7vw,30px)] uppercase tracking-[0.2em] text-rose-300/55">Красные</div><div className="mt-2 text-[clamp(96px,13vw,230px)] font-black leading-none text-rose-300">{evening.score.red}</div></div><div className="text-[clamp(50px,5vw,100px)] font-light text-white/15">:</div><div><div className="text-[clamp(18px,1.7vw,30px)] uppercase tracking-[0.2em] text-white/45">Чёрные</div><div className="mt-2 text-[clamp(96px,13vw,230px)] font-black leading-none">{evening.score.black}</div></div></section>

        <div className="mt-auto grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-[32px] border border-white/[0.07] bg-white/[0.035] p-[clamp(20px,2.2vw,38px)]"><div className="flex items-center justify-between gap-4"><div><div className="text-[clamp(12px,1vw,18px)] font-semibold uppercase tracking-[0.18em] text-white/30">Текущая игра</div><div className="mt-1 text-[clamp(26px,2.3vw,44px)] font-black">{evening.current_game ? `Игра №${evening.current_game.game_number}` : 'Между играми'}</div></div><div className="text-right text-[clamp(12px,1vw,18px)] text-white/30">{evening.completed_games} завершено<br />{evening.attended} игроков сегодня</div></div>
            {evening.current_game?.players?.length ? <div className="mt-5 grid grid-cols-5 gap-2">{evening.current_game.players.map((player: any) => <div key={`${player.seat_number}:${player.nickname}`} className="rounded-2xl bg-black/20 px-2 py-3 text-center"><div className="text-[clamp(10px,.8vw,14px)] text-white/25">#{player.seat_number}</div><div className="mt-1 truncate text-[clamp(13px,1vw,18px)] font-bold">{player.nickname}</div></div>)}</div> : <div className="mt-5 rounded-2xl bg-black/15 px-4 py-7 text-center text-[clamp(14px,1vw,18px)] text-white/30">Следующая десятка появится здесь после создания игры.</div>}
          </section>

          <section className="rounded-[32px] border border-white/[0.07] bg-white/[0.035] p-[clamp(20px,2.2vw,38px)]"><div className="text-[clamp(12px,1vw,18px)] font-semibold uppercase tracking-[0.18em] text-white/30">Последние результаты</div><div className="mt-4 space-y-2">{evening.recent_results?.length ? evening.recent_results.map((result: any) => <div key={result.game_key} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3"><span className="text-[clamp(13px,1vw,18px)] text-white/45">Игра {result.local_number}</span><span className={`text-[clamp(14px,1.1vw,20px)] font-black ${result.winner_team === 'red' ? 'text-rose-300' : 'text-white'}`}>{result.winner_team === 'red' ? '🔴 Красные' : '⚫ Чёрные'}</span></div>) : <div className="text-white/25">Результатов пока нет</div>}</div></section>
        </div>
      </div>
    </main>;
  }

  if (data?.mode === 'recap') {
    const evening = data.evening;
    return <main className="grid min-h-screen place-items-center bg-[#07080b] px-[5vw] py-[5vh] text-white"><div className="w-full max-w-[1200px] text-center"><div className="text-[clamp(12px,1vw,18px)] font-semibold uppercase tracking-[0.3em] text-white/30">2LA Noire · вечер завершён</div><h1 className="mt-4 text-[clamp(38px,5vw,80px)] font-black">{evening.title}</h1><div className="mt-2 text-[clamp(14px,1.2vw,22px)] text-white/30">{dateTime(evening.starts_at)}{evening.venue ? ` · ${evening.venue}` : ''}</div>
      <div className="mx-auto mt-[6vh] grid max-w-[850px] grid-cols-[1fr_auto_1fr] items-center gap-6"><div><div className="text-[clamp(16px,1.5vw,28px)] text-rose-300/55">КРАСНЫЕ</div><div className="text-[clamp(90px,13vw,210px)] font-black leading-none text-rose-300">{evening.score.red}</div></div><div className="text-[clamp(45px,5vw,80px)] text-white/15">:</div><div><div className="text-[clamp(16px,1.5vw,28px)] text-white/45">ЧЁРНЫЕ</div><div className="text-[clamp(90px,13vw,210px)] font-black leading-none">{evening.score.black}</div></div></div>
      <div className="mx-auto mt-[5vh] grid max-w-[900px] gap-4 sm:grid-cols-3"><div className="rounded-[28px] bg-white/[0.04] p-5"><div className="text-4xl font-black">{evening.games}</div><div className="mt-1 text-sm text-white/30">игр</div></div><div className="rounded-[28px] bg-white/[0.04] p-5"><div className="text-4xl font-black">{evening.attended}</div><div className="mt-1 text-sm text-white/30">игроков</div></div>{evening.player_of_evening ? <div className="rounded-[28px] border border-amber-200/10 bg-amber-200/[0.04] p-5"><div className="text-xs uppercase tracking-[0.15em] text-amber-100/40">👑 Игрок вечера</div><div className="mt-2 truncate text-2xl font-black">{evening.player_of_evening.nickname}</div><div className="mt-1 text-sm text-white/30">{evening.player_of_evening.wins}/{evening.player_of_evening.games} побед · {evening.player_of_evening.win_rate}%</div></div> : <div className="rounded-[28px] bg-white/[0.04] p-5"><div className="text-3xl">🎭</div><div className="mt-2 text-sm text-white/30">До следующего вечера</div></div>}</div>
      <div className="mt-[5vh] text-[clamp(14px,1.1vw,20px)] font-semibold uppercase tracking-[0.22em] text-white/20">Спасибо за игру · 2LA Noire</div></div></main>;
  }

  const next = data?.mode === 'idle' ? data.next_evening : null;
  return <main className="grid min-h-screen place-items-center bg-[#07080b] px-6 text-white"><div className="max-w-3xl text-center"><div className="text-7xl">🎭</div><div className="mt-6 text-sm font-semibold uppercase tracking-[0.34em] text-white/25">2LA Noire</div><h1 className="mt-4 text-[clamp(42px,7vw,100px)] font-black leading-none">SPORT MAFIA</h1>{next ? <div className="mt-8 rounded-[28px] border border-white/[0.07] bg-white/[0.035] px-8 py-6"><div className="text-xs uppercase tracking-[0.16em] text-white/25">Следующий вечер</div><div className="mt-2 text-2xl font-black">{next.title}</div><div className="mt-2 text-white/35">{dateTime(next.starts_at)}{next.venue ? ` · ${next.venue}` : ''}</div></div> : <p className="mt-6 text-xl text-white/30">Следующий вечер скоро появится в расписании.</p>}</div></main>;
}
