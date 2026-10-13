import { useState } from 'react';
import { openDirectContact, type DirectContact } from '../../lib/directContact.ts';

/** Small «ВК» / «Telegram» buttons that copy the invitation text and open the dialog from the sender's own account. */
export default function DirectContactButtons({ contact, text, className = '' }: { contact: DirectContact | null | undefined; text: string; className?: string }) {
  const [note, setNote] = useState('');
  if (!contact || (!contact.vk_url && !contact.telegram_url)) return null;
  const open = async (url: string) => {
    const copied = await openDirectContact(url, text);
    setNote(copied ? 'Текст скопирован — вставь его в диалог' : 'Открыли диалог');
    window.setTimeout(() => setNote(''), 4000);
  };
  const button = 'min-h-11 min-w-11 rounded-xl border border-white/15 bg-white/[.06] px-3 text-xs font-semibold text-white';
  return <div className={className} data-testid="direct-contact">
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-white/40">Написать лично:</span>
      {contact.vk_url ? <button type="button" onClick={() => void open(contact.vk_url!)} className={button}>ВК</button> : null}
      {contact.telegram_url ? <button type="button" onClick={() => void open(contact.telegram_url!)} className={button}>Telegram</button> : null}
    </div>
    {note ? <div className="mt-1 text-[11px] text-emerald-300" role="status">{note}</div> : null}
  </div>;
}
