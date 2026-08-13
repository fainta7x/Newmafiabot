import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, RefreshCw, Users } from 'lucide-react';

type VkDestination = {
  key: string;
  name: string;
  active: boolean;
  supported: boolean;
  reason: string | null;
  configured_url: string | null;
  published: boolean;
  status: string;
  external_url: string | null;
  post_id: number | null;
  poll_id: number | null;
  last_error: string | null;
  updated_at: string | null;
};

type VkAttention = {
  vk_user_id: string;
  display_name: string | null;
  screen_name: string | null;
  response_status: string | null;
  sync_status: string;
  player_id: string | null;
};

type VkState = {
  evening: { id: string; title: string; status: string };
  integration: {
    configured: boolean;
    token_configured: boolean;
    group_token_configured?: boolean;
    callback_secret_configured: boolean;
    callback_confirmation_configured: boolean;
    oauth?: {
      app_id: string;
      managed_connected: boolean;
      user_id: string | null;
      scope: string | null;
      expires_at: string | null;
    };
  };
  destinations: VkDestination[];
  votes: { total: number; applied: number; unmatched: number; conflict: number; superseded: number; ineligible: number };
  attention: VkAttention[];
  players: Array<{ id: string; nickname: string }>;
};

interface Props {
  eveningId: string;
  status: string;
  readonly?: boolean;
}

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

const responseLabel: Record<string, string> = {
  going: 'Иду',
  late: 'Приду позже',
  thinking: 'Пока думаю',
  declined: 'Не иду',
};

const attentionLabel: Record<string, string> = {
  unmatched: 'Нужно связать с игроком',
  conflict: 'Разные ответы в VK',
  superseded: 'В приложении уже более свежий ответ',
  ineligible: 'Ответ нельзя применить к этому вечеру',
};

