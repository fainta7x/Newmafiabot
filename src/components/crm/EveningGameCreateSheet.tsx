import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, Shuffle, Users, X } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening, type Player } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { isEveningGameEligible, toggleParticipantInSeats } from '../../lib/eveningRoster';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { JudgeAssignmentFields, type JudgeIdentityMode } from './JudgeAssignmentFields';
import TableScoutingCard from './TableScoutingCard.tsx';

interface EveningGameCreateSheetProps {
  evening: GameEvening;
  tables: EveningTable[];
  participants: EveningParticipant[];
  games: ClubGameRecord[];
  onClose: () => void;
  onCreated: (game: ClubGameRecord) => void;
}

const playerCanJudgeFormat = (player: Player, format: string) => {
  const level = String((player as any).judge_level || 'none');
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return level === 'trainee' || level === 'host' || level === 'judge';
  if (normalized === 'CASUAL') return level === 'host' || level === 'judge';
  return level === 'judge';
};

const gameIsCompleted = (game: ClubGameRecord) => game.status === 'completed' || Boolean(game.club_protocol?.protocol?.winner_team);

export const EveningGameCreateSheet: React.FC<EveningGameCreateSheetProps> = ({ evening, tables, participants, games, onClose, onCreated }) => {
  const [selectedTableId, setSelectedTableId] = useState(tables[0]?.id || '');
  const [judgeMode, setJudgeMode] = useState<JudgeIdentityMode>('external');
  const [judgePlayerId, setJudgePlayerId] = useState('');
  const [judgeName, setJudgeName] = useState(tables[0]?.host_name || '');
  const [crmPlayers, setCrmPlayers] = useState<Player[]>([]);
  const [seats, setSeats] = useState<string[]>(Array(10).fill(''));
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of games.filter(gameIsCompleted)) {
      for (const result of game.club_protocol?.player_results || []) {
        const participantId = String(result.participant_id || '');
        if (participantId) counts.set(participantId, (counts.get(participantId) || 0) + 1);
      }
    }
    return counts;
  }, [games]);

  const eligible = useMemo(() => participants
    .filter(isEveningGameEligible)
    .slice()
    .sort((a, b) => (playCounts.get(a.id) || 0) - (playCounts.get(b.id) || 0) || a.nickname.localeCompare(b.nickname, 'ru')), [participants, playCounts]);
  const byId = useMemo(() => new Map(participants.map((participant) => [participant.id, participant])), [participants]);
  const eligibleIds = useMemo(() => new Set(eligible.map((participant) => participant.id)), [eligible]);
  const lastCompletedLineup = useMemo(() => {
    const lastGame = games.filter(gameIsCompleted).slice().sort((a, b) => b.id - a.id)[0];
    if (!lastGame) return [];
    return (lastGame.club_protocol?.player_results || [])
      .slice()
      .sort((a, b) => Number(a.seat_number) - Number(b.seat_number))
      .map((result) => String(result.participant_id || ''))
      .filter((participantId) => participantId && eligibleIds.has(participantId));
  }, [eligibleIds, games]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return eligible.filter((participant) => !q || participant.nickname.toLocaleLowerCase('ru-RU').includes(q));
  }, [eligible, query]);
  const selectedParticipantIds = seats.filter(Boolean);
  const selectedCount = selectedParticipantIds.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void api.getPlayers()
      .then((items) => setCrmPlayers(items
        .filter((player) => playerCanJudgeFormat(player, evening.format))
        .slice()
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'))))
      .catch(() => setCrmPlayers([]));
    return () => { document.body.style.overflow = previousOverflow; };
  }, [evening.format]);

  const changeTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const table = tables.find((item) => item.id === tableId);
    if (table?.host_name) {
      setJudgeMode('external');
      setJudgePlayerId('');
      setJudgeName(table.host_name);
    }
  };

  const toggle = (participantId: string) => setSeats((previous) => toggleParticipantInSeats(previous, participantId));
  const clearSeat = (index: number) => setSeats((previous) => previous.map((value, seatIndex) => seatIndex === index ? '' : value));
  const shuffleSelected = () => {
    const selected = seats.filter(Boolean);
    if (selected.length < 2) return;
    const shuffled = selected.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setSeats([...shuffled, ...Array(10 - shuffled.length).fill('')]);
  };
  const autoSelect = () => {
    const selected = eligible.slice(0, 10).map((participant) => participant.id);
    setSeats([...selected, ...Array(Math.max(0, 10 - selected.length)).fill('')].slice(0, 10));
  };
  const reuseLastLineup = () => {
    if (lastCompletedLineup.length !== 10) return;
    setSeats(lastCompletedLineup.slice(0, 10));
  };

  const create = async () => {
    if (creating || selectedCount !== 10 || (judgeMode === 'linked' && !judgePlayerId)) return;
    setCreating(true);
    setError(null);
    try {
      const linkedJudge = judgeMode === 'linked'
        ? crmPlayers.find((player) => String(player.id) === String(judgePlayerId))
        : null;
      const created = await clubGamesApi.create(evening.id, {
        evening_table_id: selectedTableId || null,
        judge_player_id: judgeMode === 'linked' ? judgePlayerId : null,
        judge_name: judgeMode === 'linked' ? (linkedJudge?.nickname || null) : (judgeName.trim() || null),
        seats: seats.map((participantId, index) => ({ participant_id: participantId, seat_number: index + 1 })),
      });
      onCreated(created);
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать игру');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full min-w-0 flex-col gap-3 overflow-x-hidden rounded-t-[24px] border border-border-soft bg-surface-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-text-primary sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[24px] sm:pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h3 className="text-[18px] font-black">Новая игра</h3><p className="mt-0.5 text-[11px] text-text-secondary">Выбери площадку, ведущего и 10 фактически пришедших игроков.</p></div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-text-muted hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>

        {error ? <div className="flex items-start gap-2 rounded-[12px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-[11px] text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}

        <label className="text-[10px] font-black uppercase text-text-muted">Стол<select value={selectedTableId} onChange={(event) => changeTable(event.target.value)} className="mt-1 min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary"><option value="">Без указания</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>

        <div className="rounded-[16px] border border-border-soft bg-surface-2 p-3">
          <JudgeAssignmentFields
            mode={judgeMode}
            players={crmPlayers}
            judgePlayerId={judgePlayerId}
            judgeName={judgeName}
            disabled={creating}
            onModeChange={(mode) => { setJudgeMode(mode); if (mode === 'external') setJudgePlayerId(''); }}
            onJudgePlayerIdChange={setJudgePlayerId}
            onJudgeNameChange={setJudgeName}
          />
        </div>

        <div className="space-y-2 rounded-[16px] border border-border-soft bg-surface-2 p-2.5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-black text-text-secondary"><Users className="h-3.5 w-3.5" />Состав игры · {selectedCount}/10</div><button type="button" onClick={shuffleSelected} disabled={selectedCount < 2} className="flex items-center gap-1 text-[9px] font-black text-text-muted disabled:opacity-30"><Shuffle className="h-3 w-3" />Перемешать</button></div>
          <div className="grid grid-cols-5 gap-1.5">
            {seats.map((participantId, index) => {
              const participant = participantId ? byId.get(participantId) : null;
              return <button key={index} type="button" onClick={() => participantId && clearSeat(index)} className={`min-h-[52px] min-w-0 rounded-[11px] border p-1.5 text-center ${participant ? 'border-accent/40 bg-accent-soft' : 'border-border-soft bg-surface-1'}`}><span className="block text-[8px] font-mono text-text-muted">#{index + 1}</span><span className={`mt-1 block truncate text-[9px] font-black ${participant ? 'text-text-primary' : 'text-text-muted'}`}>{participant?.nickname || '—'}</span></button>;
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={autoSelect} disabled={eligible.length < 10} className="min-h-10 rounded-[11px] bg-accent px-2 text-[10px] font-black text-white disabled:opacity-30">Подобрать 10</button>
            <button type="button" onClick={reuseLastLineup} disabled={lastCompletedLineup.length !== 10} className="min-h-10 rounded-[11px] border border-border-soft bg-surface-1 px-2 text-[10px] font-black text-text-secondary disabled:opacity-30">Прошлая десятка</button>
          </div>
          <p className="text-[9px] leading-4 text-text-muted">«Подобрать 10» сначала берёт тех, кто сыграл меньше игр сегодня. Порядок мест можно перемешать отдельно.</p>
        </div>

        <TableScoutingCard participantIds={selectedParticipantIds} />

        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wide text-text-muted"><span>Пришедшие · меньше игр выше</span><span>{visible.length} игроков</span></div>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск игрока" className="w-full rounded-[12px] border border-border-soft bg-surface-2 py-2.5 pl-9 pr-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted" /></div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
          {visible.map((participant) => {
            const seatIndex = seats.indexOf(participant.id); const selected = seatIndex >= 0;
            const played = playCounts.get(participant.id) || 0;
            return <button key={participant.id} type="button" onClick={() => toggle(participant.id)} className={`flex min-w-0 items-center gap-2 rounded-[12px] border p-2.5 text-left ${selected ? 'border-accent bg-accent-soft' : 'border-border-soft bg-surface-2'}`}><PlayerAvatar nickname={participant.nickname} playerId={participant.player_id} forceStoredLookup size="sm" /><div className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-text-primary">{participant.nickname}</strong><span className="text-[8px] text-text-muted">Игр сегодня: {played}</span></div>{selected && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-accent text-[10px] font-black text-white">{seatIndex + 1}</span>}</button>;
          })}
          {visible.length === 0 && <div className="col-span-2 py-8 text-center text-[12px] text-text-muted">Игроков не найдено</div>}
        </div>
        <button type="button" disabled={selectedCount !== 10 || creating || (judgeMode === 'linked' && !judgePlayerId)} onClick={create} className="min-h-12 w-full rounded-[12px] bg-accent text-[13px] font-black text-white disabled:opacity-35">{creating ? 'Создаём…' : selectedCount === 10 ? 'Создать игру' : `Выбери ещё ${10 - selectedCount}`}</button>
      </div>
    </div>
  );
};
