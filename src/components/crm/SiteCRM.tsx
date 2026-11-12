import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { requestJson } from '../../lib/requestJson.ts';

type Block = { key: string; label: string; hint: string; multiline: boolean; default_body: string; body: string; customized: boolean };
const request = (url: string, init?: RequestInit) => requestJson(url, init, 'Не получилось');

/**
 * «Ещё → Сайт» (owner, 2026-11-12: «простая CMS, чтобы править самому»): texts and links of the club's public site.
 * The site reads them from the app; a text left at «стандартный» is the one the site already had.
 */
export function SiteCRM() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const apply = (list: Block[]) => { setBlocks(list); setDraft(Object.fromEntries(list.map((item) => [item.key, item.body]))); };
  useEffect(() => { void request('/api/site-content').then((data) => apply(data.blocks)).catch((e) => setError(e?.message || 'Не удалось загрузить')); }, []);

  const run = async (url: string, init: RequestInit, done: string) => {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { apply((await request(url, init)).blocks); setNote(done); } catch (e: any) { setError(e?.message || 'Не получилось'); } finally { setBusy(false); }
  };

  if (!blocks) return <section className="rounded-[16px] border border-border-soft bg-surface-1 p-4 text-[13px] text-text-secondary">{error || 'Загружаем тексты сайта…'}</section>;
  return (
    <div className="space-y-3" data-testid="site-cms">
      <section className="rounded-[16px] border border-border-soft bg-surface-1 p-4 text-[13px] leading-5 text-text-secondary">
        Здесь вы правите тексты и ссылки сайта клуба. Сохранили, и на сайте они появятся сразу, обновлять его не нужно. Расписание вечеров для записи и места берутся из «Вечеров».
        <span className="mt-2 block">Фото сайта загружаются в «Сообщения → Публикации и каналы»: те же снимки клуба показываются на сайте.</span>
      </section>
      {blocks.map((block) => {
        const text = draft[block.key] ?? '';
        const changed = text !== block.body;
        return <section key={block.key} className="space-y-2 rounded-[16px] border border-border-soft bg-surface-1 p-4" data-testid={`site-block-${block.key}`}>
          <div>
            <strong className="block text-[14px] text-text-primary">{block.label}{block.customized ? ' · ваш текст' : ' · стандартный'}</strong>
            <p className="mt-0.5 text-[12px] leading-4 text-text-secondary">{block.hint}</p>
          </div>
          {block.multiline
            ? <textarea value={text} maxLength={2000} rows={block.key === 'faq' ? 12 : 4} onChange={(event) => setDraft({ ...draft, [block.key]: event.target.value })} aria-label={block.label} className="w-full rounded-[12px] border border-border-soft bg-surface-2 p-3 text-[14px] leading-5 text-text-primary" />
            : <input value={text} maxLength={300} onChange={(event) => setDraft({ ...draft, [block.key]: event.target.value })} aria-label={block.label} className="min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[14px] text-text-primary" />}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !changed || !text.trim()} onClick={() => void run(`/api/site-content/${encodeURIComponent(block.key)}`, { method: 'PUT', body: JSON.stringify({ body: text }) }, 'Сохранили. Сайт обновится сам.')} className="min-h-11 flex-1 rounded-[12px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Сохранить</button>
            {block.customized ? <button type="button" disabled={busy} onClick={() => void run(`/api/site-content/${encodeURIComponent(block.key)}`, { method: 'DELETE' }, 'Вернули стандартный текст.')} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold text-text-secondary"><RotateCcw size={14} aria-hidden="true" />Вернуть</button> : null}
          </div>
        </section>;
      })}
      {note ? <p className="rounded-[12px] bg-success-soft px-3 py-2 text-[13px] text-success">{note}</p> : null}
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

export default SiteCRM;
