import { useEffect, useState } from 'react';
import MobileSheet from '../ui/MobileSheet.tsx';

/** Cancelling from «Сбор»: check the text of the post, then cancel — players are told and the group and VK get the post. */
export default function CancelEveningSheet({ eveningId, open, onClose, onDone }: {
  eveningId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    void fetch(`/api/evenings/${encodeURIComponent(eveningId)}/cancel-post`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось подготовить пост');
        setText(String(body?.draft?.text || ''));
      })
      .catch((loadError: any) => setError(loadError?.message || 'Не удалось подготовить пост'));
  }, [open, eveningId]);

  const cancel = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/cancel`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Не удалось отменить вечер');
      onDone();
    } catch (cancelError: any) {
      setError(cancelError?.message || 'Не удалось отменить вечер');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet open={open} onClose={() => !busy && onClose()} title="Отменить вечер" subtitle="Все, кто записался, получат сообщение. Пост уйдёт в Telegram-группу этого вечера и в ВК. Другие вечера не затрагиваются."
      footer={<div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-2xl bg-white/[0.06] px-4 text-[14px] font-medium text-white/60 disabled:opacity-50">Назад</button>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void cancel()} className="min-h-12 rounded-2xl bg-rose-300 px-4 text-[14px] font-semibold text-[#1a0a0d] disabled:bg-white/[0.08] disabled:text-white/35">{busy ? 'Отменяем…' : 'Отменить вечер и сообщить'}</button>
      </div>}>
      <div className="space-y-3" data-testid="cancel-evening-sheet">
        <label className="block">
          <span className="text-[12px] font-semibold text-white/45">Текст поста</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} maxLength={3500} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[14px] leading-5 text-white" />
        </label>
        {error ? <p className="rounded-xl bg-rose-300/10 px-3 py-2 text-[13px] text-rose-100">{error}</p> : null}
      </div>
    </MobileSheet>
  );
}
