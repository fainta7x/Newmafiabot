import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RefreshCw } from 'lucide-react';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { requestJson } from '../../lib/requestJson.ts';

type Entry = { id: string; button: string; title: string; answer: string; enabled: boolean };
type Draft = { id: string | null; button: string; title: string; answer: string; enabled: boolean };

const request = (url: string, init?: RequestInit) => requestJson(url, init, 'Не получилось', { nullOn204: true });
const EMPTY: Draft = { id: null, button: '', title: '', answer: '', enabled: true };

/**
 * «Ответы бота» (owner, 2026-10-13: «хочу сам менять ответы»): the bot's «Частые вопросы». The organizer edits the texts,
 * switches a question off and changes the order; the bot picks the change up on the next tap, no deploy needed.
 */
export function BotFaqCRM() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Entry | null>(null);

  const load = async () => {
    setError('');
    try { setEntries((await request('/api/bot-faq')).entries); } catch (loadError: any) { setError(loadError?.message || 'Не удалось загрузить'); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try {
      const payload = JSON.stringify({ button: draft.button, title: draft.title, answer: draft.answer, enabled: draft.enabled });
      if (draft.id) await request(`/api/bot-faq/${encodeURIComponent(draft.id)}`, { method: 'PATCH', body: payload });
      else await request('/api/bot-faq', { method: 'POST', body: payload });
      setDraft(null);
      await load();
    } catch (saveError: any) { setError(saveError?.message || 'Не удалось сохранить'); } finally { setSaving(false); }
  };
  const toggle = async (entry: Entry) => {
    setError('');
    try { await request(`/api/bot-faq/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: !entry.enabled }) }); await load(); }
    catch (toggleError: any) { setError(toggleError?.message || 'Не удалось изменить'); }
  };
  const move = async (entry: Entry, direction: 'up' | 'down') => {
    setError('');
    try { setEntries((await request(`/api/bot-faq/${encodeURIComponent(entry.id)}/move`, { method: 'POST', body: JSON.stringify({ direction }) })).entries); }
    catch (moveError: any) { setError(moveError?.message || 'Не удалось переставить'); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await request(`/api/bot-faq/${encodeURIComponent(removing.id)}`, { method: 'DELETE' }); setRemoving(null); await load(); }
    catch (removeError: any) { setError(removeError?.message || 'Не удалось удалить'); setRemoving(null); }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="bot-faq-crm">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-text-secondary">Вопросы и ответы, которые бот показывает по кнопке «❓ Вопросы». Меняйте тексты, выключайте ненужные и расставляйте по порядку — бот подхватит сразу.</p>
        <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <button type="button" data-testid="bot-faq-add" onClick={() => setDraft({ ...EMPTY })} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[14px] font-bold text-white"><Plus className="h-4 w-4" /> Новый вопрос</button>
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      {entries && !entries.length ? <p className="rounded-[14px] bg-surface-2 p-4 text-center text-[13px] text-text-secondary">Вопросов нет — бот покажет встроенные ответы.</p> : null}
      <div className="space-y-2">
        {(entries || []).map((entry, index) => (
          <div key={entry.id} data-testid="bot-faq-row" className={`rounded-[16px] border border-border-soft bg-surface-1 p-3 ${entry.enabled ? '' : 'opacity-70'}`}>
            <button type="button" onClick={() => setDraft({ id: entry.id, button: entry.button, title: entry.title, answer: entry.answer, enabled: entry.enabled })} className="block w-full text-left">
              <div className="flex items-start justify-between gap-2">
                <strong className="min-w-0 text-[14px] text-text-primary">{entry.button}</strong>
                {entry.enabled ? null : <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-text-secondary">выключен</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-secondary">{entry.answer}</p>
            </button>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void toggle(entry)} className="min-h-11 flex-1 rounded-[12px] border border-border-soft bg-surface-2 text-[13px] font-semibold text-text-primary">{entry.enabled ? 'Выключить' : 'Включить'}</button>
              <button type="button" aria-label="Выше" disabled={index === 0} onClick={() => void move(entry, 'up')} className="grid h-11 w-11 place-items-center rounded-[12px] border border-border-soft text-text-secondary disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Ниже" disabled={index === (entries?.length || 0) - 1} onClick={() => void move(entry, 'down')} className="grid h-11 w-11 place-items-center rounded-[12px] border border-border-soft text-text-secondary disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setRemoving(entry)} className="min-h-11 rounded-[12px] border border-danger/25 px-4 text-[13px] font-semibold text-danger">Удалить</button>
            </div>
          </div>
        ))}
      </div>

      <MobileSheet open={Boolean(draft)} onClose={() => !saving && setDraft(null)} title={draft?.id ? 'Вопрос бота' : 'Новый вопрос'} widthClass="sm:max-w-lg"
        footer={<button type="button" disabled={saving || !draft?.button.trim() || !draft?.title.trim() || !draft?.answer.trim()} onClick={() => void save()} className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить'}</button>}>
        {draft ? (
          <div className="space-y-4">
            <label className="block"><span className="mobile-label">Надпись на кнопке</span><input className="mobile-field mt-1" value={draft.button} maxLength={32} onChange={(event) => setDraft({ ...draft, button: event.target.value })} placeholder="💳 Сколько стоит" aria-label="Надпись на кнопке" /></label>
            <label className="block"><span className="mobile-label">Вопрос целиком (заголовок ответа)</span><input className="mobile-field mt-1" value={draft.title} maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="💳 Сколько стоит?" aria-label="Вопрос" /></label>
            <label className="block"><span className="mobile-label">Ответ</span><textarea className="mobile-field mt-1 min-h-[160px] resize-y" value={draft.answer} maxLength={1500} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} aria-label="Ответ" /><span className="mt-1 block text-right text-[12px] text-text-muted">{draft.answer.length} / 1500</span></label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] bg-surface-2 px-3 text-[14px]"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Показывать в боте</label>
          </div>
        ) : null}
      </MobileSheet>
      <ConfirmDialog open={Boolean(removing)} title="Удалить вопрос?" description={removing ? `«${removing.button}» пропадёт из бота.` : ''} confirmLabel="Удалить" onCancel={() => setRemoving(null)} onConfirm={() => void remove()} />
    </div>
  );
}

export default BotFaqCRM;
