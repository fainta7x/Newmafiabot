import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

type Entry = { id: string; title: string; body: string; published: boolean; published_at: string | null; created_at: string };
type Draft = { id: string | null; title: string; body: string; published: boolean };

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не получилось');
  return data;
};
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }) : '');
const EMPTY: Draft = { id: null, title: '', body: '', published: false };

/**
 * «Что нового» (owner, 2026-10-13: «сам создавать и заполнять»): the notices players read in the app. The organizer writes
 * them here, keeps them as drafts and publishes when ready; nothing goes out by itself.
 */
export function WhatsNewCRM() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Entry | null>(null);

  const load = async () => {
    setError('');
    try { setEntries((await request('/api/whats-new/all')).entries); } catch (loadError: any) { setError(loadError?.message || 'Не удалось загрузить'); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try {
      const payload = JSON.stringify({ title: draft.title, body: draft.body, published: draft.published });
      if (draft.id) await request(`/api/whats-new/${encodeURIComponent(draft.id)}`, { method: 'PATCH', body: payload });
      else await request('/api/whats-new', { method: 'POST', body: payload });
      setDraft(null);
      await load();
    } catch (saveError: any) { setError(saveError?.message || 'Не удалось сохранить'); } finally { setSaving(false); }
  };
  const togglePublished = async (entry: Entry) => {
    setError('');
    try { await request(`/api/whats-new/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: JSON.stringify({ published: !entry.published }) }); await load(); }
    catch (toggleError: any) { setError(toggleError?.message || 'Не удалось изменить'); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await request(`/api/whats-new/${encodeURIComponent(removing.id)}`, { method: 'DELETE' }); setRemoving(null); await load(); }
    catch (removeError: any) { setError(removeError?.message || 'Не удалось удалить'); setRemoving(null); }
  };

  const drafts = (entries || []).filter((entry) => !entry.published);
  const published = (entries || []).filter((entry) => entry.published);
  const row = (entry: Entry) => (
    <div key={entry.id} data-testid="whats-new-row" className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <button type="button" onClick={() => setDraft({ id: entry.id, title: entry.title, body: entry.body, published: entry.published })} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <strong className="min-w-0 text-[14px] text-text-primary">{entry.title}</strong>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${entry.published ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-secondary'}`}>{entry.published ? `опубликовано ${shortDate(entry.published_at)}` : 'черновик'}</span>
        </div>
        {entry.body ? <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-secondary">{entry.body}</p> : null}
      </button>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void togglePublished(entry)} className="min-h-11 flex-1 rounded-[12px] border border-border-soft bg-surface-2 text-[13px] font-semibold text-text-primary">{entry.published ? 'Снять с публикации' : 'Опубликовать'}</button>
        <button type="button" onClick={() => setRemoving(entry)} className="min-h-11 rounded-[12px] border border-danger/25 px-4 text-[13px] font-semibold text-danger">Удалить</button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="whats-new-crm">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-text-secondary">Записи, которые игроки читают в приложении на главной. Пока запись «черновик», игроки её не видят: напишите, проверьте и нажмите «Опубликовать».</p>
        <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <button type="button" data-testid="whats-new-add" onClick={() => setDraft({ ...EMPTY })} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[14px] font-bold text-white"><Plus className="h-4 w-4" /> Новая запись</button>
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      {entries && !entries.length ? <p className="rounded-[14px] bg-surface-2 p-4 text-center text-[13px] text-text-secondary">Записей пока нет.</p> : null}
      {drafts.length ? <section className="space-y-2"><h3 className="px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-text-muted">Черновики · {drafts.length}</h3>{drafts.map(row)}</section> : null}
      {published.length ? <section className="space-y-2"><h3 className="px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-text-muted">Видят игроки · {published.length}</h3>{published.map(row)}</section> : null}

      <MobileSheet open={Boolean(draft)} onClose={() => !saving && setDraft(null)} title={draft?.id ? 'Запись «Что нового»' : 'Новая запись'} widthClass="sm:max-w-lg"
        footer={<button type="button" disabled={saving || !draft?.title.trim()} onClick={() => void save()} className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить'}</button>}>
        {draft ? (
          <div className="space-y-4">
            <label className="block"><span className="mobile-label">Заголовок</span><input className="mobile-field mt-1" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например: В покере можно показать карты" aria-label="Заголовок" /></label>
            <label className="block"><span className="mobile-label">Что изменилось, простыми словами</span><textarea className="mobile-field mt-1 min-h-[140px] resize-y" value={draft.body} maxLength={1200} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="Текст" /><span className="mt-1 block text-right text-[12px] text-text-muted">{draft.body.length} / 1200</span></label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] bg-surface-2 px-3 text-[14px]"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Показывать игрокам</label>
          </div>
        ) : null}
      </MobileSheet>
      <ConfirmDialog open={Boolean(removing)} title="Удалить запись?" description={removing ? `«${removing.title}» исчезнет и у игроков, если она была опубликована.` : ''} confirmLabel="Удалить" onCancel={() => setRemoving(null)} onConfirm={() => void remove()} />
    </div>
  );
}

export default WhatsNewCRM;
