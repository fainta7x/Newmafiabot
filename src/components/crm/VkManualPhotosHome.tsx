import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Image as ImageIcon, Check, Copy } from 'lucide-react';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type Item = { id: string; title: string; post_url: string | null; created_at: string; post_text?: string | null };

/**
 * «Фото для постов ВК» (owner, 2026-11-11): VK gives this app no right to upload wall photos, so a post goes out as text and
 * its picture waits here: open the post, attach the saved picture, tick it off. No card at all while nothing waits.
 */
export default function VkManualPhotosHome() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const copy = async (item: Item) => {
    try { await navigator.clipboard.writeText(item.post_text || ''); setCopied(item.id); }
    catch { setError('Не удалось скопировать — выделите текст вручную'); }
  };
  const load = useCallback(async () => {
    try {
      const answer = await getJson<{ items?: Item[] }>('/api/crm/vk-manual-photos', 'Не удалось загрузить фото для постов ВК');
      setItems(Array.isArray(answer?.items) ? answer.items : []); setError('');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить фото для постов ВК'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const done = async (id: string) => {
    try { await sendJson(`/api/crm/vk-manual-photos/${encodeURIComponent(id)}/done`, 'POST', undefined, 'Не удалось отметить'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отметить'); }
  };
  if (items.length === 0 && !error) return null;
  return <section data-testid="crm-vk-manual-photos" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
    <div className="flex items-center gap-2">
      <ImageIcon className="h-5 w-5 text-accent" />
      <h3 className="flex-1 text-[15px] font-bold text-text-primary">Посты для ВК</h3>
    </div>
    {/* Owner, 2026-11-15 (variant «А»): a post with a picture is not published as bare text; it waits here to be posted by hand. */}
    <p className="mt-1 text-xs text-text-secondary">ВК не принимает картинки от приложения. Скопируйте текст, скачайте картинку, выложите пост в группе и отметьте.</p>
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    <div className="mt-2 space-y-2">
      {items.map(item => item.post_text ? <div key={item.id} data-testid={`vk-manual-post-${item.id}`} className="space-y-2 rounded-xl bg-surface-2 p-2">
        <div className="flex items-start gap-3">
          <img src={`/api/crm/vk-manual-photos/${encodeURIComponent(item.id)}/image`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 whitespace-pre-line break-words text-xs leading-4 text-text-primary line-clamp-4">{item.post_text}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void copy(item)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border-soft text-xs font-bold text-text-primary"><Copy className="h-4 w-4" />{copied === item.id ? 'Скопировано' : 'Текст'}</button>
          <a href={`/api/crm/vk-manual-photos/${encodeURIComponent(item.id)}/image`} download={`vk-${item.id.slice(0, 8)}.png`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border-soft text-xs font-bold text-text-primary"><Download className="h-4 w-4" />Картинка</a>
          <button type="button" onClick={() => void done(item.id)} aria-label={`Пост выложен: ${item.title}`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent text-xs font-bold text-white"><Check className="h-4 w-4" />Выложил</button>
        </div>
      </div> : <div key={item.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
        <img src={`/api/crm/vk-manual-photos/${encodeURIComponent(item.id)}/image`} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        <strong className="min-w-0 flex-1 break-words text-sm text-text-primary">{item.title}<span className="block text-[11px] font-normal text-text-muted">Текст уже на стене — прикрепите картинку</span></strong>
        <a href={`/api/crm/vk-manual-photos/${encodeURIComponent(item.id)}/image`} download={`vk-${item.id.slice(0, 8)}.png`} aria-label={`Скачать картинку: ${item.title}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-soft"><Download className="h-4 w-4" /></a>
        {item.post_url && <a href={item.post_url} target="_blank" rel="noreferrer" aria-label={`Открыть пост в ВК: ${item.title}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-soft"><ExternalLink className="h-4 w-4" /></a>}
        <button type="button" onClick={() => void done(item.id)} aria-label={`Картинка прикреплена: ${item.title}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white"><Check className="h-4 w-4" /></button>
      </div>)}
    </div>
  </section>;
}
