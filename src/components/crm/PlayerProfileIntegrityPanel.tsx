import { useEffect, useState } from 'react';
import type { PlayerDetails } from '../../lib/api.ts';

type IntegrityData = {
  player: { birth_day: number | null; birth_month: number | null; birth_year: number | null; birthday_visibility: string; profile_checked_at: string | null; profile_updated_at: string | null };
  completeness: { percentage: number; complete: boolean; missing_fields: string[]; fields: Record<string, { label: string; state: string; complete: boolean }> };
  awards: any[];
  suggestions: any[];
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : '—';

export default function PlayerProfileIntegrityPanel({ player }: { player: PlayerDetails }) {
  const [data, setData] = useState<IntegrityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [awardTitle, setAwardTitle] = useState('');
  const [awardTournament, setAwardTournament] = useState('');
  const [awardResult, setAwardResult] = useState('');
  const [awardKind, setAwardKind] = useState('trophy');
  const [showAwardForm, setShowAwardForm] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/profile-integrity`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить профильные данные');
      setData(body);
      const birth = body?.player;
      if (birth?.birth_day && birth?.birth_month) setBirthDate(`${String(birth.birth_year || 2000).padStart(4, '0')}-${String(birth.birth_month).padStart(2, '0')}-${String(birth.birth_day).padStart(2, '0')}`);
      else setBirthDate('');
      setVisibility(birth?.birthday_visibility || 'private');
    } catch (loadError: any) { setError(loadError?.message || 'Не удалось загрузить профильные данные'); }
  };

  useEffect(() => { void load(); }, [player.id]);

  const saveBirthday = async () => {
    if (busy) return; setBusy(true); setError(null);
    try {
      let payload: any = { birth_day: null, birth_month: null, birth_year: null, birthday_visibility: visibility };
      if (birthDate) {
        const [year, month, day] = birthDate.split('-').map(Number);
        payload = { birth_day: day, birth_month: month, birth_year: year === 2000 && !data?.player.birth_year ? null : year, birthday_visibility: visibility };
      }
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/profile-private`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить дату рождения');
      await load();
    } catch (saveError: any) { setError(saveError?.message || 'Не удалось сохранить дату рождения'); } finally { setBusy(false); }
  };

  const markField = async (field: string, status: 'not_requested' | 'missing' | 'declined') => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/profile-field-status`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, status }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось обновить статус');
      await load();
    } catch (fieldError: any) { setError(fieldError?.message || 'Не удалось обновить статус'); } finally { setBusy(false); }
  };

  const markChecked = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/profile-checked`, { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отметить проверку');
      await load();
    } catch (checkedError: any) { setError(checkedError?.message || 'Не удалось отметить проверку'); } finally { setBusy(false); }
  };

  const createAward = async () => {
    if (!awardTitle.trim() || busy) return; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/verified-awards`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: awardKind, title: awardTitle.trim(), tournament_name: awardTournament.trim() || null, place_result: awardResult.trim() || null, source_type: 'historical' }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить награду');
      setAwardTitle(''); setAwardTournament(''); setAwardResult(''); setShowAwardForm(false); await load();
    } catch (awardError: any) { setError(awardError?.message || 'Не удалось сохранить награду'); } finally { setBusy(false); }
  };

  const review = async (id: string, action: 'approve' | 'reject') => {
    if (busy) return; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/players/award-suggestions/${encodeURIComponent(id)}/review`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось обработать предложение');
      await load();
    } catch (reviewError: any) { setError(reviewError?.message || 'Не удалось обработать предложение'); } finally { setBusy(false); }
  };

  const importHistorical = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/verified-awards/import-historical`, { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось импортировать награды');
      await load();
    } catch (importError: any) { setError(importError?.message || 'Не удалось импортировать награды'); } finally { setBusy(false); }
  };

  if (!data && !error) return <div className="py-4 text-center text-[12px] text-text-muted">Проверяем профиль…</div>;
  return <div data-testid="crm-profile-integrity" className="space-y-3">
    {error ? <div className="rounded-xl bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
    {data ? <>
      <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3"><strong className="text-[13px] text-text-primary">Заполненность профиля</strong><strong className={data.completeness.complete ? 'text-success' : 'text-warning'}>{data.completeness.percentage}%</strong></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-white" style={{ width: `${data.completeness.percentage}%` }} /></div>
        <div className="mt-2 text-[11px] leading-5 text-text-secondary">{data.completeness.missing_fields.length ? `Не хватает: ${data.completeness.missing_fields.map((key) => data.completeness.fields[key]?.label || key).join(', ')}` : 'Основные поля заполнены.'}</div>
        <div className="mt-2 text-[10px] text-text-muted">Обновлён: {formatDate(data.player.profile_updated_at)} · проверен: {formatDate(data.player.profile_checked_at)}</div>
        <button type="button" disabled={busy} onClick={() => void markChecked()} className="mt-2 min-h-[44px] w-full rounded-xl border border-border-soft px-3 text-[12px] font-semibold text-text-primary">Отметить профиль проверенным</button>
      </section>

      {data.completeness.missing_fields.length ? <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3"><div className="text-[12px] font-semibold text-text-primary">Статус незаполненных полей</div><div className="mt-2 space-y-2">{data.completeness.missing_fields.map((field) => <div key={field} className="rounded-xl bg-black/15 p-2"><div className="text-[11px] text-text-secondary">{data.completeness.fields[field]?.label || field}</div><div className="mt-1 grid grid-cols-2 gap-1"><button type="button" onClick={() => void markField(field, 'not_requested')} className="min-h-[38px] rounded-lg border border-border-soft text-[10px] text-text-primary">Ещё не запрашивали</button>{['phone','birthday'].includes(field) ? <button type="button" onClick={() => void markField(field, 'declined')} className="min-h-[38px] rounded-lg border border-border-soft text-[10px] text-text-primary">Не предоставляет</button> : <button type="button" onClick={() => void markField(field, 'missing')} className="min-h-[38px] rounded-lg border border-border-soft text-[10px] text-text-primary">Нужно заполнить</button>}</div></div>)}</div></section> : null}

      <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3"><div className="text-[12px] font-semibold text-text-primary">День рождения</div><div className="mt-2 grid grid-cols-1 gap-2"><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mobile-field" /><select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="mobile-field"><option value="private">Только организаторам</option><option value="day_month">Публично день и месяц</option><option value="full">Публично полная дата</option></select><button type="button" disabled={busy} onClick={() => void saveBirthday()} className="min-h-[44px] rounded-xl bg-white px-3 text-[12px] font-semibold text-black">Сохранить дату</button></div></section>

      <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3"><div className="flex items-center justify-between"><strong className="text-[12px] text-text-primary">Официальные награды</strong><span className="text-[11px] text-text-muted">{data.awards.filter((item) => item.verification_status === 'verified').length}</span></div>{data.awards.length ? <div className="mt-2 space-y-1.5">{data.awards.map((award) => <div key={award.id} className="rounded-xl bg-black/15 p-2"><div className="text-[12px] font-semibold text-text-primary">{award.title}</div><div className="mt-0.5 text-[10px] text-text-muted">{[award.tournament_name, award.place_result, award.source_type].filter(Boolean).join(' · ')}</div></div>)}</div> : <div className="mt-2 text-[11px] text-text-muted">Проверенных наград пока нет.</div>}<div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setShowAwardForm((value) => !value)} className="min-h-[44px] rounded-xl border border-border-soft text-[11px] font-semibold text-text-primary">Добавить вручную</button><button type="button" disabled={busy} onClick={() => void importHistorical()} className="min-h-[44px] rounded-xl border border-border-soft text-[11px] font-semibold text-text-primary">Импорт старых</button></div>{showAwardForm ? <div className="mt-2 space-y-2"><select value={awardKind} onChange={(event) => setAwardKind(event.target.value)} className="mobile-field"><option value="trophy">Кубок</option><option value="medal">Медаль</option><option value="certificate">Диплом</option><option value="placement">Место</option><option value="nomination">Номинация</option><option value="team">Командная</option></select><input value={awardTitle} onChange={(event) => setAwardTitle(event.target.value)} placeholder="Название награды" className="mobile-field" /><input value={awardTournament} onChange={(event) => setAwardTournament(event.target.value)} placeholder="Турнир" className="mobile-field" /><input value={awardResult} onChange={(event) => setAwardResult(event.target.value)} placeholder="Место / результат" className="mobile-field" /><button type="button" disabled={!awardTitle.trim() || busy} onClick={() => void createAward()} className="min-h-[44px] w-full rounded-xl bg-white text-[12px] font-semibold text-black">Сохранить проверенную награду</button></div> : null}</section>

      {data.suggestions.length ? <section className="rounded-[14px] border border-warning/20 bg-warning-soft p-3"><div className="text-[12px] font-semibold text-warning">Предложения игрока · {data.suggestions.length}</div><div className="mt-2 space-y-2">{data.suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl bg-black/10 p-2"><div className="text-[11px] text-text-primary">{suggestion.tournament_name || suggestion.description || suggestion.comment || 'Предложение награды'}</div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'approve')} className="min-h-[40px] rounded-lg bg-white text-[11px] font-semibold text-black">Одобрить</button><button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'reject')} className="min-h-[40px] rounded-lg border border-danger/30 text-[11px] font-semibold text-danger">Отклонить</button></div></div>)}</div></section> : null}
    </> : null}
  </div>;
}
