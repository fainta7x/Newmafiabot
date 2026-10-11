import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, EyeOff, Trophy } from 'lucide-react';
import PlayerTournamentEveningDetail from './PlayerTournamentEveningDetail.tsx';

type Phase = 'registration' | 'registration_closed' | 'live' | 'finished';
type ViewData = {
  tournament: { id: string; title: string; date: string | null; venue: string | null; stage: string | null; phase: Phase; judge: string | null; organizer: string | null; entry_fee_rub: number; prize_fund_rub: number; games_planned: number; games_completed: number };
  registration: { capacity: number; confirmed_count: number; reserve_count: number; open: boolean; mine: { status: string; slot: number | null } | null; participated: boolean };
  roster: Array<{ number: number; nickname: string; is_me: boolean }>;
  games: Array<{ game_number: number; status: string; winner_team: string | null; judge: string | null; seats: Array<{ seat: number; nickname: string; role: string | null; is_me: boolean }> }>;
  table_hidden: boolean;
  provisional: boolean;
  standings: Array<{ place: number; nickname: string; is_me: boolean; games_played: number; wins: number; total_points: number; additional_total: number }> | null;
  nominations: Array<{ category: string; title: string; has_tie: boolean; leader: { nickname: string; points: number } | null; candidates: Array<{ nickname: string; points: number }> }> | null;
};
type Section = 'roster' | 'games' | 'results';

const PHASE_LABEL: Record<Phase, string> = { registration: 'Идёт регистрация', registration_closed: 'Регистрация закрыта', live: 'Турнир идёт', finished: 'Завершён' };
const ROLE_LABEL: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const GAME_STATUS: Record<string, string> = { planned: 'Ожидает', active: 'Идёт', completed: 'Завершена' };
const WINNER: Record<string, string> = { red: 'Победили красные', black: 'Победили чёрные' };
const POLL_MS = 15_000;

const dateText = (value: string | null) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'Дата не указана';
};
const points = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/**
 * One tournament for any player, whether he plays it or not (owner, 2026-10-06): registration, roster, games with roles after
 * each game, and the live table and nominations — unless the organizer closed the table («Закрытие таблицы»).
 */
