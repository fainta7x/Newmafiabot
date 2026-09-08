import { useState } from 'react';

export default function PlayerAwardSuggestionAction() {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving || (!comment.trim() && !tournamentName.trim() && !description.trim())) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/player/award-suggestions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_type: 'new',
          kind: 'trophy',
          tournament_name: tournamentName.trim() || null,
          description: description.trim() || null,
          photo_url: photoUrl.trim() || null,
          comment: comment.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить предложение');
      setTournamentName('');
      setDescription('');
      setPhotoUrl('');
      setComment('');
      setOpen(false);
      setMessage('Предложение отправлено организатору на проверку.');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отправить предложение');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-testid="award-suggestion-action" className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
      <div className="text-sm font-semibold">Награда или исправление</div>
      <p className="mt-1 text-xs leading-5 text-white/45">Игрок отправляет только предложение. Проверенной наградой оно станет после подтверждения организатором.</p>
      {message ? <div className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-white/65">{message}</div> : null}
      <button type="button" onClick={() => setOpen((value) => !value)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-3 text-sm font-semibold text-white/70">
        {open ? 'Скрыть форму' : 'Предложить награду или исправление'}
      </button>
      {open ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/15 p-3">
          <input value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} placeholder="Турнир / событие" className="mobile-field" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что за награда или что нужно исправить" className="mobile-field min-h-[88px] resize-y" />
          <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="HTTPS-ссылка на фото — необязательно" className="mobile-field" />
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий организатору" className="mobile-field min-h-[88px] resize-y" />
          <button type="button" disabled={saving || (!comment.trim() && !tournamentName.trim() && !description.trim())} onClick={() => void submit()} className="min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
            {saving ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
