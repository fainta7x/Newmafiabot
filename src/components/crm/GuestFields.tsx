import { GUEST_CONTACT_OPTIONS, type GuestContactKind } from '../../lib/guestContact.ts';

export type GuestDraft = { name: string; kind: GuestContactKind; contact: string; going: boolean; plus: number };
export const EMPTY_GUEST: GuestDraft = { name: '', kind: 'vk', contact: '', going: true, plus: 0 };

/**
 * A guest is a lead (owner, 2026-10-13): a name, how to reach them, and how many people they bring («+1»).
 * Used both to sign a guest up and to edit one later.
 */
export function GuestFields({ draft, onChange, withName = true }: { draft: GuestDraft; onChange: (next: GuestDraft) => void; withName?: boolean }) {
  const option = GUEST_CONTACT_OPTIONS.find((item) => item.kind === draft.kind);
  return <div className="space-y-3" data-testid="guest-form">
    {withName ? <label className="block"><span className="mobile-label">Имя или никнейм гостя</span><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Например, Иван" className="mobile-field mt-1" /></label> : null}
    <div>
      <span className="mobile-label">Как с ним связаться</span>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-[12px] bg-surface-2 p-1">
        {GUEST_CONTACT_OPTIONS.map((item) => <button key={item.kind} type="button" onClick={() => onChange({ ...draft, kind: item.kind })} className={`min-h-11 rounded-[10px] text-[13px] font-bold ${draft.kind === item.kind ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>{item.label}</button>)}
      </div>
      <input value={draft.contact} onChange={(event) => onChange({ ...draft, contact: event.target.value })} placeholder={option?.placeholder} aria-label="Контакт гостя" className="mobile-field mt-2" />
    </div>
    <div>
      <span className="mobile-label">Сколько человек с ним («+1»)</span>
      <div className="mt-1 flex items-center gap-2" data-testid="guest-plus">
        <button type="button" aria-label="Меньше" disabled={draft.plus <= 0} onClick={() => onChange({ ...draft, plus: Math.max(0, draft.plus - 1) })} className="grid h-11 w-11 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-[18px] font-bold disabled:opacity-30">−</button>
        <strong className="min-w-16 text-center text-[16px] text-text-primary">{draft.plus ? `+${draft.plus}` : 'один'}</strong>
        <button type="button" aria-label="Больше" disabled={draft.plus >= 10} onClick={() => onChange({ ...draft, plus: Math.min(10, draft.plus + 1) })} className="grid h-11 w-11 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-[18px] font-bold disabled:opacity-30">+</button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1">
      <button type="button" onClick={() => onChange({ ...draft, going: true })} className={`min-h-11 rounded-[10px] text-[13px] font-bold ${draft.going ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Записан — идёт</button>
      <button type="button" onClick={() => onChange({ ...draft, going: false })} className={`min-h-11 rounded-[10px] text-[13px] font-bold ${!draft.going ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Пока без ответа</button>
    </div>
  </div>;
}
