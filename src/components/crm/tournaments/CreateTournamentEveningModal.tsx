import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { api, type Player } from '../../../lib/api.ts';

type CreatedTournament = { id: string; title: string; date: string };
type PrizeRow = { place: string; amount_rub: number };

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export function CreateTournamentEveningModal({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tournament: CreatedTournament) => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('Суп с Котом');
  const [judgePlayerId, setJudgePlayerId] = useState('');
  const [entryFee, setEntryFee] = useState(0);
  const [prizeFund, setPrizeFund] = useState(0);
  const [prizes, setPrizes] = useState<PrizeRow[]>([
    { place: '1 место', amount_rub: 0 },
    { place: '2 место', amount_rub: 0 },
    { place: '3 место', amount_rub: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const next = new Date();
    next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
    setDate(next.toISOString().slice(0, 16));
    setError('');
    void api.getPlayers().then((rows) => setPlayers(rows.filter((player) => player.judge_level === 'judge'))).catch(() => setPlayers([]));
  }, [isOpen]);

  const allocated = useMemo(() => prizes.reduce((sum, row) => sum + Number(row.amount_rub || 0), 0), [prizes]);
  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!title.trim() || !date || !venue.trim() || !judgePlayerId) {
      setError('Заполните название, дату, место и выберите судью.');
      return;
    }
    if (allocated !== Number(prizeFund || 0)) {
      setError(`Распределено ${allocated} ₽, а призовой фонд ${Number(prizeFund || 0)} ₽.`);
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/tournaments/evenings', {
        method: 'POST', credentials: 'include', headers: organizerHeaders(),
        body: JSON.stringify({
          title: title.trim(), date: new Date(date).toISOString(), venue: venue.trim(), judge_player_id: judgePlayerId,
          player_capacity: 10, entry_fee_rub: Number(entryFee || 0), prize_fund_rub: Number(prizeFund || 0),
          prize_allocations: prizes.map((row) => ({ place: row.place.trim(), amount_rub: Number(row.amount_rub || 0) })),
          notes: notes.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось создать турнир');
      onCreated(body as CreatedTournament);
      onClose();
    } catch (submitError: any) {
      setError(submitError?.message || 'Не удалось создать турнир');
    } finally {
      setSaving(false);
    }
  };

  const field = 'min-h-11 w-full rounded-xl border border-border-soft bg-surface-2 px-3 text-sm text-text-primary outline-none focus:border-accent';
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4">
    <div className="max-h-[96dvh] w-full max-w-xl overflow-hidden rounded-t-[24px] border border-border-soft bg-surface-1 text-text-primary sm:rounded-[24px]">
      <div className="flex items-center justify-between border-b border-border-soft p-4">
        <div><h3 className="text-lg font-bold">Новый турнирный вечер</h3><p className="mt-0.5 text-xs text-text-secondary">Ровно 10 мест · резерв формируется автоматически</p></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={submit} className="max-h-[calc(96dvh-72px)] space-y-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error ? <div className="flex gap-2 rounded-xl border border-danger/25 bg-danger-soft p-3 text-xs font-semibold text-danger"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-text-secondary">Название<input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1`} placeholder="Кубок 2LA noire" /></label>
          <label className="text-xs font-semibold text-text-secondary">Дата и время<input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-xs font-semibold text-text-secondary">Место<input value={venue} onChange={(e) => setVenue(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-xs font-semibold text-text-secondary">Судья<select value={judgePlayerId} onChange={(e) => setJudgePlayerId(e.target.value)} className={`${field} mt-1`}><option value="">Выберите судью</option>{players.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}</select></label>
          <label className="text-xs font-semibold text-text-secondary">Взнос, ₽<input type="number" min={0} step={1} value={entryFee} onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 font-mono`} /></label>
          <label className="text-xs font-semibold text-text-secondary">Призовой фонд, ₽<input type="number" min={0} step={1} value={prizeFund} onChange={(e) => setPrizeFund(Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 font-mono`} /></label>
        </div>
        <div className="rounded-2xl border border-border-soft bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between text-xs"><b>Распределение призов</b><span className={allocated === prizeFund ? 'text-success' : 'text-warning'}>{allocated} / {prizeFund} ₽</span></div>
          <div className="space-y-2">{prizes.map((row, index) => <div key={index} className="grid grid-cols-[1fr_120px] gap-2"><input value={row.place} onChange={(e) => setPrizes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, place: e.target.value } : item))} className={field} /><input type="number" min={0} step={1} value={row.amount_rub} onChange={(e) => setPrizes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount_rub: Math.max(0, Number(e.target.value) || 0) } : item))} className={`${field} font-mono`} /></div>)}</div>
          <button type="button" onClick={() => setPrizes((current) => [...current, { place: `${current.length + 1} место`, amount_rub: 0 }])} className="mt-2 min-h-10 rounded-xl border border-border-soft px-3 text-xs font-bold text-text-secondary">+ Добавить приз</button>
        </div>
        <label className="block text-xs font-semibold text-text-secondary">Описание / правила<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} mt-1 py-2`} /></label>
        <button disabled={saving} type="submit" className="min-h-12 w-full rounded-xl bg-accent text-sm font-bold text-white disabled:opacity-50">{saving ? 'Создаём…' : 'Создать черновик турнира'}</button>
      </form>
    </div>
  </div>;
}
