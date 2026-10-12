import { useEffect, useState } from 'react';

type Linked = {
  external_player_id: string;
  profile_url: string;
  status: 'pending' | 'verified';
  updated_at: string;
};
export default function PlayerGoMafiaLink({ playerId, isSelf, organizer = false }: { playerId: string; isSelf: boolean; organizer?: boolean }) {
  const [link, setLink] = useState<Linked | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [career, setCareer] = useState<any>(null);
  const [year, setYear] = useState('all');
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
  const tournaments = (career?.tournaments ?? []).filter((t: any) => year === 'all' || t.dateStart?.startsWith(year));
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
      setMessage(organizer ? 'Привязка подтверждена организатором.' : 'Ссылка сохранена. Организатор сможет подтвердить привязку.');
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
      <label htmlFor="gomafia-player-url" className="block text-xs text-white/70">{organizer ? 'Ссылка GoMafia этого игрока или ID' : 'Ссылка на свой профиль GoMafia или его ID'}</label>
      <input id="gomafia-player-url" value={input} onChange={e => setInput(e.target.value)}
        placeholder="https://gomafia.pro/stats/123"
        className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[.07] px-3 text-sm text-white" />
      <button type="button" onClick={() => void save()} disabled={busy || !input.trim()}
        className="min-h-11 rounded-xl bg-amber-200 px-4 text-sm font-semibold text-black disabled:opacity-50">
        {busy ? 'Сохраняем…' : link ? 'Обновить привязку' : 'Привязать GoMafia'}
      </button>
      {message && <p role="status" className="text-xs text-white/70">{message}</p>}
    </div>}
    {career?.yearly_stats?.length > 0 && <label className="mt-4 block text-xs text-white/70">Период спортивной карьеры
      <select aria-label="Год спортивной карьеры" value={year} onChange={e => setYear(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm text-white">
        <option value="all">За всё время</option>
        {career.yearly_stats.map((s: any) => <option key={s.year} value={String(s.year)}>{s.year}</option>)}
      </select>
    </label>}
    {snap && <div data-testid="gomafia-federation-stats" className="mt-3 space-y-2">
      <p className="text-xs text-amber-100/80">{statPeriod} · {snap.gameFilter || 'Режим игр неизвестен'} · {snap.tournamentFilter || 'Турниры не уточнены'}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{stat(snap.overallElo)}</strong><div className="text-xs text-white/55">Elo</div></div>
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{stat(snap.totalGames)}</strong><div className="text-xs text-white/55">Игры</div></div>
        <div className="rounded-xl bg-white/[.06] p-2 text-center"><strong>{snap.overallWinRatePercent == null ? '—' : String(snap.overallWinRatePercent) + '%'}</strong><div className="text-xs text-white/55">Винрейт</div></div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-white/65">
        <span>Мирный: {stat(snap.roleGames?.citizen)}</span><span>Шериф: {stat(snap.roleGames?.sheriff)}</span>
        <span>Мафия: {stat(snap.roleGames?.mafia)}</span><span>Дон: {stat(snap.roleGames?.don)}</span>
      </div>
      <p className="text-xs text-white/45">Данные GoMafia · Обновлено {new Date(snap.retrievedAt).toLocaleDateString('ru-RU')}</p>
    </div>}
    {career?.syncing && <p role="status" className="mt-3 text-xs text-white/60">Автоматически обновляем спортивную карьеру…</p>}
    {tournaments.length > 0 && <div data-testid="gomafia-tournament-appearances" className="mt-4 space-y-3">
      <strong className="block text-sm">Турнирные выступления · {tournaments.length}</strong>
      {tournaments.map((item: any) => <article key={item.tournamentId} className="rounded-xl bg-white/[.045] p-3">
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-words text-sm font-medium text-amber-100">{item.tournamentName} ↗</a>
        <div className="mt-1 text-xs text-white/55">{item.dateStart} — {item.dateEnd} · {item.location}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
          <span>{({ registered: 'Регистрация', upcoming: 'Предстоящий турнир', completed: 'Турнир завершён', results_published: 'Результат опубликован', unknown: 'Статус не подтверждён' } as Record<string,string>)[item.status]}</span>
          {item.place != null && <span>Место: {item.place}</span>}
          <span>{item.totalScore == null ? 'Баллы недоступны' : stat(item.totalScore) + ' баллов'}</span>
          {item.eloDelta != null && <span>Elo: {item.eloDelta > 0 ? '+' : ''}{stat(item.eloDelta)}</span>}
        </div>
        {item.scoreStatus === 'refresh_failed' && item.totalScore != null && <p className="mt-1 text-[11px] text-white/45">Баллы из сохранённого результата · {item.scoreRetrievedAt ? new Date(item.scoreRetrievedAt).toLocaleDateString('ru-RU') : 'дата обновления неизвестна'}</p>}
        {item.games?.length > 0 && <details className="mt-3 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 text-white/70">Игры · {item.games.length}</summary>
          <div className="space-y-2">{item.games.map((game: any) => <div key={game.externalGameId} className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-2">
            <span>№{game.gameNumber} · {({ citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' } as Record<string,string>)[game.role] || 'Роль неизвестна'} · Место {game.seat ?? '—'}</span>
            <span className={game.result === 'win' ? 'text-emerald-200' : 'text-white/55'}>{game.result === 'win' ? 'Победа' : game.result === 'loss' ? 'Поражение' : 'Результат неизвестен'} · Elo {game.eloDelta == null ? '—' : (game.eloDelta > 0 ? '+' : '') + stat(game.eloDelta)}</span>
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
