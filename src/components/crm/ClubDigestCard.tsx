import { useEffect, useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

/**
 * «Сводка для игроков» (owner, 2026-10-05): the owner writes the digest of changes and posts it to the chosen Telegram
 * destinations, instead of pasting it into the group. Nothing is sent without the confirmation; `**text**` is bold.
 */
type Destination = { id: string; name: string; ready: boolean };
type Recent = { created_at: string; destination_id: string; status: string; error?: string | null; preview: string };
type State = { destinations: Destination[]; recent: Recent[]; max_length: number };
type Result = { destination: string; status: 'sent' | 'failed' | 'duplicate'; error?: string };

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не получилось');
  return data;
};

const STATUS_LABEL: Record<string, string> = { sent: 'отправлено', failed: 'не отправлено', duplicate: 'уже отправлено сегодня' };

export function ClubDigestCard() {
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>(['club']);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    try { setState(await request('/api/club-digest')); setForbidden(false); }
    catch (loadError: any) { if (/владел/i.test(String(loadError?.message))) setForbidden(true); else setError(loadError?.message || 'Не удалось загрузить сводку'); }
  };
  useEffect(() => { void load(); }, []);

  const names = useMemo(() => Object.fromEntries((state?.destinations || []).map((item) => [item.id, item.name])), [state]);
  const max = state?.max_length || 3800;
  const ready = text.trim().length >= 20 && text.trim().length <= max && selected.length > 0;

  const publish = async () => {
    setBusy(true); setError(''); setResults(null);
    try {
      const data = await request('/api/club-digest', { method: 'POST', body: JSON.stringify({ text, destinations: selected }) });
      setResults(data.results || []);
      await load();
    } catch (publishError: any) {
      setError(publishError?.message || 'Не удалось опубликовать сводку');
    } finally { setBusy(false); setConfirm(false); }
  };

  if (forbidden) return null;
  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4" data-testid="club-digest-card">
      <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-accent" /><h3 className="text-[14px] font-black">Сводка для игроков</h3></div>
      <p className="mt-1 text-[12px] leading-4 text-text-secondary">Что нового в приложении: напиши или вставь текст и опубликуй в выбранные группы. Жирный шрифт: **слова**. Ничего не отправляется без подтверждения.</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={9}
        maxLength={max}
        placeholder="🎭 Что нового в 2LA Noire…"
        aria-label="Текст сводки"
        data-testid="club-digest-text"
        className="mt-3 w-full resize-y rounded-[12px] border border-border-soft bg-surface-2 p-3 text-[14px] leading-5 text-text-primary outline-none"
      />
      <div className="mt-1 text-right text-[11px] text-text-muted">{text.trim().length} / {max}</div>
      <div className="mt-2 text-[12px] font-bold text-text-secondary">Куда опубликовать</div>
      <div className="mt-1 grid gap-1.5">
        {(state?.destinations || []).map((item) => (
          <label key={item.id} className={`flex min-h-11 items-center gap-2 rounded-[11px] bg-surface-2 px-3 text-[13px] ${item.ready ? 'text-text-primary' : 'text-text-muted'}`}>
            <input type="checkbox" disabled={!item.ready} checked={selected.includes(item.id) && item.ready} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {!item.ready ? <span className="text-[11px]">не настроено</span> : null}
          </label>
        ))}
      </div>
      {error ? <p role="alert" className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      {results ? (
        <div className="mt-2 space-y-1" data-testid="club-digest-results">
          {results.map((item) => <div key={item.destination} className={`rounded-[10px] px-3 py-2 text-[12px] ${item.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{names[item.destination] || item.destination}: {STATUS_LABEL[item.status]}{item.error ? ` · ${item.error}` : ''}</div>)}
        </div>
      ) : null}
      <button type="button" disabled={!ready || busy} onClick={() => setConfirm(true)} data-testid="club-digest-publish" className="mt-3 min-h-12 w-full rounded-[13px] bg-accent px-3 text-[14px] font-bold text-white disabled:opacity-35">{busy ? 'Публикуем…' : 'Опубликовать'}</button>
      {state?.recent.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Последние публикации</div>
          <div className="mt-1.5 space-y-1">
            {state.recent.slice(0, 5).map((item, index) => (
              <div key={`${item.created_at}-${item.destination_id}-${index}`} className="rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] text-text-secondary">
                <div className="flex justify-between gap-2"><span>{names[item.destination_id] || item.destination_id} · {STATUS_LABEL[item.status] || item.status}</span><span className="shrink-0 text-text-muted">{new Date(item.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</span></div>
                <div className="mt-0.5 truncate text-text-muted">{item.preview}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title="Опубликовать сводку?"
        description={`Сообщение сразу уйдёт в: ${selected.map((id) => names[id] || id).join(', ')}. Отменить отправку будет нельзя.`}
        confirmLabel="Опубликовать"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void publish()}
      />
    </section>
  );
}
