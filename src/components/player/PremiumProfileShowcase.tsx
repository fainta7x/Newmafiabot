import { useEffect, useMemo, useState } from 'react';

type Award = {
  id: string; kind: string; title: string; tournament_name?: string | null; award_date?: string | null; award_year?: number | null;
  place_result?: string | null; team_name?: string | null; description?: string | null; photo_url?: string | null; pinned_position?: number | null;
};
type Achievement = { id: string; name: string; description: string; icon: string; rarity_name: string; earned_at: string | null; category_name?: string };
type TimelineItem = { id: string; type: string; date: string | null; icon: string; title: string; description: string | null };
type Showcase = {
  awards: Award[]; pinned_awards: Award[]; earned_achievements: Achievement[]; timeline: TimelineItem[];
  achievements: { earned: number; total: number; percentage: number };
  stats: { verified_awards: number; achievements_earned: number; achievements_total: number; completed_games: number; manual_milestones: number };
};

const formatDate = (value: string | null | undefined) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('ru-RU') : null;

export default function PremiumProfileShowcase({ playerId, isSelf }: { playerId: string; isSelf: boolean }) {
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    void fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/showcase`, { credentials: 'include' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить награды'); return body as Showcase; })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить награды'); });
    return () => { cancelled = true; };
  }, [playerId, nonce]);

  const pinnedIds = useMemo(() => (data?.pinned_awards || []).sort((a, b) => Number(a.pinned_position || 0) - Number(b.pinned_position || 0)).map((item) => item.id), [data]);
  const togglePin = async (awardId: string) => {
    if (!data || busy) return;
    const current = pinnedIds.includes(awardId) ? pinnedIds.filter((id) => id !== awardId) : [...pinnedIds, awardId];
    if (current.length > 3) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/awards/pins`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ award_ids: current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось закрепить награды');
      setNonce((value) => value + 1);
    } catch (pinError: any) { setError(pinError?.message || 'Не удалось закрепить награды'); }
    finally { setBusy(false); }
  };

  if (error && !data) return <section className="rounded-3xl border border-rose-300/15 bg-rose-300/[0.06] p-4 text-sm text-rose-100/80"><p>{error}</p><button type="button" onClick={() => setNonce((value) => value + 1)} className="mt-3 min-h-11 rounded-xl border border-white/10 px-4 font-semibold">Повторить</button></section>;
  if (!data) return <section className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm text-white/45">Загружаем награды и историю клуба…</section>;

  return <div data-testid="premium-profile-showcase" className="space-y-3">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-amber-100/[0.07] to-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Витрина наград</h2><p className="mt-1 text-sm text-white/45">Только проверенные достижения и официальные результаты.</p></div><span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs text-white/55">{data.stats.verified_awards}</span></div>
      {error ? <p className="mt-3 text-xs text-rose-200/70">{error}</p> : null}
      {data.awards.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{data.awards.map((award) => {
        const pinned = pinnedIds.includes(award.id);
        return <article key={award.id} className={`overflow-hidden rounded-2xl border p-3 ${pinned ? 'border-amber-200/20 bg-amber-200/[0.07]' : 'border-white/[0.06] bg-black/20'}`}>
          {award.photo_url ? <img src={award.photo_url} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" /> : null}
          <div className="flex items-start gap-2"><span className="text-lg" aria-hidden="true">🏆</span><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{award.title}</div><div className="mt-1 text-xs leading-5 text-white/40">{[award.tournament_name, award.place_result, formatDate(award.award_date) || award.award_year].filter(Boolean).join(' · ') || 'Проверенная награда'}</div>{award.description ? <p className="mt-2 text-xs leading-5 text-white/45">{award.description}</p> : null}</div></div>
          {isSelf ? <button type="button" disabled={busy || (!pinned && pinnedIds.length >= 3)} onClick={() => void togglePin(award.id)} className="mt-3 min-h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/65 disabled:opacity-35">{pinned ? `Закреплено #${pinnedIds.indexOf(award.id) + 1} · убрать` : pinnedIds.length >= 3 ? 'Уже закреплено 3' : 'Закрепить в профиле'}</button> : null}
        </article>;
      })}</div> : <div className="mt-4 rounded-2xl bg-black/20 p-5 text-center text-sm text-white/40">Проверенных наград пока нет.</div>}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Достижения приложения</h2><p className="mt-1 text-sm text-white/45">Автоматические игровые достижения.</p></div><strong className="text-sm tabular-nums">{data.achievements.earned}/{data.achievements.total}</strong></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(0, Math.min(100, data.achievements.percentage))}%` }} /></div>
      {data.earned_achievements.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{data.earned_achievements.map((item) => <article key={item.id} className="rounded-2xl bg-black/20 p-3"><div className="text-sm font-semibold">{item.icon} {item.name}</div><div className="mt-1 text-[11px] uppercase tracking-wide text-white/30">{item.rarity_name}</div><p className="mt-2 text-xs leading-5 text-white/45">{item.description}</p></article>)}</div> : <div className="mt-3 rounded-2xl bg-black/20 p-5 text-center text-sm text-white/40">Первое достижение ещё впереди.</div>}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <h2 className="text-lg font-semibold">История в клубе</h2><p className="mt-1 text-sm text-white/45">Игры, проверенные награды, достижения и подтверждённые этапы.</p>
      {data.timeline.length ? <div className="relative mt-4 space-y-1 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-white/10">{data.timeline.map((item) => <div key={`${item.type}:${item.id}`} className="relative flex gap-3 rounded-2xl p-2"><div className="z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-[#111218] text-sm">{item.icon}</div><div className="min-w-0 flex-1 pb-2"><div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-sm font-semibold">{item.title}</div>{formatDate(item.date) ? <time className="text-[11px] text-white/30">{formatDate(item.date)}</time> : null}</div>{item.description ? <p className="mt-1 text-xs leading-5 text-white/45">{item.description}</p> : null}</div></div>)}</div> : <div className="mt-3 rounded-2xl bg-black/20 p-5 text-center text-sm text-white/40">История клуба появится после первых подтверждённых событий.</div>}
    </section>
  </div>;
}
