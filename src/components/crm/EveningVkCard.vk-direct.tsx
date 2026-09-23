import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, RefreshCw, Send } from 'lucide-react';

type VkDestination = {
  key: string;
  name: string;
  active: boolean;
  supported: boolean;
  published: boolean;
  external_url: string | null;
  configured_url: string | null;
  post_id: number | null;
  last_error: string | null;
};

type VkState = {
  integration: { configured: boolean };
  destinations: VkDestination[];
};

type VkDraft = {
  message: string;
  join_url: string;
  channel_url: string | null;
};

interface Props { eveningId: string; status: string; readonly?: boolean; }

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body;
};

/**
 * VK for one evening. What VK actually allows (verified 2026-09-23):
 * the community key publishes a static wall post that links to the live
 * public evening page; VK channels have no API, so the channel is posted
 * manually from a copied announcement.
 */
export const EveningVkCard: React.FC<Props> = ({ eveningId, status, readonly }) => {
  const [state, setState] = useState<VkState | null>(null);
  const [draft, setDraft] = useState<VkDraft | null>(null);
  const [busy, setBusy] = useState<'load' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setBusy('load');
    try {
      const [nextState, nextDraft] = await Promise.all([
        request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}`),
        request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}/draft`).catch(() => null),
      ]);
      setState(nextState);
      if (nextDraft) setDraft(nextDraft as VkDraft);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить VK');
    } finally {
      if (!silent) setBusy(null);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const canPublish = !readonly && ['published', 'active'].includes(status);
  const post = state?.destinations.find((item) => item.key === 'public') || null;
  const postUrl = post?.external_url || post?.configured_url || null;

  const publish = async () => {
    if (busy || !canPublish) return;
    setBusy('publish'); setError(null); setMessage(null);
    try {
      await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}/sync`, { method: 'POST' });
      await load(true);
      setMessage('Пост в паблике опубликован.');
    } catch (err: any) {
      setError(err?.message || 'Не удалось опубликовать в VK');
    } finally { setBusy(null); }
  };

  const copyForChannel = () => {
    if (!draft) return;
    setShowDraft(true);
    setError(null);
    const fallback = 'Канал открыт. Скопируй текст из поля ниже, вставь его в канал и нажми «Отправить».';
    if (!navigator.clipboard?.writeText) { setMessage(fallback); return; }
    void navigator.clipboard.writeText(draft.message)
      .then(() => setMessage('Анонс скопирован. В открытом канале вставь его и нажми «Отправить».'))
      .catch(() => setMessage(fallback));
  };

  if (!state && busy === 'load') return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-text-muted"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Загружаем VK…</section>;
  if (!state) return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-danger">{error || 'VK недоступен'}</section>;

  return (
    <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3" data-testid="evening-vk-card">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2688eb]/10 text-[12px] font-black text-[#2688eb]">VK</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-text-primary">VK · анонс вечера</h3>
          <p className="mt-0.5 text-[10px] leading-4 text-text-muted">Пост ведёт на страницу вечера, где видно, кто записан, и можно записаться.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-1 text-text-muted disabled:opacity-40" aria-label="Обновить VK"><RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} /></button>
      </div>

      {!state.integration.configured ? (
        <div className="mt-3 flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[11px] leading-4 text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Ключ сообщества VK не настроен на сервере — автопубликация в паблик недоступна. Анонс можно отправить вручную через «В канал».</span>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-border-soft bg-surface-1 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {post?.published ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Send className="h-4 w-4 shrink-0 text-text-muted" />}
            <strong className="min-w-0 flex-1 text-[12px] text-text-primary">Паблик: {post?.published ? 'пост опубликован' : 'пост ещё не опубликован'}</strong>
            {post?.published && postUrl ? <a href={postUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-[10px] font-bold text-accent">Открыть <ExternalLink className="h-3 w-3" /></a> : null}
          </div>
          {post?.last_error ? <p className="mt-1 text-[10px] leading-4 text-danger">{post.last_error}</p> : null}
        </div>
      )}

      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[11px] leading-4 text-danger">{error}</div> : null}
      {message ? <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[11px] leading-4 text-success">{message}</div> : null}

      {draft && showDraft ? <textarea readOnly value={draft.message} rows={7} onFocus={(event) => event.currentTarget.select()} className="mt-3 w-full resize-none rounded-lg border border-border-soft bg-surface-1 p-2 text-[11px] leading-4 text-text-primary" aria-label="Текст анонса" /> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {state.integration.configured && !post?.published
          ? <button type="button" disabled={Boolean(busy) || !canPublish} onClick={() => void publish()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-accent px-3 text-[11px] font-black text-white disabled:opacity-40"><Send className="h-3.5 w-3.5" />{busy === 'publish' ? 'Публикуем…' : 'Опубликовать'}</button>
          : draft?.join_url
            ? <a href={draft.join_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] border border-border-soft bg-surface-1 px-3 text-[11px] font-black text-text-primary"><ExternalLink className="h-3.5 w-3.5" />Страница вечера</a>
            : <span />}
        {draft?.channel_url
          ? <a href={draft.channel_url} target="_blank" rel="noreferrer" onClick={copyForChannel} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] border border-border-soft bg-surface-1 px-3 text-[11px] font-black text-text-primary"><Copy className="h-3.5 w-3.5" />В канал</a>
          : null}
      </div>
      {!canPublish && status === 'draft' ? <p className="mt-2 text-center text-[10px] text-text-muted">Сначала опубликуй вечер.</p> : null}
    </section>
  );
};

export default EveningVkCard;
