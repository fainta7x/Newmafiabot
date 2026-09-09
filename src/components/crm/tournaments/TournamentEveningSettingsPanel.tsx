import { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../../lib/api.ts';

type PrizeRow = { place: string; amount_rub: number };
type TournamentDetail = {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  judge_player_id?: string | null;
  judge_nickname?: string | null;
  chief_judge_name?: string | null;
  lifecycle: 'draft' | 'registration_open' | 'registration_closed' | 'active' | 'completed';
  entry_fee_rub: number;
  prize_fund_rub: number;
  prize_allocations: PrizeRow[];
  notes?: string | null;
  confirmed_count: number;
  player_capacity: number;
  remaining_places: number;
  published_at?: string | null;
};

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const toLocalInput = (value: string) => {
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

export function TournamentEveningSettingsPanel({ tournamentId, onChanged }: { tournamentId: string; onChanged?: () => void }) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [judges, setJudges] = useState<Player[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [judgePlayerId, setJudgePlayerId] = useState('');
  const [entryFee, setEntryFee] = useState(0);
  const [prizeFund, setPrizeFund] = useState(0);
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setError('');
    try {
      const [response, players] = await Promise.all([
        fetch(`/api/tournaments/evenings/${encodeURIComponent(tournamentId)}`, { credentials: 'include', headers: organizerHeaders() }),
        api.getPlayers(),
      ]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить параметры турнира');
      const next = body as TournamentDetail;
      setDetail(next);
      setJudges(players.filter((player) => player.judge_level === 'judge'));
      setTitle(next.title || ''); setDate(toLocalInput(next.date)); setVenue(next.venue || ''); setJudgePlayerId(next.judge_player_id || '');
      setEntryFee(Number(next.entry_fee_rub || 0)); setPrizeFund(Number(next.prize_fund_rub || 0)); setPrizes(next.prize_allocations || []); setNotes(next.notes || '');
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить параметры турнира');
    }
  };

  useEffect(() => { void load(); }, [tournamentId]);
  const allocated = useMemo(() => prizes.reduce((sum, row) => sum + Number(row.amount_rub || 0), 0), [prizes]);
  const editable = detail?.lifecycle === 'draft' || detail?.lifecycle === 'registration_open' || detail?.lifecycle === 'registration_closed';
  const readinessBlockers = useMemo(() => {
    if (!detail) return [] as string[];
    const blockers: string[] = [];
    if (!detail.judge_player_id) blockers.push('не выбран канонический судья');
    if (!detail.venue?.trim()) blockers.push('не указано место');
    if (Number.isNaN(new Date(detail.date).getTime())) blockers.push('не указаны корректные дата и время');
    if (detail.confirmed_count !== detail.player_capacity) blockers.push(`основной состав ${detail.confirmed_count}/${detail.player_capacity}`);
    const savedAllocated = (detail.prize_allocations || []).reduce((sum, row) => sum + Number(row.amount_rub || 0), 0);
    if (savedAllocated !== Number(detail.prize_fund_rub || 0)) blockers.push('призовой фонд не совпадает с распределением');
    return blockers;
  }, [detail]);

  const requestAction = async (path: string, method = 'POST', body?: unknown) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/tournaments/evenings/${encodeURIComponent(tournamentId)}${path}`, {
        method, credentials: 'include', headers: organizerHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Не удалось выполнить действие');
      setMessage('Изменения сохранены');
      await load(); onChanged?.();
    } catch (actionError: any) {
      setError(actionError?.message || 'Не удалось выполнить действие');
    } finally { setBusy(false); }
  };

  const save = () => {
    if (allocated !== Number(prizeFund || 0)) {
      setError(`Распределено ${allocated} ₽, а призовой фонд ${Number(prizeFund || 0)} ₽.`);
      return;
    }
    void requestAction('', 'PUT', {
      title: title.trim(), date: new Date(date).toISOString(), venue: venue.trim(), judge_player_id: judgePlayerId,
      entry_fee_rub: Number(entryFee || 0), prize_fund_rub: Number(prizeFund || 0), prize_allocations: prizes, notes: notes.trim() || null,
    });
  };

  const copyRegistrationLink = async () => {
    if (!detail?.published_at) {
      setError('Сначала опубликуйте турнир — ссылка записи не должна распространять черновик.');
      return;
    }
    const path = `/player/events/${encodeURIComponent(tournamentId)}`;
    const link = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(link);
      setError('');
      setMessage('Ссылка на запись скопирована. Она открывает этот же турнир для Telegram и VK игрока через канонический профиль.');
    } catch {
      setError(`Не удалось скопировать автоматически. Ссылка: ${link}`);
    }
  };

  if (!detail && !error) return <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4 text-xs text-text-muted">Загружаем параметры турнирного вечера…</section>;
  if (!detail) return <section className="rounded-[18px] border border-danger/25 bg-danger-soft p-4 text-xs text-danger">{error}</section>;

  const field = 'min-h-11 w-full rounded-xl border border-border-soft bg-surface-2 px-3 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50';
  const lifecycleLabel = detail.lifecycle === 'draft' ? 'Черновик' : detail.lifecycle === 'registration_open' ? 'Запись открыта' : detail.lifecycle === 'registration_closed' ? 'Запись закрыта' : detail.lifecycle === 'active' ? 'Турнир идёт' : 'Завершён';

  return <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5 sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Турнирный вечер</h3><p className="mt-1 text-[11px] text-text-muted">10 мест · запись и резерв до запуска турнира</p></div>
      <span className="rounded-full border border-border-soft bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-text-secondary">{lifecycleLabel}</span>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-border-soft bg-surface-2 p-3 text-center">
      <div><div className="text-[9px] uppercase text-text-muted">Состав</div><b className="text-sm">{detail.confirmed_count}/{detail.player_capacity}</b></div>
      <div><div className="text-[9px] uppercase text-text-muted">Свободно</div><b className="text-sm">{detail.remaining_places}</b></div>
      <div><div className="text-[9px] uppercase text-text-muted">Взнос</div><b className="text-sm">{Number(detail.entry_fee_rub || 0)} ₽</b></div>
    </div>

    <div className={`mt-3 rounded-2xl border p-3 ${readinessBlockers.length ? 'border-warning/25 bg-warning-soft' : 'border-success/20 bg-success-soft'}`} data-testid="tournament-readiness-summary">
      <div className={`text-[11px] font-black ${readinessBlockers.length ? 'text-warning' : 'text-success'}`}>{readinessBlockers.length ? 'До запуска есть блокеры' : 'Готовность к запуску: OK'}</div>
      {readinessBlockers.length ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-4 text-text-secondary">{readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="mt-1 text-[10px] leading-4 text-text-secondary">10 канонических участников, судья, место и призовой фонд согласованы. Дальше используется существующий турнирный модуль.</p>}
    </div>

    {error ? <div className="mt-3 rounded-xl border border-danger/25 bg-danger-soft p-3 text-xs font-semibold text-danger">{error}</div> : null}
    {message ? <div className="mt-3 rounded-xl border border-success/20 bg-success-soft p-3 text-xs font-semibold text-success">{message}</div> : null}

    <details className="mt-3 rounded-2xl border border-border-soft bg-surface-2" open={detail.lifecycle === 'draft'}>
      <summary className="cursor-pointer px-3 py-3 text-xs font-bold">Параметры турнира</summary>
      <div className="grid grid-cols-1 gap-3 border-t border-border-soft p-3 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-text-secondary">Название<input disabled={!editable || busy} value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-[11px] font-semibold text-text-secondary">Дата и время<input disabled={!editable || busy} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-[11px] font-semibold text-text-secondary">Место<input disabled={!editable || busy} value={venue} onChange={(e) => setVenue(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-[11px] font-semibold text-text-secondary">Судья<select disabled={!editable || busy} value={judgePlayerId} onChange={(e) => setJudgePlayerId(e.target.value)} className={`${field} mt-1`}><option value="">Выберите судью</option>{judges.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-text-secondary">Взнос, ₽<input disabled={!editable || busy} type="number" min={0} step={1} value={entryFee} onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 font-mono`} /></label>
        <label className="text-[11px] font-semibold text-text-secondary">Призовой фонд, ₽<input disabled={!editable || busy} type="number" min={0} step={1} value={prizeFund} onChange={(e) => setPrizeFund(Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 font-mono`} /></label>
        <div className="sm:col-span-2 rounded-xl border border-border-soft bg-surface-1 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px]"><b>Распределение призов</b><span className={allocated === prizeFund ? 'text-success' : 'text-warning'}>{allocated} / {prizeFund} ₽</span></div>
          <div className="space-y-2">{prizes.map((row, index) => <div key={index} className="grid grid-cols-[1fr_110px] gap-2"><input disabled={!editable || busy} value={row.place} onChange={(e) => setPrizes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, place: e.target.value } : item))} className={field} /><input disabled={!editable || busy} type="number" min={0} value={row.amount_rub} onChange={(e) => setPrizes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount_rub: Math.max(0, Number(e.target.value) || 0) } : item))} className={`${field} font-mono`} /></div>)}</div>
          {editable ? <button type="button" disabled={busy} onClick={() => setPrizes((current) => [...current, { place: `${current.length + 1} место`, amount_rub: 0 }])} className="mt-2 min-h-10 rounded-xl border border-border-soft px-3 text-[11px] font-bold">+ Добавить приз</button> : null}
        </div>
        <label className="sm:col-span-2 text-[11px] font-semibold text-text-secondary">Описание / правила<textarea disabled={!editable || busy} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} mt-1 py-2`} /></label>
        {editable ? <button type="button" disabled={busy} onClick={save} className="sm:col-span-2 min-h-11 rounded-xl bg-accent text-xs font-bold text-white disabled:opacity-50">Сохранить параметры</button> : null}
      </div>
    </details>

    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {detail.lifecycle === 'draft' ? <button type="button" disabled={busy} onClick={() => void requestAction('/publish')} className="min-h-11 rounded-xl bg-accent text-xs font-bold text-white disabled:opacity-50">Опубликовать и открыть запись</button> : null}
      {detail.lifecycle === 'registration_open' ? <button type="button" disabled={busy} onClick={() => void requestAction('/registration/close')} className="min-h-11 rounded-xl border border-border-soft bg-surface-2 text-xs font-bold">Закрыть запись</button> : null}
      {detail.lifecycle === 'registration_closed' ? <button type="button" disabled={busy} onClick={() => void requestAction('/registration/open')} className="min-h-11 rounded-xl border border-border-soft bg-surface-2 text-xs font-bold">Снова открыть запись</button> : null}
      <button type="button" disabled={busy || !detail.published_at} onClick={() => void copyRegistrationLink()} className="min-h-11 rounded-xl border border-border-soft bg-surface-2 text-xs font-bold disabled:opacity-40" data-testid="copy-tournament-registration-link">Скопировать ссылку записи</button>
    </div>
    {!detail.published_at ? <p className="mt-2 text-[10px] leading-4 text-text-muted">Ссылка становится доступна только после явной публикации. При публикации турнирная аудитория получает одно персональное уведомление через выбранный канал Telegram/VK.</p> : null}
  </section>;
}
