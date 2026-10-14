import { GOMAFIA_NOMINATIONS, classifyGoMafiaTournamentSize, type GoMafiaNominationKey } from '../../lib/gomafiaCareer.ts';
import { useEffect, useState } from 'react';

type Linked = {
  external_player_id: string;
  profile_url: string;
  status: 'pending' | 'verified';
  updated_at: string;
};
/** The player types only the number after «/stats/»; a whole pasted link is cut down to that number. */
export const goMafiaIdFromInput = (value: string) => {
  const raw = value.trim();
  if (/[/.:]/.test(raw)) return raw.match(/stats\/(\d{1,12})/)?.[1] ?? raw.replace(/\D/g, '').slice(0, 12);
  return raw.replace(/\D/g, '').slice(0, 12);
};

export default function PlayerGoMafiaLink({ playerId, isSelf, organizer = false }: { playerId: string; isSelf: boolean; organizer?: boolean }) {
  const [link, setLink] = useState<Linked | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [career, setCareer] = useState<any>(null);
  const [year, setYear] = useState('all');
  const [sizeGroup, setSizeGroup] = useState<'large' | 'ten' | 'other' | 'unknown'>('large');
  useEffect(() => {
    const abort = new AbortController();
    setLink(null);
    setCareer(null);
    setYear('all');
    fetch(`/api/player/gomafia/players/${encodeURIComponent(playerId)}`, { credentials: 'include', signal: abort.signal })
      .then(async res => { if (!res.ok) throw new Error('Не удалось загрузить связь GoMafia'); return res.json(); })
      .then(body => { if (!abort.signal.aborted) setLink(body.link ?? null); })
      .catch(() => { /* External profile link is optional; do not block a player's profile. */ });
    return () => abort.abort();
  }, [playerId]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const loadCareer = async () => {
      try {
        const response = await fetch('/api/player/gomafia/players/' + encodeURIComponent(playerId) + '/career',
          { credentials: 'include', signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        setCareer(data);
        if (data?.syncing && Date.now() - started < 10 * 60 * 1000) timer = setTimeout(() => void loadCareer(), 5000);
      } catch { /* External data never blocks the club profile. */ }
    };
    void loadCareer();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [playerId, link?.external_player_id, link?.status]);
  const stat = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
  const snap = year === 'all' ? career?.snapshot : career?.yearly_stats?.find((s: any) => String(s.year) === year);
  const years = [...new Set<number>([...(career?.yearly_stats ?? []).map((s: any) => Number(s.year)), ...(career?.tournaments ?? []).map((t: any) => Number(t.dateStart?.slice(0,4)))])].filter(Number.isFinite).sort((a,b)=>b-a);
  const tournaments = (career?.tournaments ?? []).filter((t: any) => year === 'all' || t.dateStart?.startsWith(year));
  // Final standings of the selected year: how many tournaments, the average and the best place (smaller is better).
  const groups = [
    { key: 'large' as const, title: 'Большие турниры', hint: 'Больше 10 участников' },
    { key: 'ten' as const, title: 'Турниры на 10', hint: 'Ровно 10 участников' },
    { key: 'other' as const, title: 'Малые турниры', hint: 'Меньше 10 участников' },
    { key: 'unknown' as const, title: 'Размер не подтверждён', hint: 'Данных об участниках пока нет' },
  ].map(group => ({ ...group, entries: tournaments.filter((item: any) => classifyGoMafiaTournamentSize(item.participantCount) === group.key) }));
  const visibleGroup = groups.find(group => group.key === sizeGroup) ?? groups[0];
  const displayed = visibleGroup.entries;
  const places: number[] = displayed.map((t: any) => Number(t.place)).filter((place: number) => Number.isInteger(place) && place > 0);
  const averagePlace = places.length ? places.reduce((sum, place) => sum + place, 0) / places.length : null;
  const bestPlace = places.length ? Math.min(...places) : null;
  const playedGames = displayed.flatMap((t: any) => Array.isArray(t.games) ? t.games : []);
  const resolvedGames = playedGames.filter((game: any) => game.result === 'win' || game.result === 'loss');
  const wins = resolvedGames.filter((game: any) => game.result === 'win').length;
  const winRate = resolvedGames.length ? Math.round(wins * 1000 / resolvedGames.length) / 10 : null;
  const statPeriod = typeof snap?.year === 'number' ? `За ${snap.year} год` : snap?.tournamentFilter === 'Все турниры' ? 'За всё время' : 'Период источника не определён';
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(organizer ? `/api/player/gomafia/organizer/${encodeURIComponent(playerId)}` : '/api/player/gomafia/me', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: input.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось привязать GoMafia');
      setLink(body.link);
      setInput('');
      setMessage(body.link?.status === 'verified' ? 'Привязка подтверждена. Карьера подтянется автоматически.' : 'Запрос отправлен организатору — он получит уведомление и подтвердит привязку.');
    } catch (error: any) {
      setMessage(String(error?.message || 'Ошибка сохранения'));
    } finally {
      setBusy(false);
    }
  };
  return <section data-testid="player-gomafia-link" className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><strong className="text-sm">Спортивная карьера</strong>
        <p className="mt-1 text-xs text-white/55">{link
          ? link.status === 'verified' ? 'Привязка подтверждена' : 'Ожидает подтверждения организатора'
          : 'Профиль пока не привязан'}</p></div>
      {link && <a className="text-xs text-amber-200 underline" href={link.profile_url} target="_blank" rel="noopener noreferrer">Открыть ↗</a>}
    </div>
    {(isSelf || organizer) && <div className="mt-3 space-y-2">
      <label htmlFor="gomafia-player-url" className="block text-xs text-white/70">{organizer ? 'ID этого игрока на GoMafia' : 'Твой ID на GoMafia'}</label>
      <div className="flex min-h-11 w-full items-stretch overflow-hidden rounded-xl border border-white/15 bg-white/[.07] focus-within:border-amber-200/60">
        <span className="flex shrink-0 items-center bg-black/25 px-3 text-sm text-white/45">gomafia.pro/stats/</span>
        <input id="gomafia-player-url" value={input} onChange={e => setInput(goMafiaIdFromInput(e.target.value))} inputMode="numeric" autoComplete="off"
          placeholder="1202"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none" />
      </div>
      <p className="text-[11px] leading-4 text-white/40">Это число в конце адреса твоего профиля на gomafia.pro, например для gomafia.pro/stats/1202 пиши 1202. Целую ссылку тоже можно вставить, число возьмём сами.</p>
      <button type="button" onClick={() => void save()} disabled={busy || !input.trim()}
        className="min-h-11 rounded-xl bg-amber-200 px-4 text-sm font-semibold text-black disabled:opacity-50">
        {busy ? 'Сохраняем…' : link ? 'Обновить привязку' : 'Привязать GoMafia'}
      </button>
      {message && <p role="status" className="text-xs text-white/70">{message}</p>}
    </div>}
    {years.length > 0 && <label className="mt-4 block text-xs text-white/70">Период спортивной карьеры
      <select aria-label="Год спортивной карьеры" value={year} onChange={e => setYear(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm text-white">
        <option value="all">За всё время</option>
        {years.map(value => <option key={value} value={String(value)}>{value}</option>)}
      </select>
    </label>}
    {snap && <div data-testid="gomafia-federation-stats" className="mt-3 space-y-2">
      <p className="text-xs text-amber-100/80">{statPeriod} · {snap.gameFilter || 'Режим игр неизвестен'} · {snap.tournamentFilter || 'Турниры не уточнены'}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{stat(snap.overallElo)}</strong><div className="text-xs text-white/55">Elo сейчас</div></div>
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{stat(snap.totalGames)}</strong><div className="text-xs text-white/55">Игры</div></div>
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{snap.overallWinRatePercent == null ? '—' : String(snap.overallWinRatePercent) + '%'}</strong><div className="text-xs text-white/55">Винрейт</div></div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-white/65">
        <span>Мирный: {stat(snap.roleGames?.citizen)}</span><span>Шериф: {stat(snap.roleGames?.sheriff)}</span>
        <span>Мафия: {stat(snap.roleGames?.mafia)}</span><span>Дон: {stat(snap.roleGames?.don)}</span>
      </div>
      <p className="text-xs text-white/45">Данные GoMafia · Обновлено {new Date(snap.retrievedAt).toLocaleDateString('ru-RU')}</p>
    </div>}
    {year !== 'all' && !snap && <p className="mt-2 text-xs text-white/50">Статистика за {year} год пока недоступна. Турнирная история показана по опубликованным датам.</p>}
    {career?.syncing && <p role="status" className="mt-3 text-xs text-white/60">Автоматически обновляем спортивную карьеру…</p>}
    {tournaments.length > 0 && <div className="mt-5 space-y-3" data-testid="gomafia-size-breakdown">
      <div><strong className="text-sm text-white">Турниры по размеру</strong><p className="mt-1 text-xs text-white/55">Группы не смешиваются в статистике. Учитывается только подтверждённое число участников.</p></div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Размер турнира">
        {groups.map(group => <button key={group.key} type="button" onClick={() => setSizeGroup(group.key)} aria-pressed={sizeGroup === group.key} className={`min-h-[64px] rounded-xl border px-3 py-2 text-left transition-colors ${sizeGroup === group.key ? 'border-amber-200/50 bg-amber-200/10' : 'border-white/10 bg-white/[.035]'}`}>
          <span className="block text-xs font-semibold text-white/90">{group.title}</span>
          <span className="mt-1 block text-xs text-white/55">{group.entries.length} турн.</span>
        </button>)}
      </div>
      <p className="text-xs text-white/45">{visibleGroup.hint}</p>
      <div data-testid="gomafia-places-summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ['Турниры', displayed.length], ['Игры', playedGames.length],
          ['Винрейт', winRate == null ? '—' : winRate.toLocaleString('ru-RU') + '%'],
          ['Среднее место', averagePlace == null ? '—' : averagePlace.toLocaleString('ru-RU', { maximumFractionDigits: 1 })],
          ['Лучшее место', bestPlace ?? '—'],
        ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-white/[.06] p-3"><strong className="text-lg text-white">{value}</strong><div className="mt-1 text-xs text-white/55">{label}</div></div>)}
      </div>
    </div>}
    {tournaments.length > 0 && <div data-testid="gomafia-tournament-appearances" className="mt-4 space-y-3">
      <strong className="block text-sm">Турнирные выступления · {displayed.length}</strong>
      {displayed.length === 0 && <p className="rounded-xl bg-white/[.04] p-4 text-xs text-white/60">В этой категории пока нет подтверждённых турниров.</p>}
      {displayed.map((item: any) => <article key={item.tournamentId} className="rounded-xl bg-white/[.045] p-3">
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-words text-sm font-medium text-amber-100">{item.tournamentName} ↗</a>
        <div className="mt-1 text-xs text-white/55">{item.dateStart} — {item.dateEnd} · {item.location}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
          <span>{({ registered: 'Регистрация', upcoming: 'Предстоящий турнир', completed: 'Турнир завершён', results_published: 'Результат опубликован', unknown: 'Статус не подтверждён' } as Record<string,string>)[item.status]}</span>
          {item.participantCount != null && <span>Участников: {item.participantCount}</span>}
          {item.place != null && <span>Место: {item.place}</span>}
          <span>{item.totalScore == null ? 'Баллы недоступны' : stat(item.totalScore) + ' баллов'}</span>
          {item.eloDelta != null && <span>Δ Elo: {item.eloDelta > 0 ? '+' : ''}{stat(item.eloDelta)}</span>}
          {item.eloAfter != null && <span>Elo после турнира: {stat(item.eloAfter)}</span>}
        </div>
        {item.nominationsStatus !== 'hidden' && (item.status === 'results_published' || item.status === 'completed') && item.nominations?.filter((entry:any)=>entry.rank===1).map((entry:any)=><div data-testid="gomafia-nomination" key={entry.key} className="mt-2 text-xs text-amber-100">Номинация: {GOMAFIA_NOMINATIONS[entry.key as GoMafiaNominationKey]}</div>)}
        {item.nominationsStatus === 'unavailable' && <p className="mt-1 text-[11px] text-white/45">{item.nominations?.length ? 'Номинации из сохранённых данных' : 'Номинации пока недоступны'}</p>}
        {item.nominationsStatus === 'hidden' && <p className="mt-1 text-[11px] text-white/45">Номинации скрыты источником</p>}
        {item.scoreStatus === 'refresh_failed'  && item.totalScore != null && <p className="mt-1 text-[11px] text-white/45">Баллы из сохранённого результата · {item.scoreRetrievedAt ? new Date(item.scoreRetrievedAt).toLocaleDateString('ru-RU') : 'дата обновления неизвестна'}</p>}
        {item.games?.length > 0 && <details className="mt-3 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 text-white/70">Игры · {item.games.length}</summary>
          <div className="space-y-2">{item.games.map((game: any) => <div key={game.externalGameId} className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-2">
            <span>№{game.gameNumber} · {({ citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' } as Record<string,string>)[game.role] || 'Роль неизвестна'} · Место {game.seat ?? '—'}</span>
            <span className={game.result === 'win' ? 'text-emerald-200' : 'text-white/55'}>{game.result === 'win' ? 'Победа' : game.result === 'loss' ? 'Поражение' : 'Результат неизвестен'} · Elo {game.eloDelta == null ? '—' : (game.eloDelta > 0 ? '+' : '') + stat(game.eloDelta)}</span>
            <span className="text-white/65">Баллы: {stat(game.score)}</span>
          </div>)}</div>
        </details>}
      </article>)}
    </div>}
    {career?.status === 'verified' && <details className="mt-3 text-xs text-white/50">
      <summary className="min-h-11 cursor-pointer py-3">Доступность данных и регистраций</summary>
      {(career?.limitations?.length ? career.limitations : ['Первоначальный импорт выполняется автоматически после подтверждения привязки. Будущие регистрации пока недоступны в подтверждённом публичном источнике.']).map((text: string) => <p key={text} className="mb-2">{text}</p>)}
    </details>}
    {career?.error && <p className="mt-2 text-xs text-amber-100">{career.error}</p>}
    <p className="mt-2 text-[11px] text-white/40">Турнирные протоколы доступны по ссылке GoMafia. Клубная статистика 2LA Noire считается отдельно.</p>
  </section>;
}
