import { useEffect, useState } from 'react';
import { Coins, Pencil, Plus, RefreshCw, Send, Target } from 'lucide-react';
import { MobileSheet } from '../ui/MobileSheet.tsx';

type TokenPackage = {
  id: string;
  title: string;
  token_amount: number;
  price_rub: number;
  active: boolean;
  sort_order: number;
};

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  target_amount_rub: number | null;
  collected_amount_rub: number;
  status: 'draft' | 'active' | 'closed' | string;
  starts_at: string | null;
  ends_at: string | null;
};

type PaymentIntent = {
  id: string;
  nickname: string | null;
  purpose: string;
  amount_rub: number;
  token_amount: number | null;
  status: string;
  description: string;
  created_at: string;
};

type Overview = {
  online_payment: { available: boolean; provider: string | null; setup_required: boolean };
  token_packages: TokenPackage[];
  campaigns: Campaign[];
  recent_intents: PaymentIntent[];
};

type VkStatus = {
  configured: boolean;
  group_id: number | null;
  api_version: string;
  missing: string[];
};

type Sheet = { kind: 'tokens'; item?: TokenPackage } | { kind: 'campaign'; item?: Campaign } | null;

const rubles = (value: number | null | undefined) => `${Math.max(0, Math.trunc(Number(value || 0))).toLocaleString('ru-RU')} ₽`;

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
};

const purposeLabel = (value: string) => value === 'evening'
  ? 'Вечер'
  : value === 'token_topup'
    ? 'Жетоны'
    : value === 'support'
      ? 'Поддержка'
      : value === 'fundraiser'
        ? 'Сбор'
        : value;