export default function PlayerTournamentView({ tournamentId, onBack }: { tournamentId: string; onBack: () => void }) {
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section | null>(null);
  const [registering, setRegistering] = useState(false);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);

  const load = async () => {
    const seq = ++requestSeq.current;
    try {
      const response = await fetch(`/api/player/tournaments/${encodeURIComponent(tournamentId)}`, { credentials: 'include' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) throw new Error(body?.error || 'Не удалось загрузить турнир');
      // An older answer never replaces a newer one.
      if (seq > appliedSeq.current) { appliedSeq.current = seq; setData(body); setError(''); }
    } catch (reason: any) {
      if (seq > appliedSeq.current) setError(reason?.message || 'Не удалось загрузить турнир');
    }
  };

  useEffect(() => { void load(); }, [tournamentId]);
  const live = data?.tournament.phase === 'live';
  useEffect(() => {
    if (!live) return undefined;
    // Live follow: the table and games refresh by themselves while the tournament is played and the screen is visible.
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, tournamentId]);

  if (registering) return <PlayerTournamentEveningDetail tournamentId={tournamentId} onBack={() => { setRegistering(false); void load(); }} onSaved={() => void load()} />;

  const phase = data?.tournament.phase;
  const current: Section = section || (phase === 'live' || phase === 'finished' ? 'results' : 'roster');
  const SECTIONS: Array<{ id: Section; label: string }> = [{ id: 'roster', label: 'Состав' }, { id: 'games', label: 'Игры' }, { id: 'results', label: 'Итоги' }];

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white" data-testid="player-tournament-view">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 text-[13px] font-semibold text-white/60"><ArrowLeft className="h-4 w-4" /> Турниры</button>
        {error ? <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-3 text-sm text-rose-100">{error}<button type="button" onClick={() => void load()} className="mt-2 block min-h-11 w-full rounded-xl bg-white/[0.08] text-[13px] font-bold text-white">Повторить</button></div> : null}
        {!data && !error ? <div role="status" className="rounded-2xl bg-white/[0.035] p-5 text-sm text-white/55">Загружаем турнир…</div> : null}
        {data ? <>
          <section className="rounded-[24px] border border-violet-200/10 bg-gradient-to-br from-violet-400/[0.10] to-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${phase === 'live' ? 'bg-emerald-400/15 text-emerald-200' : phase === 'finished' ? 'bg-white/10 text-white/70' : 'bg-violet-300/15 text-violet-100'}`}>{PHASE_LABEL[data.tournament.phase]}</span>
              <span className="text-[12px] text-white/50">{data.tournament.games_completed} из {data.tournament.games_planned || data.games.length} игр</span>
            </div>
            <h1 className="mt-2 text-xl font-black leading-tight">{data.tournament.title}</h1>
            <p className="mt-1 text-[13px] text-white/60">{dateText(data.tournament.date)}{data.tournament.venue ? ` · ${data.tournament.venue}` : ''}</p>
            {data.tournament.judge || data.tournament.organizer ? <p className="mt-2 text-[12px] text-white/45">{[data.tournament.judge ? `Судья: ${data.tournament.judge}` : '', data.tournament.organizer ? `Организатор: ${data.tournament.organizer}` : ''].filter(Boolean).join(' · ')}</p> : null}
          </section>

          <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3.5" data-testid="player-tournament-registration">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">Регистрация</div>
            <p className="mt-1.5 text-[14px] text-white/80">
              Играют: {data.registration.confirmed_count} из {data.registration.capacity}{data.registration.reserve_count ? ` · резерв: ${data.registration.reserve_count}` : ''}
            </p>
            <p className="mt-1 text-[13px] text-white/55">
              {data.registration.participated ? 'Играю в этом турнире.'
                : data.registration.mine?.status === 'confirmed' ? 'Запись есть, место подтверждено.'
                : data.registration.mine?.status === 'reserve' ? 'В резерве.'
                : data.registration.open ? 'Ответа пока нет.' : 'Участия в турнире нет, но следить за ним можно.'}
            </p>
            {data.registration.open ? <button type="button" onClick={() => setRegistering(true)} data-testid="player-tournament-register" className="mt-3 min-h-11 w-full rounded-xl bg-violet-500 px-3 text-[14px] font-bold text-white">Моя регистрация и оплата</button> : null}
          </section>

          <div role="tablist" aria-label="Разделы турнира" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1">
            {SECTIONS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={current === item.id} onClick={() => setSection(item.id)} data-testid={`player-tournament-tab-${item.id}`}
                className={`min-h-11 rounded-xl text-[14px] font-bold ${current === item.id ? 'bg-white text-black' : 'text-white/60'}`}>{item.label}</button>
            ))}
          </div>

          {current === 'roster' ? (
            <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3.5" data-testid="player-tournament-roster">
              {data.roster.length === 0 ? <p className="text-[13px] text-white/50">Состав ещё не набран.</p> : (
                <ol className="space-y-1.5">
                  {data.roster.map((item) => (
                    <li key={`${item.number}-${item.nickname}`} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 ${item.is_me ? 'bg-violet-400/15' : 'bg-white/[0.03]'}`}>
                      <span className="w-6 text-[13px] font-bold text-white/40">{item.number}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{item.nickname}</span>
                      {item.is_me ? <span className="text-[12px] font-bold text-violet-200">это я</span> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          {current === 'games' ? (
            <section className="space-y-2" data-testid="player-tournament-games">
              {data.games.length === 0 ? <p className="rounded-[20px] bg-white/[0.035] p-3.5 text-[13px] text-white/50">Игры ещё не созданы.</p> : data.games.map((game) => (
                <details key={game.game_number} open={game.status === 'active'} className="rounded-[20px] border border-white/10 bg-white/[0.035]">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3.5 py-2">
                    <span className="text-[14px] font-bold">Игра {game.game_number}</span>
                    <span className="text-[12px] text-white/55">{game.status === 'completed' && game.winner_team ? WINNER[game.winner_team] || GAME_STATUS.completed : GAME_STATUS[game.status] || game.status}</span>
                  </summary>
                  <div className="border-t border-white/10 px-3.5 py-3">
                    {game.judge ? <p className="mb-2 text-[12px] text-white/45">Судья: {game.judge}</p> : null}
                    {game.seats.length === 0 ? <p className="text-[13px] text-white/50">Рассадка ещё не готова.</p> : (
                      <ul className="grid grid-cols-1 gap-1">
                        {game.seats.map((seat) => (
                          <li key={seat.seat} className={`flex min-h-10 items-center gap-3 rounded-lg px-2.5 ${seat.is_me ? 'bg-violet-400/15' : 'bg-white/[0.03]'}`}>
                            <span className="w-5 text-[12px] font-bold text-white/40">{seat.seat}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{seat.nickname}</span>
                            {seat.role ? <span className={`text-[12px] font-semibold ${seat.role === 'mafia' || seat.role === 'don' ? 'text-rose-200' : 'text-sky-200'}`}>{ROLE_LABEL[seat.role] || seat.role}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {game.status !== 'completed' && game.seats.length ? <p className="mt-2 text-[12px] text-white/40">Роли откроются после игры.</p> : null}
                  </div>
                </details>
              ))}
            </section>
          ) : null}

          {current === 'results' ? (
            data.table_hidden ? (
              <section className="rounded-[20px] border border-amber-200/15 bg-amber-200/[0.06] p-4" data-testid="player-tournament-table-hidden">
                <div className="flex items-center gap-2 text-[14px] font-bold text-amber-100"><EyeOff className="h-4 w-4" /> Таблица закрыта</div>
                <p className="mt-1.5 text-[13px] leading-5 text-amber-50/70">Организатор закрыл таблицу и номинации перед последними играми. Они откроются к финалу.</p>
              </section>
            ) : data.standings === null ? (
              <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4 text-[13px] leading-5 text-white/55">Таблица появится, когда начнётся турнир.</section>
            ) : (
              <>
                <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3.5" data-testid="player-tournament-standings">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">Таблица</div>
                    {data.provisional ? <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[12px] font-bold text-amber-100">промежуточная</span> : null}
                  </div>
                  {data.standings.length === 0 ? <p className="mt-2 text-[13px] text-white/50">Пока нет сыгранных игр.</p> : (
                    <ol className="mt-2 space-y-1">
                      {data.standings.map((row) => (
                        <li key={`${row.place}-${row.nickname}`} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 ${row.is_me ? 'bg-violet-400/15' : 'bg-white/[0.03]'}`}>
                          <span className="w-6 text-[14px] font-black text-amber-200">{row.place}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{row.nickname}</span><span className="block text-[12px] text-white/45">игр: {row.games_played} · побед: {row.wins}</span></span>
                          <span className="text-right"><span className="block text-[15px] font-bold">{points(row.total_points)}</span><span className="block text-[12px] text-white/45">доп. {points(row.additional_total)}</span></span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                {data.nominations && data.nominations.length ? (
                  <section className="space-y-2" data-testid="player-tournament-nominations">
                    <div className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">Номинации{data.provisional ? ' · промежуточные' : ''}</div>
                    {data.nominations.map((item) => (
                      <div key={item.category} className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3.5">
                        <div className="flex items-center gap-2 text-[14px] font-bold"><Trophy className="h-4 w-4 text-amber-200" />{item.title}</div>
                        {item.candidates.length === 0 ? <p className="mt-1.5 text-[13px] text-white/50">Пока никто не претендует.</p> : (
                          <ol className="mt-2 space-y-1">
                            {item.candidates.map((candidate, index) => (
                              <li key={`${item.category}-${candidate.nickname}`} className="flex min-h-10 items-center gap-3 rounded-lg bg-white/[0.03] px-2.5">
                                <span className="w-5 text-[13px] font-bold text-white/40">{index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-[13px]">{candidate.nickname}</span>
                                <span className="text-[13px] font-semibold">{points(candidate.points)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {item.has_tie ? <p className="mt-1.5 text-[12px] text-amber-100/70">Есть равенство, решит организатор.</p> : null}
                      </div>
                    ))}
                  </section>
                ) : null}
              </>
            )
          ) : null}
        </> : null}
      </div>
    </main>
  );
}
