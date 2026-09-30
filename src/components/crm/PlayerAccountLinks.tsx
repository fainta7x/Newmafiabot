import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Send } from 'lucide-react';

type Links = {
  telegram: { linked: boolean; username: string | null };
  vk: { vk_user_id: string; display_name: string | null; url: string } | null;
  claim_link: { expires_at: string } | null;
};
type ClaimLink = { telegram_url: string | null; web_url: string; expires_at: string; nickname: string };

const day = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

/**
 * «Привязка профиля» in the player card (owner, 2026-09-30): the organizer makes a profile and the player
 * claims it later — by a one-time personal link (Telegram or VK), or the organizer pastes the player's VK page.
 */
export default function PlayerAccountLinks({ playerId }: { playerId: string }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [claim, setClaim] = useState<ClaimLink | null>(null);
  const [vk, setVk] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/account-links`, { credentials: 'include', cache: 'no-store' });
    if (response.ok) setLinks(await response.json());
  }, [playerId]);
  useEffect(() => { setClaim(null); setNote(''); setError(''); void load(); }, [load]);

  const call = async (key: string, url: string, body?: unknown) => {
    setBusy(key); setError(''); setNote('');
    try {
      const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не получилось');
      return data;
    } catch (callError: any) {
      setError(callError?.message || 'Не получилось');
      return null;
    } finally {
      setBusy('');
    }
  };

  const makeLink = async () => {
    const data = await call('claim', `/api/players/${encodeURIComponent(playerId)}/claim-link`);
    if (data) { setClaim(data); await load(); }
  };
  const linkVk = async () => {
    const data = await call('vk', `/api/players/${encodeURIComponent(playerId)}/vk-link`, { vk });
    if (data) { setVk(''); setNote(`VK привязан${data.display_name ? `: ${data.display_name}` : ''}`); await load(); }
  };
  const copyText = async (text: string) => setNote((await copy(text)) ? 'Скопировано — отправьте игроку в личку' : 'Не удалось скопировать — выделите ссылку вручную');

  if (!links) return null;
  const fullyLinked = links.telegram.linked && Boolean(links.vk);
  return (
    <section data-testid="crm-player-account-links" className="space-y-2.5 rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary"><Link2 className="h-4 w-4 text-accent" /> Привязка профиля</div>
      <div className="flex items-center justify-between gap-3 text-[12px]"><span className="text-text-secondary">Telegram</span><strong className={links.telegram.linked ? 'text-success' : 'text-text-muted'}>{links.telegram.linked ? 'привязан' : 'не привязан'}</strong></div>
      <div className="flex items-center justify-between gap-3 text-[12px]"><span className="text-text-secondary">VK</span>{links.vk ? <a href={links.vk.url} target="_blank" rel="noreferrer" className="truncate font-bold text-success">{links.vk.display_name || 'привязан'}</a> : <strong className="text-text-muted">не привязан</strong>}</div>

      {fullyLinked ? null : <>
        <p className="text-[11px] leading-4 text-text-muted">Отправьте игроку личную ссылку: он откроет её в Telegram или VK, и этот профиль сразу станет его — без ввода ника и без вашего подтверждения. Ссылка одноразовая, действует 14 дней.</p>
        {claim ? <div className="space-y-2 rounded-[12px] bg-surface-2 p-2.5" data-testid="crm-claim-link">
          {claim.telegram_url ? <button type="button" onClick={() => void copyText(claim.telegram_url!)} className="flex min-h-11 w-full items-center gap-2 rounded-[10px] bg-surface-1 px-3 text-left text-[12px] text-text-primary"><Send className="h-4 w-4 shrink-0 text-accent" /><span className="min-w-0 flex-1 truncate">Для Telegram: {claim.telegram_url}</span><Copy className="h-4 w-4 shrink-0 text-text-muted" /></button> : null}
          <button type="button" onClick={() => void copyText(claim.web_url)} className="flex min-h-11 w-full items-center gap-2 rounded-[10px] bg-surface-1 px-3 text-left text-[12px] text-text-primary"><Link2 className="h-4 w-4 shrink-0 text-accent" /><span className="min-w-0 flex-1 truncate">Для VK и браузера: {claim.web_url}</span><Copy className="h-4 w-4 shrink-0 text-text-muted" /></button>
          <p className="text-[11px] text-text-muted">Действует до {day(claim.expires_at)}. Новая ссылка отменяет старую.</p>
        </div> : <button type="button" disabled={Boolean(busy)} onClick={() => void makeLink()} className="min-h-11 w-full rounded-[12px] bg-accent px-3 text-[13px] font-bold text-white disabled:opacity-40">
          {busy === 'claim' ? 'Создаём…' : links.claim_link ? `Новая ссылка для привязки (старая до ${day(links.claim_link.expires_at)})` : 'Ссылка для привязки'}
        </button>}
      </>}

      {links.vk ? null : <div className="flex gap-2">
        <input value={vk} onChange={(event) => setVk(event.target.value)} placeholder="Страница VK: vk.com/…" aria-label="Страница VK игрока" className="mobile-field min-w-0 flex-1" />
        <button type="button" disabled={Boolean(busy) || !vk.trim()} onClick={() => void linkVk()} className="min-h-11 shrink-0 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] font-bold text-text-primary disabled:opacity-40">{busy === 'vk' ? '…' : 'Привязать VK'}</button>
      </div>}

      {note ? <p className="text-[11px] text-success">{note}</p> : null}
      {error ? <p className="rounded-[10px] bg-danger-soft px-2.5 py-2 text-[11px] text-danger">{error}</p> : null}
    </section>
  );
}
