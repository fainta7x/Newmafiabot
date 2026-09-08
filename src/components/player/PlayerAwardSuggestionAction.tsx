import { useEffect, useMemo, useState } from 'react';

type VerifiedAward = {
  id: string;
  kind: string;
  title: string;
  tournament_name?: string | null;
  award_date?: string | null;
  award_year?: number | null;
  place_result?: string | null;
  team_name?: string | null;
  description?: string | null;
  source?: string | null;
  photo_url?: string | null;
};

export default function PlayerAwardSuggestionAction() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'new' | 'correction'>('new');
  const [awards, setAwards] = useState<VerifiedAward[]>([]);
  const [selectedAwardId, setSelectedAwardId] = useState('');
  const [comment, setComment] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/verified-awards', { credentials: 'include' })
      .then(async (response) => response.ok ? response.json() : { awards: [] })
      .then((body) => { if (!cancelled) setAwards(Array.isArray(body?.awards) ? body.awards : []); })
      .catch(() => { if (!cancelled) setAwards([]); });
    return () => { cancelled = true; };
  }, []);

  const selectedAward = useMemo(() => awards.find((award) => award.id === selectedAwardId) || null, [awards, selectedAwardId]);

  const selectMode = (next: 'new' | 'correction') => {
    setMode(next);
    setMessage('');
    if (next === 'new') setSelectedAwardId('');
  };

  const submit = async () => {
    if (saving || (mode === 'correction' && !selectedAward)) return;
    if (!comment.trim() && !tournamentName.trim() && !description.trim() && !photoUrl.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/player/award-suggestions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_type: mode,
          award_id: mode === 'correction' ? selectedAward?.id : null,
          kind: selectedAward?.kind || 'trophy',
          tournament_name: tournamentName.trim() || selectedAward?.tournament_name || null,
          award_date: selectedAward?.award_date || null,
          award_year: selectedAward?.award_year || null,
          place_result: selectedAward?.place_result || null,
          team_name: selectedAward?.team_name || null,
          description: description.trim() || selectedAward?.description || null,
          source: selectedAward?.source || null,
          photo_url: photoUrl.trim() || selectedAward?.photo_url || null,
          comment: comment.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить предложение');
      setTournamentName('');
      setDescription('');
      setPhotoUrl('');
      setComment('');
      setSelectedAwardId('');
      setMode('new');
      setOpen(false);
      setMessage(mode === 'correction' ? 'Исправление отправлено организатору на проверку.' : 'Предложение отправлено организатору на проверку.');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отправить предложение');
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || (mode === 'correction' && !selectedAward) || (!comment.trim() && !tournamentName.trim() && !description.trim() && !photoUrl.trim());

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
          <div className="grid grid-cols-2 gap-2" aria-label="Тип предложения">
            <button type="button" onClick={() => selectMode('new')} className={`min-h-10 rounded-xl px-3 text-xs font-semibold ${mode === 'new' ? 'bg-white text-black' : 'border border-white/10 text-white/60'}`}>Новая награда</button>
            <button type="button" onClick={() => selectMode('correction')} className={`min-h-10 rounded-xl px-3 text-xs font-semibold ${mode === 'correction' ? 'bg-white text-black' : 'border border-white/10 text-white/60'}`}>Исправление</button>
          </div>
          {mode === 'correction' ? (
            awards.length ? <label className="block text-xs text-white/50">Что исправить
              <select aria-label="Награда для исправления" value={selectedAwardId} onChange={(event) => setSelectedAwardId(event.target.value)} className="mobile-field mt-1 w-full text-sm">
                <option value="">Выбери проверенную награду</option>
                {awards.map((award) => <option key={award.id} value={award.id}>{award.title}{award.tournament_name ? ` · ${award.tournament_name}` : ''}</option>)}
              </select>
            </label> : <div className="rounded-xl bg-white/[0.04] p-3 text-xs text-white/45">Проверенных наград для исправления пока нет.</div>
          ) : null}
          <input value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} placeholder="Турнир / событие" className="mobile-field" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={mode === 'correction' ? 'Что нужно исправить' : 'Что за награда'} className="mobile-field min-h-[88px] resize-y" />
          <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="HTTPS-ссылка на фото — необязательно" className="mobile-field" />
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий организатору" className="mobile-field min-h-[88px] resize-y" />
          <button type="button" disabled={disabled} onClick={() => void submit()} className="min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">
            {saving ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
