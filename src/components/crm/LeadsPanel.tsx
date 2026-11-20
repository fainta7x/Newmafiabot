import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Copy, MoreHorizontal, Plus } from 'lucide-react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import { api, type Player } from '../../lib/api.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import ConfirmDialog from '../ui/ConfirmDialog.tsx';

/**
 * «Лиды» in «Игроки» (owner, 2026-11-16, agreed with mock-ups). Every lead — from the site, the bot or typed here — in one list, a person
 * of less weight than a club player: the stage comes from what already happened (written to, booked, came), «Позвать снова» invites him
 * again before each next novice evening (archived by itself after two invitations), «Сделать игроком» is the organizer's button.
 */
export type Lead = {
  player_id: string; nickname: string; contact_kind: 'vk' | 'telegram' | 'phone'; contact_value: string; source: string | null; source_label: string | null;
  referred_by: string | null; added_by: string; created_at: string; status: 'active' | 'recall' | 'archived' | 'converted'; recall_count: number;
  evening: { id: string; starts_at: string } | null; stage: 'new' | 'written' | 'booked' | 'came'; last_visit_at: string | null; message: string | null;
};
type NoviceEvening = { id: string; starts_at: string; title: string };
type View = 'active' | 'recall' | 'archived';

const STAGE: Record<Lead['stage'], { label: string; tone: string }> = {
  new: { label: 'новый', tone: 'bg-danger-soft text-danger' },
  written: { label: 'написали', tone: 'bg-white/[0.07] text-text-secondary' },
  booked: { label: 'записан', tone: 'bg-success-soft text-success' },
  came: { label: 'пришёл', tone: 'bg-warning-soft text-warning' },
};
const SOURCES: Array<{ id: string; label: string }> = [{ id: 'vk', label: 'ВК' }, { id: 'site', label: 'Сайт' }, { id: 'friend', label: 'Друг' }, { id: 'other', label: 'Другое' }];

