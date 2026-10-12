import { useState } from 'react';

type Standing = { place: number; nickname: string; totalScore: number };
type Preview = {
  tournamentId: string; tournamentName: string; dateRange: string | null;
  sourceUrl: string; standings: Standing[];
};

/** Organizer-confirmed source row association, never a fuzzy nickname match. */
export default function GoMafiaTournamentOrganizer({
  playerId, onImported,
}: { playerId: string; onImported: () => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const post = async (path: string, body: object) => {
    const response = await fetch(path, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось получить результат турнира');
    return data;
  };
  const showPreview = async () => {
    setBusy(true); setError(''); setMessage(''); setPreview(null); setSelected('');
    try {
      const data: Preview = await post('/api/player/gomafia/organizer/tournaments/preview', { url });
      setPreview(data);
    } catch (reason: any) { setError(reason?.message || 'Ошибка чтения турнира'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!preview || !selected) return;
    const row = preview.standings.find(x => String(x.place) + ':' + x.nickname === selected);
    if (!row) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await post('/api/player/gomafia/organizer/' + encodeURIComponent(playerId) + '/tournaments',
        { url: preview.sourceUrl, place: row.place, nickname: row.nickname });
      setMessage('Результат турнира сохранён в спортивной карьере игрока.');
      onImported();
    } catch (reason: any) { setError(reason?.message || 'Ошибка сохранения'); }
    finally { setBusy(false); }
  };
  return <div data-testid="gomafia-organizer-tournament-import" className="mt-3 space-y-2 border-t border-white/10 pt-3">
    <strong className="block text-xs">Добавить выступление с GoMafia</strong>
    <label className="block text-xs text-white/60" htmlFor="gomafia-tournament-url">Публичная ссылка на турнир</label>
    <input id="gomafia-tournament-url" value={url} onChange={e => setUrl(e.target.value)}
      placeholder="https://gomafia.pro/tournament/2634" className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[.07] px-3 text-xs text-white" />
    <button type="button" onClick={() => void showPreview()} disabled={busy || !url.trim()}
      className="min-h-11 rounded-xl bg-white/10 px-3 text-xs font-semibold disabled:opacity-50">
      {busy ? 'Загружаем…' : 'Посмотреть результаты'}
    </button>
    {preview && <div className="space-y-2 rounded-xl border border-white/10 p-3">
      <strong className="block text-xs">{preview.tournamentName}</strong>
      <div className="text-xs text-white/55">{preview.dateRange || 'Дата не указана'} · {preview.standings.length} участников</div>
      <label htmlFor="gomafia-standing-select" className="block text-xs text-white/65">Выбери именно этого игрока в официальной таблице</label>
      <select id="gomafia-standing-select" value={selected} onChange={e => setSelected(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#16171a] px-2 text-xs text-white">
        <option value="">Выбрать участника</option>
        {preview.standings.map(row => <option key={row.place + ':' + row.nickname} value={row.place + ':' + row.nickname}>
          {row.place}. {row.nickname} · {row.totalScore} баллов
        </option>)}
      </select>
      <button type="button" onClick={() => void save()} disabled={busy || !selected}
        className="min-h-11 rounded-xl bg-amber-200 px-3 text-xs font-semibold text-black disabled:opacity-50">
        Сохранить выбранное выступление
      </button>
      <p className="text-[11px] text-white/50">Привязка ручная. Турнир не становится мероприятием 2LA Noire.</p>
    </div>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
  </div>;
}
