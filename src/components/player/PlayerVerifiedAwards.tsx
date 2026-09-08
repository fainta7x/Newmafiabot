import { useEffect, useState } from 'react';

type VerifiedAward = {
  id: string;
  kind: string;
  title: string;
  tournament_name: string | null;
  club_organizer: string | null;
  award_date: string | null;
  award_year: number | null;
  place_result: string | null;
  team_name: string | null;
  description: string | null;
  source: string | null;
  photo_url: string | null;
  source_type: string;
};

const kindIcon = (kind: string) => kind === 'trophy' ? '🏆' : kind === 'medal' ? '🥇' : kind === 'certificate' ? '📜' : kind === 'team' ? '👥' : kind === 'placement' ? '🏅' : '⭐';

export default function PlayerVerifiedAwards() {
  const [awards, setAwards] = useState<VerifiedAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const [comment, setComment] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/verified-awards', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setAwards(Array.isArray(body?.awards) ? body.awards : []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (saving || (!comment.trim() && !tournamentName.trim() && !description.trim())) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/player/award-suggestions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_type: 'new', kind: 'trophy', tournament_name: tournamentName.trim() || null, description: description.trim() || null, photo_url: photoUrl.trim() || null, comment: comment.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить предложение');
      setTournamentName(''); setDescription(''); setPhotoUrl(''); setComment(''); setShowSuggest(false);
      setMessage('Предложение отправлено организатору на проверку');
    } catch (submitError: any) {
      setError(submitError?.message || 'Не удалось отправить предложение');
    } finally { setSaving(false); }
  };

  return (
    <section data-testid="verified-awards" className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-base font-semibold">Официальные награды</h3><p className="mt-1 text-sm leading-5 text-white/50">Только проверенные организатором или подтверждённые завершённым турниром.</p></div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-sm text-white/65">{awards.length}</span>
      </div>
      {message ? <div className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}
      {loading ? <div className="mt-3 py-6 text-center text-sm text-white/45">Загрузка…</div> : awards.length ? (
        <div className="mt-3 space-y-2">
          {awards.map((award) => (
            <article key={award.id} className="rounded-2xl bg-black/20 p-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{kindIcon(award.kind)}</span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-white">{award.title}</div>
                  <div className="mt-1 text-sm leading-5 text-white/55">{[award.tournament_name, award.place_result, award.team_name].filter(Boolean).join(' · ') || 'Подтверждённая награда'}</div>
                  <div className="mt-1 text-xs text-white/40">{award.award_date || award.award_year || ''}{award.source_type === 'historical' ? ' · историческая' : award.source_type === 'automatic' ? ' · из турнирных данных' : ''}</div>
                  {award.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-white/60">{award.description}</p> : null}
                  {award.photo_url ? <img src={award.photo_url} alt={`Награда: ${award.title}`} className="mt-3 max-h-56 w-full rounded-xl object-contain bg-black/30" /> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="mt-3 rounded-2xl bg-black/20 px-3 py-5 text-center text-sm text-white/45">Проверенных наград пока нет.</div>}

      <button type="button" onClick={() => setShowSuggest((value) => !value)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-3 text-sm font-semibold text-white/70">{showSuggest ? 'Скрыть форму' : 'Предложить награду или исправление'}</button>
      {showSuggest ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/15 p-3">
          <p className="text-sm leading-5 text-white/50">Предложение не публикуется автоматически. Организатор проверит данные и при необходимости отредактирует.</p>
          <input value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} placeholder="Турнир / событие" className="mobile-field" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что за награда" className="mobile-field min-h-[88px] resize-y" />
          <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="HTTPS-ссылка на фото — необязательно" className="mobile-field" />
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий организатору" className="mobile-field min-h-[88px] resize-y" />
          <button type="button" disabled={saving || (!comment.trim() && !tournamentName.trim() && !description.trim())} onClick={() => void submit()} className="min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">{saving ? 'Отправляем…' : 'Отправить на проверку'}</button>
        </div>
      ) : null}
    </section>
  );
}
