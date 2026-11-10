import { useEffect, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';

/** Official (verified) awards of one player: list, manual add, import of the old ones and the player's own suggestions to approve. */
const SOURCE_LABEL: Record<string, string> = { automatic: 'получена автоматически из турнира', historical: 'добавлена вручную', manual: 'добавлена вручную', imported: 'из архива' };

export default function PlayerAwardsPanel({ playerId }: { playerId: string }) {
  const [awards, setAwards] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [tournament, setTournament] = useState('');
  const [result, setResult] = useState('');
  const [kind, setKind] = useState('trophy');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const body = await getJson<any>(`/api/players/${encodeURIComponent(playerId)}/profile-integrity`, 'Не удалось загрузить награды');
      setAwards(Array.isArray(body?.awards) ? body.awards : []);
      setSuggestions(Array.isArray(body?.suggestions) ? body.suggestions : []);
    } catch (loadError: any) { setError(loadError?.message || 'Не удалось загрузить награды'); }
  };
  useEffect(() => { setAwards([]); setSuggestions([]); setShowForm(false); void load(); }, [playerId]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (busy) return; setBusy(true); setError(null);
    try { await action(); await load(); } catch (cause: any) { setError(cause?.message || fallback); } finally { setBusy(false); }
  };
  const create = () => run(async () => {
    await sendJson(`/api/players/${encodeURIComponent(playerId)}/verified-awards`, 'POST', { kind, title: title.trim(), tournament_name: tournament.trim() || null, place_result: result.trim() || null, source_type: 'historical' }, 'Не удалось сохранить награду');
    setTitle(''); setTournament(''); setResult(''); setShowForm(false);
  }, 'Не удалось сохранить награду');
  const importOld = () => run(() => sendJson(`/api/players/${encodeURIComponent(playerId)}/verified-awards/import-historical`, 'POST', undefined, 'Не удалось импортировать награды'), 'Не удалось импортировать награды');
  const review = (id: string, action: 'approve' | 'reject') => run(() => sendJson(`/api/players/award-suggestions/${encodeURIComponent(id)}/review`, 'POST', { action }, 'Не удалось обработать предложение'), 'Не удалось обработать предложение');
  const verified = awards.filter((item) => item.verification_status === 'verified').length;

  return <section data-testid="crm-player-awards" className="space-y-2 rounded-[14px] border border-border-soft bg-surface-2 p-3">
    <div className="flex items-center justify-between"><strong className="text-[13px] text-text-primary">Официальные награды</strong><span className="text-[11px] text-text-muted">{verified}</span></div>
    {error ? <div className="rounded-xl bg-danger-soft p-2 text-[12px] text-danger">{error}</div> : null}
    {awards.length ? <div className="space-y-1.5">{awards.map((award) => <div key={award.id} className="rounded-xl bg-black/15 p-2"><div className="text-[12px] font-semibold text-text-primary">{award.title}</div><div className="mt-0.5 text-[10px] text-text-muted">{[award.tournament_name, award.place_result, SOURCE_LABEL[award.source_type] || award.source_type].filter(Boolean).join(' · ')}</div></div>)}</div> : <div className="text-[11px] text-text-muted">Проверенных наград пока нет.</div>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setShowForm((value) => !value)} className="min-h-[44px] rounded-xl border border-border-soft text-[11px] font-semibold text-text-primary">Добавить вручную</button>
      <button type="button" disabled={busy} onClick={() => void importOld()} className="min-h-[44px] rounded-xl border border-border-soft text-[11px] font-semibold text-text-primary">Загрузить из архива</button>
    </div>
    {showForm ? <div className="space-y-2">
      <select aria-label="Вид награды" value={kind} onChange={(event) => setKind(event.target.value)} className="mobile-field"><option value="trophy">Кубок</option><option value="medal">Медаль</option><option value="certificate">Диплом</option><option value="placement">Место</option><option value="nomination">Номинация</option><option value="team">Командная</option></select>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название награды" className="mobile-field" />
      <input value={tournament} onChange={(event) => setTournament(event.target.value)} placeholder="Турнир" className="mobile-field" />
      <input value={result} onChange={(event) => setResult(event.target.value)} placeholder="Место / результат" className="mobile-field" />
      <button type="button" disabled={!title.trim() || busy} onClick={() => void create()} className="min-h-[44px] w-full rounded-xl bg-white text-[12px] font-semibold text-black disabled:opacity-50">Сохранить проверенную награду</button>
    </div> : null}
    {suggestions.length ? <div className="rounded-xl border border-warning/20 bg-warning-soft p-2"><div className="text-[12px] font-semibold text-warning">Предложения игрока · {suggestions.length}</div><div className="mt-2 space-y-2">{suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl bg-black/10 p-2"><div className="text-[11px] text-text-primary">{suggestion.tournament_name || suggestion.description || suggestion.comment || 'Предложение награды'}</div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'approve')} className="min-h-[40px] rounded-lg bg-white text-[11px] font-semibold text-black">Одобрить</button><button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'reject')} className="min-h-[40px] rounded-lg border border-danger/30 text-[11px] font-semibold text-danger">Отклонить</button></div></div>)}</div></div> : null}
  </section>;
}
