import { useEffect, useState } from 'react';
import MobileSheet from '../ui/MobileSheet.tsx';

type Game = { number: number; starts_at: string; registered: number; target: number };

const time = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** «Сегодня играем»: pick the game everyone is expected at, check the text, publish to Telegram and VK. */
export default function TodayPostSheet({ eveningId, open, onClose, onDone }: {
  eveningId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadDraft = async (number: number | null) => {
    setError('');
    try {
      const query = number ? `?game=${number}` : '';
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/today-post${query}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось подготовить пост');
      setGames(body?.draft?.games || []);
      setGame(body?.draft?.game_number ?? null);
      // A post that reached only one channel is retried with the text that went out.
      setText(body?.state === 'partial' && body?.text ? String(body.text) : String(body?.draft?.text || ''));
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось подготовить пост');
    }
  };

  useEffect(() => { if (open) void loadDraft(null); }, [open, eveningId]);

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/today-post`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, game_number: game }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Не удалось опубликовать');
      if (!['published', 'partial'].includes(result?.state)) {
        throw new Error(`Не удалось опубликовать: ${[result?.telegram_error, result?.vk_error].filter(Boolean).join(' · ') || 'нет доступных каналов'}`);
      }
      onDone();
    } catch (sendError: any) {
      setError(sendError?.message || 'Не удалось опубликовать');
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/today-post/skip`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || 'Не удалось сохранить решение');
      onDone();
    } catch (skipError: any) {
      setError(skipError?.message || 'Не удалось сохранить решение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet open={open} onClose={() => !busy && onClose()} title="Сегодня играем" subtitle="Пост уйдёт в Telegram-группу вечера и в ВК. Текст можно поправить."
      footer={<div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" disabled={busy} onClick={() => void skip()} className="min-h-12 rounded-2xl bg-white/[0.06] px-4 text-[14px] font-medium text-white/60 disabled:opacity-50">Не публикуем</button>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void publish()} className="min-h-12 rounded-2xl bg-white px-4 text-[14px] font-semibold text-[#090a0d] disabled:bg-white/[0.08] disabled:text-white/35">{busy ? 'Публикуем…' : 'Опубликовать'}</button>
      </div>}>
      <div className="space-y-3" data-testid="today-post-sheet">
        {games.length ? (
          <div>
            <span className="text-[12px] font-semibold text-white/45">Ждём всех к игре</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {games.map((item) => (
                <button key={item.number} type="button" disabled={busy} onClick={() => void loadDraft(item.number)}
                  className={`min-h-10 rounded-xl border px-3 text-[13px] font-semibold ${game === item.number ? 'border-white bg-white text-[#090a0d]' : 'border-white/10 bg-white/[0.04] text-white/75'}`}>
                  {item.number}-я · {time(item.starts_at)}{item.registered >= item.target ? ' ✓' : ` · ${item.registered}/${item.target}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="block">
          <span className="text-[12px] font-semibold text-white/45">Текст поста</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={14} maxLength={3500} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[14px] leading-5 text-white" />
        </label>
        {error ? <p className="rounded-xl bg-rose-300/10 px-3 py-2 text-[13px] text-rose-100">{error}</p> : null}
      </div>
    </MobileSheet>
  );
}
