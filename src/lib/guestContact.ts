export type GuestContactKind = 'vk' | 'telegram' | 'phone';

export const GUEST_CONTACT_OPTIONS: Array<{ kind: GuestContactKind; label: string; placeholder: string }> = [
  { kind: 'vk', label: 'ВКонтакте', placeholder: 'Ссылка или короткое имя, например vk.com/ivan' },
  { kind: 'telegram', label: 'Telegram', placeholder: '@ник' },
  { kind: 'phone', label: 'Телефон', placeholder: '+7 900 000-00-00' },
];

export const guestContactLabel = (kind?: string | null) => GUEST_CONTACT_OPTIONS.find((option) => option.kind === kind)?.label || '';

/** A link the organizer can tap to reach the guest; nothing when the contact is missing. */
export function guestContactHref(kind?: string | null, value?: string | null): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (kind === 'vk') return `https://vk.com/${text.replace(/^(?:https?:\/\/)?(?:www\.)?vk\.com\//i, '').replace(/^@/, '')}`;
  if (kind === 'telegram') return `https://t.me/${text.replace(/^(?:https?:\/\/)?t\.me\//i, '').replace(/^@/, '')}`;
  if (kind === 'phone') return `tel:${text.replace(/[^\d+]/g, '')}`;
  return null;
}