export default function CommerceAdminCRM() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [vk, setVk] = useState<VkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [tokenDraft, setTokenDraft] = useState({ title: '', token_amount: '', price_rub: '', active: true });
  const [campaignDraft, setCampaignDraft] = useState({ title: '', description: '', target_amount_rub: '', status: 'draft' });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [commerce, vkStatus] = await Promise.all([
        request('/api/commerce/overview'),
        request('/api/integrations/vk/status').catch(() => null),
      ]);
      setOverview(commerce as Overview);
      setVk(vkStatus as VkStatus | null);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить оплату и интеграции');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openTokens = (item?: TokenPackage) => {
    setTokenDraft({
      title: item?.title || '',
      token_amount: item ? String(item.token_amount) : '',
      price_rub: item ? String(item.price_rub) : '',
      active: item?.active ?? true,
    });
    setSheet({ kind: 'tokens', item });
  };

  const openCampaign = (item?: Campaign) => {
    setCampaignDraft({
      title: item?.title || '',
      description: item?.description || '',
      target_amount_rub: item?.target_amount_rub ? String(item.target_amount_rub) : '',
      status: item?.status || 'draft',
    });
    setSheet({ kind: 'campaign', item });
  };

  const saveTokenPackage = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      await request('/api/commerce/token-packages', {
        method: 'POST',
        body: JSON.stringify({
          id: sheet?.kind === 'tokens' ? sheet.item?.id : undefined,
          title: tokenDraft.title,
          token_amount: Number(tokenDraft.token_amount),
          price_rub: Number(tokenDraft.price_rub),
          active: tokenDraft.active,
        }),
      });
      setSheet(null);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить пакет');
    } finally { setSaving(false); }
  };

  const saveCampaign = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      await request('/api/commerce/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          id: sheet?.kind === 'campaign' ? sheet.item?.id : undefined,
          title: campaignDraft.title,
          description: campaignDraft.description,
          target_amount_rub: campaignDraft.target_amount_rub ? Number(campaignDraft.target_amount_rub) : null,
          status: campaignDraft.status,
        }),
      });
      setSheet(null);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить сбор');
    } finally { setSaving(false); }
  };

  if (loading && !overview) {
    return <div className="flex min-h-[240px] items-center justify-center gap-2 text-[12px] text-text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Загружаем оплату…</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-[14px] bg-danger-soft px-3 py-3 text-[11px] text-danger">{error}</div> : null}

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Онлайн-оплата</div>
            <h3 className="mt-1 text-[16px] font-black text-text-primary">4 разных назначения</h3>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">Вечер · жетоны · поддержка · сбор. Они хранятся раздельно и не подменяют существующий учёт оплат вечера.</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${overview?.online_payment.available ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{overview?.online_payment.available ? 'СБП работает' : 'Провайдер не подключён'}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {['🎟️ Вечер', '🪙 Жетоны', '🖤 Поддержка', '🎯 Сбор'].map((item) => <div key={item} className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[11px] font-bold text-text-primary">{item}</div>)}
        </div>
      </section>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-[14px] font-black text-text-primary">Пакеты жетонов</h3><p className="mt-1 text-[10px] text-text-muted">Цена задаётся здесь, а не в коде. Обратного вывода жетонов в деньги нет.</p></div>
          <button type="button" onClick={() => openTokens()} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-accent px-3 text-[10px] font-bold text-white"><Plus className="h-4 w-4" /> Добавить</button>
        </div>
        <div className="mt-3 space-y-2">
          {overview?.token_packages.length ? overview.token_packages.map((item) => <button key={item.id} type="button" onClick={() => openTokens(item)} className="flex min-h-[58px] w-full items-center gap-3 rounded-[13px] bg-surface-2 px-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent"><Coins className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-text-primary">{item.title}</strong><span className="mt-0.5 block text-[10px] text-text-muted">{item.token_amount.toLocaleString('ru-RU')} 🪙 · {rubles(item.price_rub)} · {item.active ? 'активен' : 'выключен'}</span></span><Pencil className="h-4 w-4 text-text-muted" /></button>) : <div className="rounded-[13px] bg-surface-2 px-3 py-4 text-[11px] text-text-muted">Пакетов пока нет. Никакой курс автоматически не придуман.</div>}
        </div>
      </section>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-[14px] font-black text-text-primary">Целевые сборы</h3><p className="mt-1 text-[10px] text-text-muted">Например, оборудование, турнир или конкретная клубная покупка.</p></div>
          <button type="button" onClick={() => openCampaign()} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[10px] font-bold text-text-primary"><Plus className="h-4 w-4" /> Добавить</button>
        </div>
        <div className="mt-3 space-y-2">
          {overview?.campaigns.length ? overview.campaigns.map((item) => {
            const target = Number(item.target_amount_rub || 0);
            const progress = target > 0 ? Math.min(100, Math.round((item.collected_amount_rub / target) * 100)) : null;
            return <button key={item.id} type="button" onClick={() => openCampaign(item)} className="w-full rounded-[13px] bg-surface-2 p-3 text-left"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning"><Target className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-text-primary">{item.title}</strong><span className="mt-0.5 block text-[10px] text-text-muted">{item.status === 'active' ? 'идёт' : item.status === 'closed' ? 'закрыт' : 'черновик'}{target > 0 ? ` · ${rubles(item.collected_amount_rub)} из ${rubles(target)}` : ''}</span></span><Pencil className="h-4 w-4 text-text-muted" /></div>{progress != null ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-1"><div className="h-full rounded-full bg-warning" style={{ width: `${progress}%` }} /></div> : null}</button>;
          }) : <div className="rounded-[13px] bg-surface-2 px-3 py-4 text-[11px] text-text-muted">Активных или архивных сборов пока нет.</div>}
        </div>
      </section>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Send className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="text-[14px] font-black text-text-primary">VK</h3><p className="mt-1 text-[10px] leading-4 text-text-muted">Серверный адаптер публикации готов. Сам тип публикаций включим после выбора сценария.</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${vk?.configured ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{vk?.configured ? `group ${vk.group_id}` : 'не подключён'}</span></div>
        {!vk?.configured && vk?.missing?.length ? <div className="mt-3 rounded-[12px] bg-surface-2 px-3 py-2 text-[10px] text-text-muted">Для подключения потребуются: {vk.missing.join(', ')}.</div> : null}
      </section>

      {overview?.recent_intents.length ? <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4"><h3 className="text-[14px] font-black text-text-primary">Последние онлайн-платежи</h3><div className="mt-3 space-y-2">{overview.recent_intents.slice(0, 10).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-[12px] bg-surface-2 px-3 py-2.5"><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-text-primary">{item.nickname || 'Игрок'} · {purposeLabel(item.purpose)}</strong><span className="mt-0.5 block truncate text-[9px] text-text-muted">{item.description}</span></span><span className="shrink-0 text-right"><strong className="block text-[11px] text-text-primary">{rubles(item.amount_rub)}</strong><span className="text-[9px] text-text-muted">{item.status}</span></span></div>)}</div></section> : null}

      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-1 text-[11px] font-bold text-text-primary disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button>

      <MobileSheet
        open={sheet?.kind === 'tokens'}
        title={sheet?.kind === 'tokens' && sheet.item ? 'Пакет жетонов' : 'Новый пакет жетонов'}
        subtitle="Жетоны — внутренняя валюта без обратного вывода в деньги."
        onClose={() => setSheet(null)}
        footer={<button type="button" disabled={saving} onClick={() => void saveTokenPackage()} className="min-h-12 w-full rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить пакет'}</button>}
      >
        <div className="space-y-4"><label className="mobile-label">Название<input className="mobile-field mt-1" value={tokenDraft.title} onChange={(event) => setTokenDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Например, 100 жетонов" /></label><label className="mobile-label">Жетонов<input inputMode="numeric" className="mobile-field mt-1" value={tokenDraft.token_amount} onChange={(event) => setTokenDraft((current) => ({ ...current, token_amount: event.target.value }))} placeholder="100" /></label><label className="mobile-label">Цена, ₽<input inputMode="numeric" className="mobile-field mt-1" value={tokenDraft.price_rub} onChange={(event) => setTokenDraft((current) => ({ ...current, price_rub: event.target.value }))} placeholder="300" /></label><label className="flex min-h-12 items-center justify-between rounded-[13px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary"><span>Показывать игрокам</span><input type="checkbox" checked={tokenDraft.active} onChange={(event) => setTokenDraft((current) => ({ ...current, active: event.target.checked }))} /></label></div>
      </MobileSheet>

      <MobileSheet
        open={sheet?.kind === 'campaign'}
        title={sheet?.kind === 'campaign' && sheet.item ? 'Целевой сбор' : 'Новый сбор'}
        subtitle="Сбор не влияет на игровой баланс и хранится отдельно от оплаты вечера."
        onClose={() => setSheet(null)}
        footer={<button type="button" disabled={saving} onClick={() => void saveCampaign()} className="min-h-12 w-full rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить сбор'}</button>}
      >
        <div className="space-y-4"><label className="mobile-label">Название<input className="mobile-field mt-1" value={campaignDraft.title} onChange={(event) => setCampaignDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Например, новый игровой стол" /></label><label className="mobile-label">Описание<textarea className="mobile-field mt-1 min-h-24 resize-y" value={campaignDraft.description} onChange={(event) => setCampaignDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Зачем собираем и что купим" /></label><label className="mobile-label">Цель, ₽ — можно оставить пустой<input inputMode="numeric" className="mobile-field mt-1" value={campaignDraft.target_amount_rub} onChange={(event) => setCampaignDraft((current) => ({ ...current, target_amount_rub: event.target.value }))} placeholder="30000" /></label><label className="mobile-label">Статус<select className="mobile-field mt-1" value={campaignDraft.status} onChange={(event) => setCampaignDraft((current) => ({ ...current, status: event.target.value }))}><option value="draft">Черновик</option><option value="active">Активный</option><option value="closed">Закрыт</option></select></label></div>
      </MobileSheet>
    </div>
  );
}