const day = (iso: string, withWeekday = false) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...(withWeekday ? { weekday: 'short' } : {}), day: '2-digit', month: '2-digit' }).format(date).replace(',', '');
};
const ago = (iso: string) => {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(hours)) return '';
  if (hours < 1) return 'только что';
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'вчера' : day(iso);
};
const contactText = (lead: Lead) => lead.contact_value.replace(/^https:\/\/vk\.com\//, 'vk.com/');
const chatUrl = (lead: Lead) => lead.contact_kind === 'vk' ? lead.contact_value : lead.contact_kind === 'telegram' ? `https://t.me/${lead.contact_value.replace(/^@/, '')}` : `tel:${lead.contact_value}`;
/** What the organizer pastes: a VK link, @nick / t.me link or a phone. */
export const detectContactKind = (raw: string): Lead['contact_kind'] | null => {
  const text = raw.trim();
  if (/vk\.(com|ru)\//i.test(text)) return 'vk';
  if (/^@|t\.me\/|telegram\.me\//i.test(text)) return 'telegram';
  if (text.replace(/\D/g, '').length >= 10) return 'phone';
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(text)) return 'telegram';
  return null;
};
const KIND_LABEL: Record<Lead['contact_kind'], string> = { vk: 'ВК', telegram: 'Telegram', phone: 'Телефон' };

export function LeadsPanel({ onChanged, onCountChange }: { onChanged?: () => void; onCountChange?: (count: number) => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [evenings, setEvenings] = useState<NoviceEvening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('active');
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<Lead | null>(null);
  const [removing, setRemoving] = useState<Lead | null>(null);
  const [copied, setCopied] = useState('');
  const [bookingLink, setBookingLink] = useState<{ playerId: string; url: string; copied: boolean } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await getJson<{ leads: Lead[]; evenings: NoviceEvening[] }>('/api/crm/leads', 'Не удалось загрузить лидов', { cache: 'no-store' });
      setLeads(Array.isArray(body?.leads) ? body.leads : []); setEvenings(Array.isArray(body?.evenings) ? body.evenings : []); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить лидов'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byView = useMemo(() => ({
    active: leads.filter((lead) => lead.status === 'active'),
    recall: leads.filter((lead) => lead.status === 'recall'),
    archived: leads.filter((lead) => lead.status === 'archived'),
  }), [leads]);
  useEffect(() => { onCountChange?.(byView.active.length); }, [byView.active.length, onCountChange]);

  const act = async (url: string, payload: unknown, fallback: string) => {
    try { await sendJson(url, 'POST', payload, fallback); await load(); onChanged?.(); }
    catch (e) { setError(e instanceof Error ? e.message : fallback); }
  };
  const write = async (lead: Lead) => {
    if (lead.message) { try { await navigator.clipboard.writeText(lead.message); setCopied(lead.player_id); } catch { /* the chat still opens */ } }
    window.open(chatUrl(lead), '_blank', 'noopener');
    if (lead.stage === 'new') void act(`/api/crm/leads/${encodeURIComponent(lead.player_id)}/written`, {}, 'Не удалось отметить');
  };
  const setStatus = (lead: Lead, status: Lead['status']) => act(`/api/crm/leads/${encodeURIComponent(lead.player_id)}/status`, { status }, 'Не удалось изменить статус');
  const createBookingLink = async (lead: Lead) => {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const data = await sendJson<{ url: string }>(`/api/crm/leads/${encodeURIComponent(lead.player_id)}/booking-link`, 'POST', {}, 'Не удалось создать ссылку');
      let copied = false;
      try { await navigator.clipboard.writeText(data.url); copied = true; } catch { /* The selectable field remains available. */ }
      setBookingLink({ playerId: lead.player_id, url: data.url, copied });
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать ссылку'); }
    finally { setLinkBusy(false); }
  };

  const shown = byView[view];
  return (
    <div data-testid="crm-leads" className="space-y-3">
      <button type="button" data-testid="crm-lead-add" onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[15px] font-bold text-white"><Plus className="h-5 w-5" />Новый лид</button>
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Списки лидов">
        {([['active', 'Активные'], ['recall', 'Позвать снова'], ['archived', 'Архив']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`min-h-11 rounded-[12px] border px-1 text-[12px] font-semibold ${view === id ? 'border-white/20 bg-surface-2 text-text-primary' : 'border-border-soft text-text-muted'}`}>{label} {byView[id].length}</button>
        ))}
      </div>
      {error ? <div role="alert" className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</div> : null}
      {loading ? <p className="py-10 text-center text-[13px] text-text-secondary">Загружаем лидов…</p> : shown.length === 0 ? (
        <p className="rounded-[16px] border border-border-soft bg-surface-1 px-4 py-10 text-center text-[13px] text-text-muted">{view === 'active' ? 'Лидов пока нет. Добавьте человека кнопкой выше.' : view === 'recall' ? 'Здесь те, у кого сорвалось: перед следующим вечером новичков они появятся в «Делах».' : 'Архив пуст.'}</p>
      ) : shown.map((lead) => (
        <article key={lead.player_id} data-testid={`crm-lead-${lead.player_id}`} className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <strong className="block break-words text-[15px] text-text-primary">{lead.nickname}</strong>
              <span className="mt-0.5 block break-words text-[12px] text-text-muted">{contactText(lead)}{lead.source_label ? ` · ${lead.source === 'friend' && lead.referred_by ? `друг: ${lead.referred_by}` : lead.source_label}` : lead.referred_by ? ` · пригласил: ${lead.referred_by}` : ''} · {ago(lead.created_at)}</span>
              <span className="mt-0.5 block text-[12px] text-text-muted">
                {lead.status === 'recall' ? (lead.recall_count ? `Позвали снова: ${lead.recall_count} из 2` : 'Позовём перед следующим вечером новичков')
                  : lead.stage === 'came' && lead.last_visit_at ? `Был на вечере ${day(lead.last_visit_at)}`
                  : lead.evening ? `${day(lead.evening.starts_at, true)} · вечер новичков` : 'Пока никуда не записан'}
              </span>
            </div>
            {lead.status === 'active' ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE[lead.stage].tone}`}>{STAGE[lead.stage].label}</span> : null}
          </div>
          <div className="mt-2.5 grid grid-cols-[1fr_1fr_44px] gap-2">
            {lead.status === 'archived' ? (
              <button type="button" onClick={() => void setStatus(lead, 'active')} className="col-span-2 min-h-11 rounded-[11px] border border-border-soft text-[13px] font-semibold text-text-primary">Вернуть в активные</button>
            ) : lead.stage === 'came' && lead.status === 'active' ? (
              <>
                <button type="button" data-testid={`crm-lead-convert-${lead.player_id}`} onClick={() => void setStatus(lead, 'converted')} className="min-h-11 rounded-[11px] bg-accent text-[13px] font-bold text-white">Сделать игроком</button>
                <button type="button" onClick={() => void write(lead)} className="min-h-11 rounded-[11px] border border-border-soft text-[13px] font-semibold text-text-primary">Написать</button>
              </>
            ) : (
              <>
                <button type="button" data-testid={`crm-lead-write-${lead.player_id}`} onClick={() => void write(lead)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-[11px] bg-accent text-[13px] font-bold text-white">{copied === lead.player_id ? <><Copy className="h-4 w-4" />Скопировано</> : 'Написать'}</button>
                {lead.status === 'recall'
                  ? <button type="button" onClick={() => void setStatus(lead, 'archived')} className="min-h-11 rounded-[11px] border border-border-soft text-[13px] font-semibold text-text-primary">В архив</button>
                  : <button type="button" data-testid={`crm-lead-recall-${lead.player_id}`} onClick={() => void setStatus(lead, 'recall')} className="min-h-11 rounded-[11px] border border-border-soft text-[13px] font-semibold text-text-primary">Позвать снова</button>}
              </>
            )}
            <button type="button" aria-label={`Ещё: ${lead.nickname}`} onClick={() => setMenuFor(lead)} className="grid min-h-11 place-items-center rounded-[11px] border border-border-soft text-text-secondary"><MoreHorizontal className="h-5 w-5" /></button>
          </div>
        </article>
      ))}

      <LeadForm open={adding} evenings={evenings} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setView('active'); void load(); onChanged?.(); }} />

      <MobileSheet open={Boolean(menuFor)} onClose={() => setMenuFor(null)} title={menuFor?.nickname || ''} widthClass="sm:max-w-md">
        {menuFor ? <div className="space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="text-[12px] font-semibold text-text-muted">Записать на вечер новичков</div>
          {evenings.length ? evenings.map((evening) => (
            <button key={evening.id} type="button" onClick={() => { const lead = menuFor; setMenuFor(null); void act(`/api/crm/leads/${encodeURIComponent(lead.player_id)}/book`, { evening_id: evening.id }, 'Не удалось записать'); }}
              className={`flex min-h-11 w-full items-center justify-between rounded-[12px] border px-3 text-[13px] font-semibold ${menuFor.evening?.id === evening.id ? 'border-success/40 text-success' : 'border-border-soft text-text-primary'}`}>
              {day(evening.starts_at, true)} · вечер новичков{menuFor.evening?.id === evening.id ? <span>записан</span> : null}
            </button>
          )) : <p className="text-[12px] text-text-muted">Открытых вечеров новичков пока нет.</p>}
          <div className="space-y-2 border-t border-border-soft pt-3">
            <button type="button" disabled={linkBusy} onClick={() => void createBookingLink(menuFor)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold text-text-primary disabled:opacity-50"><Copy className="h-4 w-4" />{linkBusy ? 'Создаём ссылку…' : 'Создать новую ссылку на запись'}</button>
            <p className="text-[12px] leading-5 text-text-muted">По ней человек сможет сам отменить или перенести запись без входа. Новая ссылка заменяет предыдущую.</p>
            {bookingLink?.playerId === menuFor.player_id ? <div className="space-y-2"><label className="block text-[12px] text-text-secondary">Ссылка на запись<input readOnly value={bookingLink.url} onFocus={event => event.currentTarget.select()} className="mt-1 min-h-11 w-full rounded-[10px] border border-border-soft bg-surface-1 px-3 text-[12px] text-text-primary" /></label><p role="status" className="text-[12px] text-success">{bookingLink.copied ? 'Ссылка скопирована. Отправь её человеку.' : 'Скопируй ссылку и отправь её человеку.'}</p></div> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {menuFor.status !== 'archived' ? <button type="button" onClick={() => { const lead = menuFor; setMenuFor(null); void setStatus(lead, 'archived'); }} className="min-h-11 rounded-[12px] border border-border-soft text-[13px] font-semibold text-text-primary">В архив</button> : null}
            {menuFor.status === 'active' && menuFor.stage !== 'came' ? <button type="button" onClick={() => { const lead = menuFor; setMenuFor(null); void setStatus(lead, 'converted'); }} className="min-h-11 rounded-[12px] border border-border-soft text-[13px] font-semibold text-text-primary">Сделать игроком</button> : null}
            <button type="button" onClick={() => { setRemoving(menuFor); setMenuFor(null); }} className="min-h-11 rounded-[12px] border border-danger/35 text-[13px] font-semibold text-danger">Удалить</button>
          </div>
        </div> : null}
      </MobileSheet>
      <ConfirmDialog open={Boolean(removing)} title={removing ? `Удалить лида «${removing.nickname}»?` : 'Удалить лида?'} description="Для дублей и ошибочных записей. Бронь снимется. Того, кто уже был на вечере или платил, удалить нельзя — его можно отправить в архив."
        confirmLabel="Удалить" tone="danger" onCancel={() => setRemoving(null)}
        onConfirm={async () => { const lead = removing; setRemoving(null); if (lead) await act('/api/crm/agenda/lead-remove', { player_id: lead.player_id }, 'Не удалось удалить'); }} />
    </div>
  );
}

function LeadForm({ open, evenings, onClose, onSaved }: { open: boolean; evenings: NoviceEvening[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [eveningId, setEveningId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [inviterQuery, setInviterQuery] = useState('');
  const [inviter, setInviter] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kind = detectContactKind(contact);
  // The source follows the pasted link until the organizer picks one himself.
  const [sourceTouched, setSourceTouched] = useState(false);
  const shownSource = sourceTouched ? source : kind === 'vk' ? 'vk' : source;

  useEffect(() => {
    if (!open) return;
    setName(''); setContact(''); setEveningId(evenings[0]?.id ?? null); setSource(null); setSourceTouched(false); setInviter(null); setInviterQuery(''); setError('');
    void api.getPlayers().then((items) => setPlayers(items)).catch(() => setPlayers([]));
  }, [open, evenings]);
  const matches = useMemo(() => {
    const q = inviterQuery.trim().toLocaleLowerCase('ru-RU');
    if (!q || inviter) return [];
    return players.filter((player) => player.nickname.toLocaleLowerCase('ru-RU').includes(q)).slice(0, 5);
  }, [players, inviterQuery, inviter]);

  const canSave = name.trim().length >= 2 && Boolean(kind) && eveningId !== undefined;
  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true); setError('');
    try {
      await sendJson('/api/crm/leads', 'POST', {
        name: name.trim(), contact: contact.trim(), source: shownSource, referred_by_player_id: inviter?.id ?? null,
        ...(eveningId ? { evening_id: eveningId } : { no_evening: true }),
      }, 'Не удалось добавить лида');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось добавить лида'); }
    finally { setSaving(false); }
  };

  const chip = (on: boolean) => `min-h-11 rounded-[12px] border px-3 text-[13px] font-semibold ${on ? 'border-white/30 bg-surface-2 text-text-primary' : 'border-border-soft text-text-secondary'}`;
  return (
    <MobileSheet open={open} onClose={onClose} title="Новый лид" widthClass="sm:max-w-md"
      footer={<button type="button" data-testid="crm-lead-save" disabled={!canSave || saving} onClick={() => void save()} className="min-h-12 w-full rounded-[13px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : eveningId ? 'Добавить и записать' : 'Добавить'}</button>}>
      <div className="space-y-4">
        {error ? <div role="alert" className="rounded-[12px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Как обращаться</span>
          <input data-testid="crm-lead-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Иван" className="mobile-field" /></label>
        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Как связаться</span>
          <span className="relative block">
            <input data-testid="crm-lead-contact" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Ссылка ВК, @ник или телефон" className="mobile-field pr-24" />
            {kind ? <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[8px] bg-sky-400/15 px-2 py-0.5 text-[11px] font-bold text-sky-200">{KIND_LABEL[kind]}</span> : null}
          </span></label>
        <div><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Куда записать</span>
          <div className="flex flex-wrap gap-2">
            {evenings.map((evening) => <button key={evening.id} type="button" aria-pressed={eveningId === evening.id} onClick={() => setEveningId(evening.id)} className={chip(eveningId === evening.id)}>{day(evening.starts_at, true)} · новички</button>)}
            <button type="button" aria-pressed={eveningId === null} onClick={() => setEveningId(null)} className={chip(eveningId === null)}>Пока никуда</button>
          </div></div>
        <div><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Откуда пришёл <span className="font-normal text-text-muted">· необязательно</span></span>
          <div className="flex flex-wrap gap-2">{SOURCES.map((item) => <button key={item.id} type="button" aria-pressed={shownSource === item.id} onClick={() => { setSourceTouched(true); setSource(shownSource === item.id ? null : item.id); }} className={chip(shownSource === item.id)}>{item.label}</button>)}</div></div>
        <div><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Кто пригласил <span className="font-normal text-text-muted">· необязательно</span></span>
          {inviter ? <button type="button" onClick={() => { setInviter(null); setInviterQuery(''); }} className="flex min-h-11 w-full items-center justify-between rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold text-text-primary">{inviter.nickname}<span className="text-text-muted">✕</span></button>
            : <input value={inviterQuery} onChange={(event) => setInviterQuery(event.target.value)} placeholder="Игрок клуба" className="mobile-field" />}
          {matches.length ? <div className="mt-1.5 space-y-1">{matches.map((player) => <button key={player.id} type="button" onClick={() => { setInviter(player); if (!sourceTouched) { setSourceTouched(true); setSource('friend'); } }} className="flex min-h-11 w-full items-center rounded-[11px] border border-border-soft px-3 text-[13px] text-text-primary">{player.nickname}</button>)}</div> : null}
        </div>
      </div>
    </MobileSheet>
  );
}
