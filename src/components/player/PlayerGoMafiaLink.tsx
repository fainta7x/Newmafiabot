import { useEffect, useState } from 'react';

type Linked = {
  external_player_id: string;
  profile_url: string;
  status: 'pending' | 'verified';
  updated_at: string;
};
export default function PlayerGoMafiaLink({ playerId, isSelf }: { playerId: string; isSelf: boolean }) {
  const [link, setLink] = useState<Linked | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    setLink(null);
    fetch(`/api/player/gomafia/players/${encodeURIComponent(playerId)}`, { credentials: 'include', signal: abort.signal })
      .then(async res => { if (!res.ok) throw new Error('Не удалось загрузить связь GoMafia'); return res.json(); })
      .then(body => { if (!abort.signal.aborted) setLink(body.link ?? null); })
      .catch(() => { /* External profile link is optional; do not block a player's profile. */ });
    return () => abort.abort();
  }, [playerId]);
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/player/gomafia/me', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: input.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось привязать GoMafia');
      setLink(body.link);
      setInput('');
      setMessage('Ссылка сохранена. Организатор сможет подтвердить привязку.');
    } catch (error: any) {
      setMessage(String(error?.message || 'Ошибка сохранения'));
    } finally {
      setBusy(false);
    }
  };
  return <section data-testid="player-gomafia-link" className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><strong className="text-sm">GoMafia · Турнирная карьера</strong>
        <p className="mt-1 text-xs text-white/55">{link
          ? link.status === 'verified' ? 'Привязка подтверждена' : 'Ожидает подтверждения организатора'
          : 'Профиль пока не привязан'}</p></div>
      {link && <a className="text-xs text-amber-200 underline" href={link.profile_url} target="_blank" rel="noopener noreferrer">Открыть ↗</a>}
    </div>
    {isSelf && <div className="mt-3 space-y-2">
      <label htmlFor="gomafia-player-url" className="block text-xs text-white/70">Ссылка на свой профиль GoMafia или его ID</label>
      <input id="gomafia-player-url" value={input} onChange={e => setInput(e.target.value)}
        placeholder="https://gomafia.pro/stats/123"
        className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[.07] px-3 text-sm text-white" />
      <button type="button" onClick={() => void save()} disabled={busy || !input.trim()}
        className="min-h-11 rounded-xl bg-amber-200 px-4 text-sm font-semibold text-black disabled:opacity-50">
        {busy ? 'Сохраняем…' : link ? 'Обновить привязку' : 'Привязать GoMafia'}
      </button>
      {message && <p role="status" className="text-xs text-white/70">{message}</p>}
    </div>}
    <p className="mt-2 text-[11px] text-white/40">Внешние турниры и Elo будут показаны отдельно от клубных после подключения синхронизации.</p>
  </section>;
}
