import { useEffect, useState } from 'react';
import GoMafiaTournamentOrganizer from './GoMafiaTournamentOrganizer.tsx';

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
  const [careerVersion, setCareerVersion] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLink(null);
    fetch(`/api/player/gomafia/players/${encodeURIComponent(playerId)}`, { credentials: 'include', signal: abort.signal })
      .then(async res => { if (!res.ok) throw new Error('Не удалось загрузить связь GoMafia'); return res.json(); })
      .then(body => { if (!abort.signal.aborted) setLink(body.link ?? null); })
      .catch(() => { /* External profile link is optional; do not block a player's profile. */ });
    return () => abort.abort();
  }, [playerId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/player/gomafia/players/' + encodeURIComponent(playerId) + '/career',
      { credentials: 'include', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setCareer(data); })
      .catch(() => { /* External data never blocks the club profile. */ });
    return () => controller.abort();
  }, [playerId, link?.external_player_id, link?.status, careerVersion]);
  const stat = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
  const snap = career?.snapshot;
  const statPeriod = typeof snap?.year === 'number' ? `За ${snap.year} год` : 'Период источника не определён';
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
    {Array.isArray(career?.external_games) && career.external_games.length > 0 && <div data-testid="gomafia-history" className="mt-4 space-y-2">
      <strong className="text-sm">История федеративных игр</strong>
      {career.external_games.map((game: any) => <div key={game.externalGameId}
        className="rounded-xl border border-white/10 bg-white/[.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-sm font-medium">{game.tournamentName || 'Турнирная игра'}</div>
          <div className="mt-1 text-xs text-white/55">{game.date || 'Дата неизвестна'} · {({ citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' } as Record<string, string>)[game.role] || 'Роль не указана'} · {game.result === 'win' ? 'Победа' : game.result === 'loss' ? 'Поражение' : 'Результат не указан'}</div></div>
          <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-200 underline">Источник ↗</a>
        </div>
      </div>)}
    </div>}
    {career?.status === 'verified' && career?.history_status === 'not_imported' &&
      <p className="mt-2 text-xs text-white/50">История федеративных игр пока не импортирована. Полные протоколы можно открыть на сайте федерации.</p>}
    {Array.isArray(career?.tournaments) && career.tournaments.length > 0 && <div data-testid="gomafia-tournament-appearances" className="mt-3 space-y-2">
      <strong className="block text-sm">Турнирные выступления</strong>
      {career.tournaments.map((item: any) => <div key={item.tournamentId} className="rounded-xl bg-white/[.045] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-sm font-medium">{item.tournamentName}</div>
            <div className="mt-1 text-xs text-white/55">{item.dateRange || 'Дата не указана'} · Место: {item.place} · {stat(item.totalScore)} баллов</div>
            <div className="mt-1 text-[11px] text-white/45">Игрок в таблице: {item.externalNickname}</div>
          </div>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-xs text-amber-200 underline">Источник ↗</a>
        </div>
      </div>)}
    </div>}
    {organizer && link?.status === 'verified' &&
      <GoMafiaTournamentOrganizer playerId={playerId} onImported={() => setCareerVersion(version => version + 1)} />}
    {career?.error && <p className="mt-2 text-xs text-amber-100">{career.error}</p>}
    <p className="mt-2 text-[11px] text-white/40">Турнирные протоколы доступны по ссылке GoMafia. Клубная статистика 2LA Noire считается отдельно.</p>
  </section>;
}
