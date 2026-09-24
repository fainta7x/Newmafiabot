import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import MobileSheet from '../ui/MobileSheet.tsx';
import { prepareGatheredPhoto } from '../../lib/gatheredPhoto.ts';

/** «Мы собрались»: take a photo, check the caption, publish to Telegram and VK — or skip for now. */
export default function GatheredPostSheet({ eveningId, open, onClose, onDone }: {
  eveningId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const pick = async (file?: File | null) => {
    if (!file) return;
    setError('');
    try { setPhoto(await prepareGatheredPhoto(file)); } catch (pickError: any) { setError(pickError?.message || 'Не удалось открыть фото'); }
  };

  const send = async (path: '' | '/skip', body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/gathered-post${path}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Не удалось сохранить');
      if (!path && result?.state !== 'published') {
        throw new Error(`Не удалось опубликовать: ${[result?.telegram_error, result?.vk_error].filter(Boolean).join(' · ') || 'нет доступных каналов'}`);
      }
      setPhoto(null);
      setCaption('');
      onDone();
    } catch (sendError: any) {
      setError(sendError?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet open={open} onClose={() => !busy && onClose()} title="Мы собрались" subtitle="Фото уйдёт в Telegram и ВК. После поста открываются игры вечера."
      footer={<div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" disabled={busy} onClick={() => void send('/skip', { reason: 'Пропущено организатором' })} className="min-h-12 rounded-2xl bg-white/[0.06] px-4 text-[14px] font-medium text-white/60 disabled:opacity-50">Пропустить</button>
        <button type="button" disabled={busy || !photo} onClick={() => void send('', { data_url: photo, caption })} className="min-h-12 rounded-2xl bg-white px-4 text-[14px] font-semibold text-[#090a0d] disabled:bg-white/[0.06] disabled:text-white/30">{busy ? 'Публикуем…' : 'Опубликовать'}</button>
      </div>}>
      <div className="space-y-3">
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
        {photo ? (
          <button type="button" onClick={() => input.current?.click()} className="block w-full overflow-hidden rounded-2xl border border-white/10" aria-label="Переснять фото">
            <img src={photo} alt="Фото вечера" className="max-h-[42vh] w-full object-cover" />
          </button>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-[14px] font-semibold text-white/70">
            <Camera className="h-7 w-7" /> Сделать фото
          </button>
        )}
        <label className="block">
          <span className="text-[12px] font-semibold text-white/45">Подпись (можно оставить пустой — подставим «Мы собрались! …»)</span>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={3} maxLength={900} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[14px] text-white" />
        </label>
        {error ? <p className="rounded-xl bg-rose-300/10 px-3 py-2 text-[13px] text-rose-100">{error}</p> : null}
      </div>
    </MobileSheet>
  );
}
