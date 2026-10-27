import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, UserRoundCog } from 'lucide-react';
import { api as backend, type Player } from '../../../lib/api';
import { clubGamesApi } from '../../../lib/clubGamesApi';
import { describeLiveGameEvents } from '../../../lib/liveGameEventText';
import { Btn, Card, Chip, Eyebrow, cx } from './ui';
import type { ProtocolApi } from './types';
import { RevealsCard } from './RevealsCard';
import { GameAnalysis } from '../tournaments/protocol/GameAnalysis';

type Props = { api: ProtocolApi };

const GuestSeatReplacement: React.FC<{ api: ProtocolApi }> = ({ api }) => {
  const guests = useMemo(() => api.results.filter((player) => !String(player.player_id || '').trim() || Boolean((player as any).guest_placeholder_id)).slice().sort((a, b) => a.seat_number - b.seat_number), [api.results]);
  const occupied = useMemo(() => new Set(api.results.map((player) => String(player.player_id || '').trim()).filter(Boolean)), [api.results]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seat, setSeat] = useState<number | null>(null);
  const [chosen, setChosen] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guests.length) return;
    let cancelled = false;
    void backend.getPlayers().then((list) => { if (!cancelled) setPlayers(list); }).catch(() => { if (!cancelled) setPlayers([]); });
    return () => { cancelled = true; };
  }, [guests.length]);

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ru-RU');
    return players
      .filter((player) => !occupied.has(String(player.id)))
      .filter((player) => !text || player.nickname.toLocaleLowerCase('ru-RU').includes(text) || String(player.full_name || '').toLocaleLowerCase('ru-RU').includes(text))
      .slice().sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')).slice(0, 8);
  }, [players, occupied, query]);

  if (!guests.length) return null;
  const guest = guests.find((player) => player.seat_number === seat) || null;
  const replacement = players.find((player) => String(player.id) === chosen) || null;

  const apply = async () => {
    if (!guest || !replacement || busy) return;
    if (!window.confirm(`Заменить гостя #${guest.seat_number} ${guest.display_name || 'Гость без профиля'} на ${replacement.nickname}? Роль, фолы, голосования и выход останутся на месте.`)) return;
    const gameId = Number(api.protocol.game_id);
    if (!Number.isInteger(gameId) || gameId <= 0) { setError('Не удалось найти игру для замены гостя.'); return; }
    setBusy(true); setError(null);
    try {
      await clubGamesApi.repairSeatIdentity(gameId, { seat_number: guest.seat_number, replacement_player_id: replacement.id });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось заменить гостя');
      setBusy(false);
    }
  };

  return (
    <Card tone="info" className="space-y-3">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-300/[0.12] text-sky-100"><UserRoundCog className="h-5 w-5" aria-hidden="true" /></span>
        <div><div className="text-sm font-semibold">Заменить гостя без профиля на игрока клуба</div><p className="mt-0.5 text-[12px] leading-4 text-white/55">Меняется только человек на месте. Роль, фолы, голосования и выход остаются.</p></div></div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Место гостя">
        {guests.map((item) => <button key={item.participant_id} type="button" aria-pressed={seat === item.seat_number} onClick={() => { setSeat(item.seat_number); setChosen(''); setError(null); }} className={cx('min-h-11 rounded-xl px-3 text-[13px] font-semibold', seat === item.seat_number ? 'bg-white text-[#090a0d]' : 'bg-white/[0.07] text-white/75')}>#{item.seat_number} {item.display_name || 'Гость без профиля'}</button>)}
      </div>
      {guest ? (
        <>
          <label className="block text-[12px] text-white/50">Поиск игрока клуба
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ник или имя" className="mt-1 min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white placeholder:text-white/30" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {visible.length ? visible.map((player) => <button key={player.id} type="button" aria-pressed={chosen === player.id} onClick={() => { setChosen(player.id); setError(null); }} className={cx('min-h-11 rounded-xl px-3 text-[13px] font-semibold', chosen === player.id ? 'bg-white text-[#090a0d]' : 'bg-white/[0.07] text-white/75')}>{player.nickname}</button>) : <span className="text-[12px] text-white/40">Подходящих игроков нет.</span>}
          </div>
        </>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-rose-300/[0.1] px-3 py-2 text-[12px] font-medium text-rose-100">{error}</p> : null}
      <Btn kind="primary" block disabled={!guest || !replacement || busy} onClick={() => void apply()}>{busy ? 'Заменяем…' : guest && replacement ? `Заменить #${guest.seat_number} на ${replacement.nickname}` : 'Выберите место и игрока'}</Btn>
    </Card>
  );
};

/** Who won (or the PPK that decided it): the first thing on the protocol page. */
export const WinnerSection: React.FC<Props> = ({ api }) => {
  const { protocol, results, locked } = api;
  const ppk = protocol.end_reason === 'ppk';
  const culprit = results.find((player) => player.participant_id === protocol.ppk_culprit_participant_id);
  return (
    <div className="space-y-3">
      <section aria-label="Победитель" className="space-y-2">
        <Eyebrow className="px-1">Победитель</Eyebrow>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Победившая команда">
          {([['red', 'Красные'], ['black', 'Чёрные']] as const).map(([team, label]) => {
            const on = protocol.winner_team === team;
            return (
              <button key={team} type="button" role="radio" aria-checked={on} disabled={locked || ppk} onClick={() => api.setWinner(team)} className={cx('min-h-[60px] rounded-2xl border text-base font-semibold transition-colors disabled:cursor-not-allowed', on ? (team === 'red' ? 'border-rose-300/50 bg-rose-300/[0.16] text-rose-50' : 'border-white/70 bg-white text-[#090a0d]') : 'border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.07]', ppk && !on && 'opacity-50')}>{label}</button>
            );
          })}
        </div>
      </section>

      {ppk ? (
        <Card tone="warn" className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-100" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">Игра закончилась ППК</div><div className="text-[12px] text-white/60">Виновник: #{culprit?.seat_number} {culprit?.display_name}. Победитель определён автоматически.</div></div>{!locked ? <Btn kind="ghost" className="px-3 text-[13px]" onClick={() => api.cancelPpk()}>Отменить</Btn> : null}</Card>
      ) : null}

    </div>
  );
};

/** Everything about the game besides the winner and the players: replacements, reveals, analysis, notes, the journal. */
export const ResultView: React.FC<Props> = ({ api }) => {
  const { protocol, results, locked } = api;
  const [journalOpen, setJournalOpen] = useState(false);
  const lines = useMemo(() => {
    const names = new Map(results.map((player) => [player.seat_number, player.display_name]));
    return describeLiveGameEvents(Array.isArray(protocol.events) ? protocol.events : [], (seat) => `#${seat}${names.get(seat) ? ` ${names.get(seat)}` : ''}`);
  }, [protocol.events, results]);
  const sorted = results.slice().sort((a, b) => a.seat_number - b.seat_number);

  return (
    <div className="space-y-5">

      <GuestSeatReplacement api={api} />

      <RevealsCard api={api} />

      <GameAnalysis events={protocol.events} playerResults={api.results} protocol={protocol} />

      <section aria-label="Замена в игре" className="space-y-2">
        <div className="flex items-center justify-between px-1"><Eyebrow>Замена в игре</Eyebrow>
          <button type="button" role="switch" aria-checked={Boolean(protocol.replacement)} disabled={locked} onClick={() => api.setReplacement(protocol.replacement ? null : { replaced_seat: 1, replacement_name_or_comment: '', replacement_time: '', notes: '' })} className={cx('flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold disabled:opacity-60', protocol.replacement ? 'bg-white text-[#090a0d]' : 'bg-white/[0.07] text-white/70')}>{protocol.replacement ? 'Была замена' : 'Замен не было'}</button></div>
        {protocol.replacement ? (
          <Card className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
            <label className="block text-[12px] text-white/50">Заменённое место
              <select disabled={locked} value={protocol.replacement.replaced_seat || 1} onChange={(event) => api.setReplacement({ ...protocol.replacement!, replaced_seat: Number(event.target.value) || 1 })} className="mt-1 min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white">{sorted.map((player) => <option key={player.participant_id} value={player.seat_number}>#{player.seat_number} {player.display_name}</option>)}</select></label>
            <label className="block text-[12px] text-white/50">Кто заменил
              <input disabled={locked} value={protocol.replacement.replacement_name_or_comment || ''} onChange={(event) => api.setReplacement({ ...protocol.replacement!, replacement_name_or_comment: event.target.value })} placeholder="Имя или комментарий" className="mt-1 min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white placeholder:text-white/30" /></label>
            <label className="block text-[12px] text-white/50">Когда
              <input disabled={locked} value={protocol.replacement.replacement_time || ''} onChange={(event) => api.setReplacement({ ...protocol.replacement!, replacement_time: event.target.value })} placeholder="Например, день 2" className="mt-1 min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white placeholder:text-white/30" /></label>
            <label className="block text-[12px] text-white/50">Заметка
              <input disabled={locked} value={protocol.replacement.notes || ''} onChange={(event) => api.setReplacement({ ...protocol.replacement!, notes: event.target.value })} placeholder="Причина" className="mt-1 min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white placeholder:text-white/30" /></label>
          </Card>
        ) : <p className="px-1 text-[13px] text-white/40">Замен в игре не было.</p>}
      </section>

      <section aria-label="Заметка судьи" className="space-y-2">
        <label htmlFor="judge-notes" className="block px-1"><Eyebrow>Заметка судьи</Eyebrow></label>
        <textarea id="judge-notes" rows={3} disabled={locked} value={protocol.judge_notes || ''} onChange={(event) => api.setJudgeNotes(event.target.value)} placeholder="Особенности партии, тайминги" className="w-full rounded-2xl border border-white/12 bg-white/[0.04] p-3.5 text-sm leading-5 text-white placeholder:text-white/30 disabled:opacity-70" />
      </section>

      {lines.length ? (
        <section aria-label="Журнал партии">
          <button type="button" aria-expanded={journalOpen} onClick={() => setJournalOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm font-semibold" data-testid="game-event-log-toggle">
            <span>Журнал партии <Chip className="ml-1">{lines.length}</Chip></span><ChevronDown className={cx('h-4 w-4 text-white/50 transition-transform', journalOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {journalOpen ? (
            <ol className="mt-2 max-h-[50dvh] space-y-0.5 overflow-y-auto rounded-2xl border border-white/8 bg-black/25 px-3.5 py-3 text-[12px] leading-5" data-testid="game-event-log">
              {lines.map((line) => <li key={line.seq} className={line.heading ? 'mt-2 font-semibold uppercase tracking-wide text-amber-100/80' : 'text-white/70'}>{line.time ? <span className="mr-2 font-mono text-white/35">{line.time}</span> : null}{line.text}</li>)}
            </ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
