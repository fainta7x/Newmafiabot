import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { requestJson } from '../../lib/requestJson.ts';

type Placeholder = { token: string; meaning: string; example: string };
type Template = { key: string; label: string; default_body: string; body: string; customized: boolean; placeholders: Placeholder[] };

const request = (url: string, init?: RequestInit) => requestJson(url, init, 'Не получилось');

/** The text as it will look, with example values in place of the {placeholders}. */
export const previewTemplate = (body: string, placeholders: Placeholder[]) => placeholders.reduce((text, item) => text.split(item.token).join(item.example), body);

/**
 * «Текст постов» (owner, 2026-10-13: «хочу сам менять текст, пост тухлый»): the organizer rewrites the text of the VK post
 * for club evenings. Tap a placeholder to insert it; the preview shows the post with example values.
 */
export function PostTemplatesCard() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const fields = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const apply = (list: Template[]) => { setTemplates(list); setDraft(Object.fromEntries(list.map((item) => [item.key, item.body]))); };
  useEffect(() => { void request('/api/post-templates').then((data) => apply(data.templates)).catch((e) => setError(e?.message || 'Не удалось загрузить')); }, []);

  const save = async (template: Template) => {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { apply((await request(`/api/post-templates/${encodeURIComponent(template.key)}`, { method: 'PUT', body: JSON.stringify({ body: draft[template.key] }) })).templates); setNote('Текст сохранён — следующие посты выйдут с ним.'); }
    catch (e: any) { setError(e?.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };
  const reset = async (template: Template) => {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { apply((await request(`/api/post-templates/${encodeURIComponent(template.key)}`, { method: 'DELETE' })).templates); setNote('Вернули стандартный текст.'); }
    catch (e: any) { setError(e?.message || 'Не удалось вернуть'); } finally { setBusy(false); }
  };
  const insert = (template: Template, token: string) => {
    const field = fields.current[template.key];
    const current = draft[template.key] ?? '';
    const start = field?.selectionStart ?? current.length;
    const end = field?.selectionEnd ?? current.length;
    setDraft({ ...draft, [template.key]: `${current.slice(0, start)}${token}${current.slice(end)}` });
  };

  if (!templates) return <section className="rounded-[16px] border border-border-soft bg-surface-1 p-4 text-[13px] text-text-secondary">{error || 'Загружаем тексты постов…'}</section>;
  return (
    <section className="space-y-4 rounded-[16px] border border-border-soft bg-surface-1 p-4" data-testid="post-templates-card">
      <div>
        <h3 className="text-[15px] font-bold text-text-primary">Текст постов</h3>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">Перепишите так, как хочется. Слова в скобках { '{ }' } подставятся сами: нажмите на нужное, чтобы вставить его в текст.</p>
      </div>
      {templates.map((template) => {
        const text = draft[template.key] ?? '';
        const changed = text !== template.body;
        return <div key={template.key} className="space-y-2" data-testid={`post-template-${template.key}`}>
          <strong className="block text-[14px] text-text-primary">{template.label}{template.customized ? ' · ваш текст' : ' · стандартный'}</strong>
          <textarea ref={(node) => { fields.current[template.key] = node; }} value={text} maxLength={1500} onChange={(event) => setDraft({ ...draft, [template.key]: event.target.value })} aria-label={template.label} className="mobile-field min-h-[140px] resize-y" />
          <div className="flex flex-wrap gap-1.5">
            {template.placeholders.map((item) => <button key={item.token} type="button" title={item.meaning} onClick={() => insert(template, item.token)} className="min-h-9 rounded-lg border border-border-soft bg-surface-2 px-2.5 text-[12px] font-semibold text-text-primary">{item.token}</button>)}
          </div>
          <details className="text-[12px] text-text-secondary"><summary className="cursor-pointer">Что значат слова в скобках</summary><ul className="mt-1 space-y-0.5">{template.placeholders.map((item) => <li key={item.token}><b>{item.token}</b> — {item.meaning}</li>)}</ul></details>
          <div className="rounded-[12px] bg-surface-2 p-3"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Так будет выглядеть пост</span><p className="whitespace-pre-line text-[13px] leading-5 text-text-primary" data-testid="post-template-preview">{previewTemplate(text, template.placeholders)}</p></div>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !changed || !text.trim()} onClick={() => void save(template)} className="min-h-11 flex-1 rounded-[12px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Сохранить</button>
            {template.customized ? <button type="button" disabled={busy} onClick={() => void reset(template)} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold text-text-primary"><RotateCcw className="h-4 w-4" /> Стандартный</button> : null}
          </div>
        </div>;
      })}
      {note ? <p className="rounded-[12px] bg-success-soft px-3 py-2 text-[13px] text-success">{note}</p> : null}
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    </section>
  );
}

export default PostTemplatesCard;