export const EveningVkCard: React.FC<Props> = ({ eveningId, status, readonly }) => {
  const [state, setState] = useState<VkState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  const load = async (silent = false) => {
    if (!silent) setBusy((value) => value || 'load');
    try {
      setState(await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}`));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить VK');
    } finally {
      if (!silent) setBusy((value) => value === 'load' ? null : value);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('vk_connected');
    const oauthError = url.searchParams.get('vk_error');
    if (connected === '1') setMessage('VK подключён. Теперь можно публиковать анонсы.');
    if (oauthError) setError(`VK: ${oauthError}`);
    if (connected || oauthError) {
      url.searchParams.delete('vk_connected');
      url.searchParams.delete('vk_error');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void load();
  }, [eveningId]);

  const canPublish = !readonly && ['published', 'active'].includes(status);
  const supportedDestinations = useMemo(() => state?.destinations.filter((item) => item.active && item.supported) || [], [state]);

  const connectVk = async () => {
    if (busy) return;
    setBusy('connect'); setError(null); setMessage(null);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const body = await request('/api/integrations/vk/oauth/start', {
        method: 'POST',
        body: JSON.stringify({ return_to: returnTo }),
      });
      if (!body?.authorize_url) throw new Error('Сервер не вернул ссылку VK ID');
      window.location.assign(String(body.authorize_url));
    } catch (err: any) {
      setError(err?.message || 'Не удалось подключить VK');
      setBusy(null);
    }
  };

  const sync = async () => {
    if (busy) return;
    setBusy('sync'); setError(null); setMessage(null);
    try {
      const body = await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}/sync`, { method: 'POST' });
      if (body?.state) setState(body.state);
      else await load(true);
      const ok = Array.isArray(body?.results) ? body.results.filter((item: any) => item.success).length : supportedDestinations.length;
      setMessage(`VK синхронизирован${ok ? `: ${ok} направл.` : ''}`);
    } catch (err: any) {
      setError(err?.message || 'Не удалось синхронизировать VK');
    } finally { setBusy(null); }
  };

  const reconcile = async () => {
    if (busy) return;
    setBusy('reconcile'); setError(null); setMessage(null);
    try {
      const body = await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}/reconcile`, { method: 'POST' });
      if (body?.state) setState(body.state);
      else await load(true);
      setMessage(body?.errors?.length ? `Ответы получены, но есть ошибок: ${body.errors.length}` : 'Ответы VK сверены с общей записью.');
    } catch (err: any) {
      setError(err?.message || 'Не удалось забрать ответы VK');
    } finally { setBusy(null); }
  };

  const link = async (vote: VkAttention) => {
    const playerId = links[vote.vk_user_id] || vote.player_id || '';
    if (!playerId || busy) return;
    setBusy(`link:${vote.vk_user_id}`); setError(null); setMessage(null);
    try {
      await request('/api/integrations/vk/identities/link', {
        method: 'POST',
        body: JSON.stringify({ vk_user_id: vote.vk_user_id, player_id: playerId }),
      });
      setMessage('VK-профиль связан. Текущий голос применён к общей записи.');
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось связать VK-профиль');
    } finally { setBusy(null); }
  };

  if (!state && busy === 'load') {
    return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-text-muted"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Загружаем VK…</section>;
  }

  if (!state) return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-danger">{error || 'VK недоступен'}</section>;

  return (
    <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2688eb]/10 text-[12px] font-black text-[#2688eb]">VK</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-text-primary">VK · анонс и запись</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Нативный опрос VK синхронизируется с той же записью игроков, что WebApp и Telegram.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-full bg-surface-1 p-2 text-text-muted disabled:opacity-40" aria-label="Обновить VK"><RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} /></button>
      </div>

      {!state.integration.configured ? (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-[10px] leading-4 text-warning">
          <div>Паблик и канал 2LA Noire уже привязаны. Осталось один раз разрешить приложению публиковать и читать ответы VK.</div>
          {!readonly ? <button type="button" disabled={Boolean(busy)} onClick={() => void connectVk()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#2688eb] px-3 text-[10px] font-bold text-white disabled:opacity-40"><Link2 className="h-3.5 w-3.5" />{busy === 'connect' ? 'Открываем VK…' : 'Подключить VK'}</button> : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] leading-4 text-success">VK подключён{state.integration.oauth?.managed_connected ? ' через VK ID' : ''}. Анонсы и опросы готовы к публикации.</div>
      )}
      {state.integration.configured && (!state.integration.callback_secret_configured || !state.integration.callback_confirmation_configured) ? <div className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[10px] leading-4 text-text-secondary">Публикация уже работает. Для мгновенного переноса голосов позже подключим Callback API; пока ответы можно забирать кнопкой ниже.</div> : null}

      <div className="mt-3 space-y-1.5">
        {state.destinations.map((destination) => {
          const openUrl = destination.key === 'channel'
            ? (destination.configured_url || destination.external_url)
            : (destination.external_url || destination.configured_url);
          const publicationLabel = destination.key === 'channel' ? 'Сообщение' : 'Пост';
          return (
            <div key={destination.key} className="rounded-xl border border-border-soft bg-surface-1 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {destination.published ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : destination.active && destination.supported ? <RefreshCw className="h-4 w-4 shrink-0 text-accent" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                <strong className="min-w-0 flex-1 text-[11px] text-text-primary">{destination.name}</strong>
                {openUrl ? <a href={openUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-surface-2 px-2 text-[9px] font-bold text-accent">Открыть <ExternalLink className="h-3 w-3" /></a> : null}
              </div>
              <div className={`mt-1 text-[9px] leading-4 ${destination.last_error ? 'text-danger' : 'text-text-muted'}`}>
                {destination.last_error || (destination.published ? `${publicationLabel} #${destination.post_id} · опрос #${destination.poll_id}` : destination.reason || 'Готово к публикации')}
              </div>
            </div>
          );
        })}
      </div>

      {state.votes.total > 0 ? <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-1 p-2 text-center"><div className="text-[17px] font-black text-text-primary">{state.votes.total}</div><div className="text-[9px] text-text-muted">голосов VK</div></div>
        <div className="rounded-xl bg-success-soft p-2 text-center"><div className="text-[17px] font-black text-success">{state.votes.applied}</div><div className="text-[9px] text-text-muted">в общей БД</div></div>
        <div className={`rounded-xl p-2 text-center ${state.votes.unmatched + state.votes.conflict ? 'bg-warning-soft' : 'bg-surface-1'}`}><div className="text-[17px] font-black text-text-primary">{state.votes.unmatched + state.votes.conflict}</div><div className="text-[9px] text-text-muted">нужно разобрать</div></div>
      </div> : null}

      {state.attention.length ? <div className="mt-3 border-t border-border-soft pt-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-text-muted"><Users className="h-3.5 w-3.5" /> Требуют связи</div>
        <div className="mt-2 space-y-2">
          {state.attention.map((vote) => {
            const title = vote.display_name || (vote.screen_name ? `@${vote.screen_name}` : `VK ID ${vote.vk_user_id}`);
            const canLink = vote.sync_status === 'unmatched';
            return <div key={vote.vk_user_id} className="rounded-xl border border-border-soft bg-surface-1 p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-text-primary">{title}</strong><span className="mt-0.5 block text-[9px] leading-4 text-text-muted">{responseLabel[vote.response_status || ''] || vote.response_status || '—'} · {attentionLabel[vote.sync_status] || vote.sync_status}</span></div>
              </div>
              {canLink ? <div className="mt-2 flex gap-2">
                <select value={links[vote.vk_user_id] || ''} onChange={(event) => setLinks((current) => ({ ...current, [vote.vk_user_id]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-border-soft bg-surface-2 px-2 text-[10px] text-text-primary">
                  <option value="">Кто это?</option>
                  {state.players.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
                </select>
                <button type="button" disabled={!links[vote.vk_user_id] || Boolean(busy)} onClick={() => void link(vote)} className="inline-flex min-h-10 items-center gap-1 rounded-[10px] bg-accent px-3 text-[10px] font-bold text-white disabled:opacity-40"><Link2 className="h-3.5 w-3.5" /> Связать</button>
              </div> : null}
            </div>;
          })}
        </div>
      </div> : null}

      {message ? <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] text-success">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!canPublish || !state.integration.configured || Boolean(busy)} onClick={() => void sync()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-[11px] font-bold text-white disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />{busy === 'sync' ? 'Публикуем…' : 'Синхронизировать VK'}</button>
        <button type="button" disabled={!state.destinations.some((item) => item.published) || Boolean(busy)} onClick={() => void reconcile()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-1 px-3 text-[11px] font-bold text-text-primary disabled:opacity-40"><Users className={`h-4 w-4 ${busy === 'reconcile' ? 'animate-pulse' : ''}`} />{busy === 'reconcile' ? 'Сверяем…' : 'Забрать ответы'}</button>
      </div>
    </section>
  );
};

export default EveningVkCard;
