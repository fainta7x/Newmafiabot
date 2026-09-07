import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, UserRoundCog, X } from 'lucide-react';
import { api, type Player } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type Props = { game: ClubGameRecord; onClose: () => void; onUpdated: (game: ClubGameRecord) => void };

export const EveningGameSeatRepairSheet: React.FC<Props> = ({ game, onClose, onUpdated }) => {
  const results = useMemo(() => [...(game.club_protocol?.player_results || [])].sort((a, b) => a.seat_number - b.seat_number), [game]);
  const [seat, setSeat] = useState(results[0]?.seat_number || 1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [guest, setGuest] = useState(false);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = results.find((item) => item.seat_number === seat);
  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return players.filter((player) => !q || `${player.nickname} ${player.full_name || ''}`.toLocaleLowerCase('ru-RU').includes(q)).slice(0, 8);
  }, [players, query]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void api.getPlayers().then(setPlayers).catch(() => setError('Не удалось загрузить игроков CRM'));
    return () => { document.body.style.overflow = overflow; };
  }, []);

  const canSubmit = guest ? Boolean(nickname.trim()) : Boolean(playerId);
  const save = async () => {
    if (!canSubmit || saving) return;
    setSaving(true); setError('');
    try {
      const updated = await clubGamesApi.repairSeatIdentity(game.id, guest
        ? { seat_number: seat, guest: { nickname: nickname.trim(), phone: phone.trim() || undefined } }
        : { seat_number: seat, replacement_player_id: playerId });
      onUpdated(updated); onClose();
    } catch (err: any) { setError(err?.message || 'Не удалось исправить состав'); setConfirm(false); }
    finally { setSaving(false); }
  };

  return <>
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[22px] border border-border-soft bg-surface-1 p-4 text-text-primary sm:rounded-[22px] sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-[17px] font-black"><UserRoundCog className="h-5 w-5 text-warning" />Исправить состав</h3><p className="mt-1 text-[11px] leading-5 text-text-secondary">Выбери место и правильного игрока. Роль, фолы, голосование и результат останутся привязаны к месту.</p></div><button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-surface-2" aria-label="Закрыть"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 grid grid-cols-5 gap-2">{results.map((item) => <button type="button" key={item.seat_number} onClick={() => setSeat(item.seat_number)} className={`min-h-[52px] rounded-[11px] border px-1 text-center ${seat === item.seat_number ? 'border-warning bg-warning-soft text-warning' : 'border-border-soft bg-surface-2'}`}><span className="block text-[9px]">#{item.seat_number}</span><span className="block truncate text-[10px] font-bold">{item.display_name}</span></button>)}</div>
        <div className="mt-4 rounded-[13px] border border-warning/25 bg-warning-soft p-3 text-[11px] text-warning"><AlertTriangle className="mr-2 inline h-4 w-4" />Сейчас на месте #{seat}: <strong>{current?.display_name || '—'}</strong></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setGuest(false)} className={`min-h-11 rounded-[11px] border text-[11px] font-black ${!guest ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2'}`}>Игрок CRM</button><button type="button" onClick={() => setGuest(true)} className={`min-h-11 rounded-[11px] border text-[11px] font-black ${guest ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2'}`}>Новый гость</button></div>
        {guest ? <div className="mt-3 space-y-2"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Никнейм гостя" className="min-h-12 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] outline-none" /><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (необязательно)" className="min-h-12 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] outline-none" /></div> : <div className="mt-3"><label className="flex min-h-12 items-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-3"><Search className="h-4 w-4 text-text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти игрока" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label><div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{candidates.map((player) => <button type="button" key={player.id} onClick={() => setPlayerId(player.id)} className={`flex min-h-11 w-full items-center rounded-[11px] border px-3 text-left text-[12px] font-bold ${playerId === player.id ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft bg-surface-2'}`}>{player.nickname}<span className="ml-2 truncate text-[10px] font-normal text-text-muted">{player.full_name}</span></button>)}</div></div>}
        {error ? <p className="mt-3 text-[11px] text-danger">{error}</p> : null}
        <button type="button" disabled={!canSubmit} onClick={() => setConfirm(true)} className="mt-4 min-h-[50px] w-full rounded-[13px] bg-warning text-[12px] font-black text-slate-950 disabled:opacity-40">Проверить и заменить</button>
      </div>
    </div>
    <ConfirmDialog open={confirm} title="Заменить игрока на этом месте?" description={`Игровые действия места #${seat} сохранятся, но статистика и связанные начисления будут пересчитаны для правильного игрока.`} confirmLabel="Исправить состав" tone="warning" busy={saving} onCancel={() => !saving && setConfirm(false)} onConfirm={save} />
  </>;
};
