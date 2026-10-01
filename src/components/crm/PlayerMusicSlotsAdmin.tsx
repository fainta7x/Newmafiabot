import { useEffect, useState } from 'react';

type MusicEntry = { id: string; title: string; source_url: string };
type Slot = { slot: 1 | 2; entry: MusicEntry | null };

const SLOT_LABEL: Record<1 | 2, string> = { 1: 'Музыка для раздачи', 2: 'Музыка для договорки' };
const base = (playerId: string) => `/api/player/music-library/admin/player-slots/${encodeURIComponent(playerId)}`;

/**
 * Owner-only repair of a player's locked music slots (owner, 2026-10-01): a player saves each slot once,
 * so a wrong or dead link is fixed or freed here.
 */
export default function PlayerMusicSlotsAdmin({ playerId }: { playerId: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({ 1: '', 2: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmFree, setConfirmFree] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch(base(playerId), { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить музыку игрока.');
    const next = body.slots as Slot[];
    setSlots(next);
    setDrafts(Object.fromEntries(next.map(({ slot, entry }) => [slot, entry?.source_url || ''])));
  };

  useEffect(() => {
    setSlots(null); setError(null); setNotice(null); setConfirmFree(null);
    void load().catch((loadError: any) => setError(loadError?.message || 'Не удалось загрузить музыку игрока.'));
  }, [playerId]);

  const run = async (key: string, request: () => Promise<Response>, done: string) => {
    if (busy) return;
    setBusy(key); setError(null); setNotice(null);
    try {
      const response = await request();
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить.');
      await load();
      setNotice(done);
    } catch (runError: any) {
      setError(runError?.message || 'Не удалось сохранить.');
    } finally {
      setBusy(null);
      setConfirmFree(null);
    }
  };

  const save = (slot: 1 | 2) => run(`save-${slot}`, () => fetch(`${base(playerId)}/${slot}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: drafts[slot].trim() }),
  }), `${SLOT_LABEL[slot]}: ссылка исправлена.`);

  const free = (slot: 1 | 2) => run(`free-${slot}`, () => fetch(`${base(playerId)}/${slot}`, {
    method: 'DELETE',
    credentials: 'include',
  }), `${SLOT_LABEL[slot]}: слот освобождён, игрок может сохранить новую музыку.`);

  if (!slots) return <div className="py-5 text-center text-[12px] text-text-secondary">{error || 'Загружаем музыку игрока…'}</div>;

  return (
    <div className="space-y-3" data-testid="crm-player-music">
      <p className="text-[12px] leading-4 text-text-muted">Игрок сохраняет свою музыку один раз. Здесь можно исправить неверную ссылку или освободить слот, чтобы игрок сохранил музыку заново.</p>
      {error ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
      {notice ? <div className="rounded-[13px] border border-success/30 bg-success-soft p-3 text-[12px] text-success">{notice}</div> : null}
      {slots.map(({ slot, entry }) => {
        const changed = drafts[slot].trim() && drafts[slot].trim() !== (entry?.source_url || '');
        return (
          <div key={slot} className="space-y-2 rounded-[13px] border border-border-soft bg-surface-2 p-3" data-testid={`crm-player-music-slot-${slot}`}>
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[13px] text-text-primary">{SLOT_LABEL[slot]}</strong>
              <span className="truncate text-[11px] text-text-muted">{entry ? entry.title : 'Пусто'}</span>
            </div>
            <input
              value={drafts[slot]}
              onChange={(event) => setDrafts((current) => ({ ...current, [slot]: event.target.value }))}
              placeholder="Ссылка на трек или плейлист в Яндекс Музыке"
              inputMode="url"
              className="mobile-field"
              aria-label={`${SLOT_LABEL[slot]}: ссылка`}
            />
            <div className="flex gap-2">
              <button type="button" disabled={!changed || busy !== null} onClick={() => void save(slot)} className="min-h-11 flex-1 rounded-[11px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-40">{busy === `save-${slot}` ? 'Сохраняем…' : entry ? 'Исправить ссылку' : 'Сохранить ссылку'}</button>
              {entry ? confirmFree === slot
                ? <button type="button" disabled={busy !== null} onClick={() => void free(slot)} className="min-h-11 rounded-[11px] border border-danger/30 bg-danger-soft px-3 text-[12px] font-semibold text-danger">{busy === `free-${slot}` ? 'Освобождаем…' : 'Точно освободить'}</button>
                : <button type="button" disabled={busy !== null} onClick={() => setConfirmFree(slot)} className="min-h-11 rounded-[11px] border border-border-soft px-3 text-[12px] font-semibold text-text-secondary">Освободить слот</button>
                : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
