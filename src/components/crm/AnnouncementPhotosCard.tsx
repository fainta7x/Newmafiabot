import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';

/**
 * «Фото для анонсов» (owner request 2026-09-29): club photos shown above Telegram announcements.
 * The browser shrinks each photo to 1280 px JPEG before upload, so a phone photo stays small.
 */
type Audience = 'all' | 'NOVICE' | 'CASUAL' | 'RATING';
type Photo = { id: string; audience: Audience; url: string; size: number };

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string }> = [
  { value: 'all', label: 'Для всех вечеров' },
  { value: 'NOVICE', label: 'Для новичков' },
  { value: 'CASUAL', label: 'Для клубных' },
  { value: 'RATING', label: 'Для рейтинга и турниров' },
];

const MAX_SIDE = 1280;

const shrinkToJpeg = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог обработать фото');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
  if (!blob) throw new Error('Браузер не смог сжать фото');
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < buffer.length; index += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не получилось');
  return data;
};

export function AnnouncementPhotosCard() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [audience, setAudience] = useState<Audience>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await request('/api/announcement-photos');
      setPhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить фото');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    setError('');
    try {
      for (const file of Array.from(files)) {
        const data = await shrinkToJpeg(file);
        await request('/api/announcement-photos', { method: 'POST', body: JSON.stringify({ data, audience }) });
      }
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Не удалось загрузить фото');
    } finally {
      if (input.current) input.current.value = '';
      setBusy(null);
      await load();
    }
  };

  const changeAudience = async (photo: Photo, next: Audience) => {
    setBusy(photo.id);
    setError('');
    try {
      await request(`/api/announcement-photos/${encodeURIComponent(photo.id)}`, { method: 'PATCH', body: JSON.stringify({ audience: next }) });
      setPhotos((current) => current.map((item) => (item.id === photo.id ? { ...item, audience: next } : item)));
    } catch (changeError: any) {
      setError(changeError?.message || 'Не удалось изменить фото');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (photo: Photo) => {
    if (!window.confirm('Удалить это фото? Уже вышедшие анонсы не изменятся.')) return;
    setBusy(photo.id);
    setError('');
    try {
      await request(`/api/announcement-photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE' });
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить фото');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4" data-testid="announcement-photos">
      <strong className="text-[14px] text-text-primary">Фото для анонсов</strong>
      <p className="mt-1 text-[11px] leading-5 text-text-secondary">
        Фото встаёт большой картинкой над анонсом в Telegram. Для каждого вечера берётся одно из подходящих фото. Если фото нет — анонс выходит без картинки.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}
          aria-label="Для каких вечеров новые фото"
          className="min-h-11 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] text-text-primary">
          {AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" disabled={Boolean(busy)} onClick={() => input.current?.click()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50">
          {busy === 'upload' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy === 'upload' ? 'Загружаем…' : 'Добавить фото'}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
          data-testid="announcement-photos-input" onChange={(event) => void upload(event.target.files)} />
      </div>

      {error ? <div className="mt-2 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}

      {loading ? (
        <p className="mt-3 text-[12px] text-text-secondary">Загружаем…</p>
      ) : photos.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-[12px] border border-border-soft bg-surface-2">
              <img src={photo.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              <div className="flex items-center gap-1 p-1.5">
                <select value={photo.audience} disabled={busy === photo.id}
                  onChange={(event) => void changeAudience(photo, event.target.value as Audience)}
                  aria-label="Для каких вечеров"
                  className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-border-soft bg-surface-1 px-2 text-[11px] text-text-primary">
                  {AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" disabled={busy === photo.id} onClick={() => void remove(photo)} aria-label="Удалить фото"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-danger disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-text-secondary">Фото пока нет.</p>
      )}
    </section>
  );
}

export default AnnouncementPhotosCard;
