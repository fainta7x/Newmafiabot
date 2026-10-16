import { buildGameAnalysis } from '../../lib/liveGameAnalysis.ts';
import { playerActionMetrics } from '../../lib/gameActionFacts.ts';
import type { LiveGameEvent } from '../../shared/liveGameEvents.ts';
import { getGameRoleDefinition, UNKNOWN_GAME_ROLE_LABEL } from '../../shared/gameRoles.ts';
import React, { useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { formatPlayerGameDate as formatDate } from '../../lib/playerGameDate.ts';
import { getPlayerGameWinnerLabel } from '../../lib/playerGameResultLabels.ts';
import { GameRoleBadge } from '../ui/GameRole.tsx';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { VoteSplitScene, NightShotScene } from './PlayerVisualScenes.tsx';
import { RevealStatementScene, VersionDuelScene } from './PlayerGameRevealsScene.tsx';

export type PlayerGameEloChange = {
  id: string;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
};

type ProtocolPerson = {
  participant_id: string;
  seat_number: number;
  nickname: string;
} | null;

type VoteRound = {
  round_number: number;
  day_number: number;
  is_revote: boolean;
  parent_round_number: number | null;
  eligible_voters: number | null;
  nominated_seats: number[];
  vote_counts: Record<string, number>;
  outcome: string | null;
};

type NightShot = {
  night_number: number;
  target_seat: number;
  result: string | null;
};

export type PlayerGameDetailData = {
  game: {
    id: string;
    source: 'club' | 'tournament';
    title: string;
    date: string | null;
    game_number: number;
    format: string;
    winner_team: 'red' | 'black' | null;
    judge_name: string | null;
    table_name: string | null;
    elo_affected: boolean;
  };
  protocol: {
    events?: LiveGameEvent[];
    end_reason: string;
    votes: VoteRound[];
    shots: NightShot[];
    replacement: Record<string, unknown> | null;
    judge_notes: string | null;
    first_killed: ProtocolPerson;
    zero_round_voted: ProtocolPerson;
    ppk_culprit: ProtocolPerson;
    /** «Вскрытие»: who claimed to be the Sheriff and the checks he announced (the judge's record). */
    reveals?: Array<{ seat: number; round: number; checks: Array<{ target: number; color: 'red' | 'black' }> }>;
    /** When two or more players revealed: each claimant's version of the table (he is the Sheriff; blacks = announced blacks + the rivals). */
    reveal_versions?: Array<{ claimant: number; blacks: number[]; reds: number[] }>;
  };
  players: Array<{
    player_id: string | null;
    participant_id: string;
    nickname: string;
    avatar_url: string | null;
    seat_number: number;
    role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
    team: 'red' | 'black' | null;
    won: boolean;
    exit_type: string | null;
    exit_order: number | null;
    regular_fouls: number;
    minor_technical_fouls: number;
    major_technical_fouls: number;
    removal_reason: string | null;
    notes: string | null;
    color_protocol: Array<{ mark: string; seat_numbers: number[] }>;
    judge_bonus: number;
    protocol_bonus: number;
    ci_points: number;
    penalty_points: number;
    disciplinary_penalty_points: number;
    first_killed: boolean;
    zero_round_voted: boolean;
    best_move: boolean;
    best_move_source: string | null;
    best_move_seats: number[];
    score: {
      win_point: number;
      judge_bonus: number;
      protocol_bonus: number;
      ci_points: number;
      best_move_points: number;
      disciplinary_penalty_points: number;
      total_points: number;
    };
    elo_before: number | null;
    elo_after: number | null;
    elo_delta: number | null;
  }>;
};

type DetailPlayer = PlayerGameDetailData['players'][number];
type StoryEntry =
  | { key: string; order: number; kind: 'vote'; vote: PlayerGameDetailData['protocol']['votes'][number] }
  | { key: string; order: number; kind: 'night'; shot: PlayerGameDetailData['protocol']['shots'][number] };

const winnerLabel = (winner: PlayerGameDetailData['game']['winner_team']) =>
  getPlayerGameWinnerLabel(winner) ?? 'Результат не указан';

const endReasonLabel = (reason: string) => {
  if (!reason || reason === 'normal') return 'Обычное завершение';
  if (reason === 'ppk') return 'Игра завершена ППК';
  return reason;
};

const exitLabel = (exit: string | null) => {
  if (exit === 'alive') return 'дожил до конца';
  if (exit === 'killed') return 'убит ночью';
  if (exit === 'voted_zero_round') return 'заголосован в 0 круге';
  if (exit === 'voted_day') return 'заголосован днём';
  if (exit === 'removed') return 'удалён';
  return null;
};

const colorMarkLabel = (mark: string) => {
  if (mark === 'red') return 'красный';
  if (mark === 'black') return 'чёрный';
  if (mark === 'sheriff') return 'шериф';
  return mark;
};

const shotResultLabel = (result: string | null) => {
  if (result === 'killed') return 'убит';
  if (result === 'miss') return 'промах';
  if (result === 'agreement_failed') return 'нестрел';
  return result || 'результат не указан';
};

const shortNumber = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
};

const scoreNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const signedScore = (value: number) => `${value > 0 ? '+' : ''}${scoreNumber(value)}`;

export const formatEloDelta = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return 'Elo не меняется';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${shortNumber(rounded)} Elo`;
};

const pointsTone = (value: number) => (value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-white/70');

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <h2 className="text-sm font-semibold text-white/85">{title}</h2>
      {hint ? <p className="mt-1 text-xs leading-5 text-white/55">{hint}</p> : null}
      <div className="mt-3 min-w-0">{children}</div>
    </section>
  );
}

function RoleChip({ role }: { role: DetailPlayer['role'] }) {
  return <GameRoleBadge role={role} />;
}

function Avatar({ player }: { player: DetailPlayer }) {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-white/15 to-white/[.035] text-sm font-semibold text-white/70 ring-1 ring-white/10">
    {player.nickname.trim().slice(0, 1).toUpperCase() || '?'}
    {player.avatar_url && !failed && <img src={player.avatar_url} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
  </span>;
}

export default function PlayerGameDetail({
  detail,
  loading,
  error,
  selfId,
  onBack,
}: {
  detail: PlayerGameDetailData | null;
  loading: boolean;
  error: string | null;
  selfId: string;
  onBack: () => void;
}) {
  const seatPlayer = (seat: number) => detail?.players.find((player) => player.seat_number === seat) || null;
  const seatLabel = (seat: number) => { const player = seatPlayer(seat); return player ? `#${seat} ${player.nickname}` : `#${seat}`; };
  const me = detail ? detail.players.find((player) => player.player_id && player.player_id === selfId) || null : null;

  // The game as one story: the zero circle, the first night, the first day, … (the night N comes after the day N−1).
  const story = React.useMemo<StoryEntry[]>(() => {
    if (!detail) return [];
    return [
      ...detail.protocol.votes.map((vote): StoryEntry => ({ key: `vote:${vote.round_number}`, order: vote.day_number * 10 + (vote.is_revote ? 1 : 0), kind: 'vote', vote })),
      ...detail.protocol.shots.map((shot): StoryEntry => ({ key: `night:${shot.night_number}`, order: (shot.night_number - 1) * 10 + 5, kind: 'night', shot })),
    ].sort((a, b) => a.order - b.order);
  }, [detail]);

  const analysis = React.useMemo(() => buildGameAnalysis(detail?.protocol.events || []), [detail]);
  const personal = React.useMemo(() => detail && me ? playerActionMetrics([{
    id: detail.game.id, source: detail.game.source, date: detail.game.date || '', winner: detail.game.winner_team,
    seats: detail.players.map(person => ({ seat: person.seat_number, role: person.role, playerId: person.player_id })),
    events: detail.protocol.events || [],
  }], selfId) : null, [detail, me, selfId]);
  const myVotes = personal && me?.team ? personal.votes[me.team] : null;
  const knownVotes = myVotes ? myVotes.red + myVotes.black : 0;
  const correctVotes = myVotes ? (me?.team === 'red' ? myVotes.black : myVotes.red) : 0;

  const sides = detail ? [
    { team: 'red' as const, title: 'Красные', players: detail.players.filter((player) => player.team === 'red') },
    { team: 'black' as const, title: 'Чёрные', players: detail.players.filter((player) => player.team === 'black') },
  ].filter((side) => side.players.length) : [];
  const unassigned = detail ? detail.players.filter((player) => player.team !== 'red' && player.team !== 'black') : [];

  const renderPlayer = (item: DetailPlayer) => {
    const isSelf = Boolean(item.player_id) && item.player_id === selfId;
    const exit = exitLabel(item.exit_type);
    const parts = [
      item.score.win_point ? { label: 'победа', value: item.score.win_point } : null,
      item.score.judge_bonus ? { label: 'судья', value: item.score.judge_bonus } : null,
      item.score.protocol_bonus ? { label: 'протокол', value: item.score.protocol_bonus } : null,
      item.score.best_move_points ? { label: 'ЛХ', value: item.score.best_move_points } : null,
      item.score.ci_points ? { label: 'CI', value: item.score.ci_points } : null,
      item.score.disciplinary_penalty_points ? { label: 'дисциплина', value: -item.score.disciplinary_penalty_points } : null,
    ].filter(Boolean) as Array<{ label: string; value: number }>;
    const marks = [item.first_killed ? 'ПУ' : null, item.best_move ? 'ЛХ' : null, item.zero_round_voted ? '0 круг' : null].filter(Boolean) as string[];
    return (
      <details key={`${item.seat_number}:${item.player_id || item.nickname}`} data-testid={`game-player-${item.seat_number}`} className={`group min-w-0 max-w-full border-b border-white/[0.07] ${isSelf ? 'bg-sky-200/[0.07]' : ''}`}>
        <summary aria-label={`Место ${item.seat_number}: ${item.nickname}, ${(getGameRoleDefinition(item.role)?.label ?? UNKNOWN_GAME_ROLE_LABEL)}, ${signedScore(item.score.total_points)} балла`} className="grid h-11 min-h-11 min-w-0 cursor-pointer list-none grid-cols-[14px_minmax(0,1fr)_34px] items-center gap-1 px-1 py-1 leading-4">
          <span className="text-center text-xs font-semibold text-white/45">{item.seat_number}</span>
          <div className="grid min-w-0 content-center gap-0.5 text-xs leading-4">
            <div className="flex h-4 min-w-0 items-center gap-1"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{item.nickname}</span><span aria-hidden="true" className="text-white/35 transition group-open:rotate-180">⌄</span></div>
            <div className="flex h-4 items-center"><RoleChip role={item.role} /></div>
          </div>
          <div className="min-w-0 text-right">
            <div className={`text-xs font-semibold tabular-nums ${pointsTone(item.score.total_points)}`}>{signedScore(item.score.total_points)}</div>
            {detail?.game.elo_affected && item.elo_delta != null ? <div aria-label={`Изменение Elo: ${formatEloDelta(item.elo_delta)}`} className={`whitespace-nowrap text-[10px] tabular-nums ${pointsTone(item.elo_delta)}`}>{formatEloDelta(item.elo_delta).replace(/\s*Elo$/, '')}</div> : <div className="text-[10px] text-white/35">баллы</div>}
          </div>
        </summary>
        <div className="space-y-2 border-t border-white/[0.06] px-2 pb-3 pt-2.5 text-xs text-white/65">
          <div className="flex min-w-0 items-center gap-2"><Avatar player={item} /><div className="min-w-0 break-words"><p className="font-semibold text-white">{item.nickname}{isSelf ? <span className="ml-1.5 text-sky-100/70">вы</span> : null}</p><p>Место №{item.seat_number} · {(getGameRoleDefinition(item.role)?.label ?? UNKNOWN_GAME_ROLE_LABEL)}</p></div></div>
          {(exit || marks.length > 0) && <p className="break-words">{[exit, ...marks].filter(Boolean).join(' · ')}</p>}
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Из чего баллы</div>
            {parts.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{parts.map((part) => <span key={`${part.label}:${part.value}`} className={`rounded-full px-2 py-1 text-[11px] ${part.value > 0 ? 'bg-emerald-400/10 text-emerald-200/80' : 'bg-rose-400/10 text-rose-200/80'}`}>{part.label} {signedScore(part.value)}</span>)}</div> : <div className="mt-1 text-white/35">Дополнительных начислений нет.</div>}
          </div>
          {item.exit_order != null || item.regular_fouls > 0 || item.minor_technical_fouls > 0 || item.major_technical_fouls > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {item.exit_order != null ? <span className="rounded-full bg-white/[0.06] px-2 py-1">вышел {item.exit_order}-м</span> : null}
              {item.regular_fouls > 0 ? <span className="rounded-full bg-white/[0.06] px-2 py-1">фолы {item.regular_fouls}</span> : null}
              {item.minor_technical_fouls > 0 ? <span className="rounded-full bg-white/[0.06] px-2 py-1">мал. тех {item.minor_technical_fouls}</span> : null}
              {item.major_technical_fouls > 0 ? <span className="rounded-full bg-white/[0.06] px-2 py-1">бол. тех {item.major_technical_fouls}</span> : null}
            </div>
          ) : null}
          {item.best_move ? <div className="rounded-xl bg-white/[0.045] px-2.5 py-2">Лучший ход: {item.best_move_seats.length ? item.best_move_seats.map(seatLabel).join(', ') : 'без номеров'}</div> : null}
          {item.color_protocol.length > 0 ? (
            <div className="rounded-xl bg-white/[0.045] px-2.5 py-2">
              <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/30">Цветовой протокол</div>
              {item.color_protocol.map((entry, index) => <div key={`${entry.mark}:${index}`}>{colorMarkLabel(entry.mark)}: {entry.seat_numbers.length ? entry.seat_numbers.map((seat) => `#${seat}`).join(', ') : '—'}</div>)}
            </div>
          ) : null}
          {item.removal_reason || item.notes ? <div className="leading-5 text-white/40">{item.removal_reason ? <div>Причина удаления: {item.removal_reason}</div> : null}{item.notes ? <div>{item.notes}</div> : null}</div> : null}
          {item.player_id ? <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id!)} className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-[12px] text-white/70">Открыть профиль игрока</button> : null}
          <div className="border-t border-white/[0.06] pt-2 text-[11px] text-white/35">
            {detail?.game.elo_affected && item.elo_delta != null
              ? `Elo: ${formatEloDelta(item.elo_delta)}${item.elo_before != null && item.elo_after != null ? ` · было ${shortNumber(item.elo_before)}, стало ${shortNumber(item.elo_after)}` : ''}`
              : 'Эта игра рейтинг Elo не меняет.'}
          </div>
        </div>
      </details>
    );
  };


  const keyMoments: Array<{ label: string; value: string; extra?: string }> = [];
  if (detail) {
    const first = detail.protocol.first_killed;
    if (first) keyMoments.push({ label: 'Первым убит (ПУ)', value: `#${first.seat_number} ${first.nickname}` });
    for (const player of detail.players.filter((item) => item.best_move)) {
      const named = player.best_move_seats;
      const hits = named.filter((seat) => seatPlayer(seat)?.team === 'black').length;
      keyMoments.push({
        label: 'Лучший ход (ЛХ)',
        value: `#${player.seat_number} ${player.nickname}`,
        extra: named.length ? `назвал чёрными ${named.map((seat) => `#${seat}`).join(', ')} · угадал ${hits} из ${named.length}` : undefined,
      });
    }
    if (detail.protocol.zero_round_voted) keyMoments.push({ label: 'Заголосован в нулевом круге', value: `#${detail.protocol.zero_round_voted.seat_number} ${detail.protocol.zero_round_voted.nickname}` });
    if (detail.protocol.ppk_culprit) keyMoments.push({ label: 'Виновник ППК', value: `#${detail.protocol.ppk_culprit.seat_number} ${detail.protocol.ppk_culprit.nickname}` });
  }

  return (
    <>
      <button type="button" onClick={onBack} className="min-h-11 self-start rounded-lg bg-white/[0.05] px-3 text-xs text-white/65">← К играм</button>

      {loading && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игры…</p>}
      {error && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/55">{error}</p>}

      {detail && (
        <article data-testid="game-score-sheet" className="min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(244,63,94,.09),transparent_38%,rgba(139,92,246,.08))]">
          <section className="border-b border-white/10 px-3 py-3" data-testid="game-hero">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.18em] text-white/40"><span>2LA NOIRE</span><span>Итоговый бланк · №{detail.game.game_number}</span></div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="min-w-0"><div className="text-[11px] text-white/45">Игра №{detail.game.game_number} · {formatDate(detail.game.date)} · {detail.game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizeEveningFormat(detail.game.format)]}</div>
                <h1 className="break-words text-sm font-semibold sm:text-base">{detail.game.title}</h1></div>
              <strong className={`text-sm ${detail.game.winner_team === 'red' ? 'text-rose-300' : detail.game.winner_team === 'black' ? 'text-violet-200' : 'text-white/75'}`}>{winnerLabel(detail.game.winner_team)}</strong>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/45">
              <span>{endReasonLabel(detail.protocol.end_reason)}</span>
              {detail.game.table_name && <span>{detail.game.table_name}</span>}
              {detail.game.judge_name && <span>Судья {detail.game.judge_name}</span>}

            </div>
            {me && <div data-testid="game-mine" className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <span className="text-[11px] text-white/45">Моя игра</span><RoleChip role={me.role}/>
              <span className={`text-xs font-semibold ${me.won ? 'text-emerald-200' : 'text-rose-200'}`}>{me.won ? 'Победа' : 'Поражение'}</span>
              <span className="ml-auto text-xs font-semibold tabular-nums">{signedScore(me.score.total_points)}</span>
              {detail.game.elo_affected && me.elo_delta != null && <span className={`text-[11px] tabular-nums ${pointsTone(me.elo_delta)}`}>{formatEloDelta(me.elo_delta)}</span>}
            </div>}

          </section>


          <section aria-label="Составы и баллы" className="min-w-0 px-2 py-2 sm:px-3">
            <h2 className="mb-2 text-xs font-semibold text-white/65">Составы и баллы</h2>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
              {sides.map((side) => (
                <div key={side.team} className="min-w-0">
                  <div className="mb-1 flex min-h-6 flex-wrap items-center gap-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${side.team === 'red' ? 'bg-rose-500' : 'bg-slate-200'}`} aria-hidden="true" />
                    <h3 className="text-xs font-semibold text-white/80">{side.title}</h3>
                    {detail.game.winner_team === side.team ? <span className="text-xs text-emerald-200"><span aria-hidden="true">✓</span><span className="sr-only">победили</span></span> : null}
                    <span className="ml-auto text-right text-[10px] text-white/45">баллы{detail.game.elo_affected ? '/Elo' : ''}</span>
                  </div>
                  <div className="min-w-0">{side.players.map(renderPlayer)}</div>
                </div>
              ))}
              {unassigned.length ? <div className="space-y-2">{unassigned.map(renderPlayer)}</div> : null}
            </div>
          </section>

          <div className="border-t border-white/10 px-3">{me && <details data-testid="game-personal-stats" className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs text-white/70">Как я сыграл эту игру<span aria-hidden="true">⌄</span></summary><dl className="grid grid-cols-2 gap-3 border-t border-white/10 py-2 text-xs">
              <div><dt className="text-white/45">Точность голосования</dt><dd className="mt-1 text-lg font-semibold">{knownVotes ? `${Math.round(correctVotes / knownVotes * 100)}%` : '—'}</dd><p className="mt-1 text-[11px] text-white/50">{knownVotes ? `${correctVotes} из ${knownVotes} в ${me.team === 'red' ? 'чёрных' : 'красных'}` : 'Нет подходящих записанных голосов'}</p></div>
              <div><dt className="text-white/45">Баллы за игру</dt><dd className="mt-1 text-lg font-semibold">{signedScore(me.score.total_points)}</dd><p className="mt-1 text-[11px] text-white/50">Судья {signedScore(me.score.judge_bonus)} · протокол {signedScore(me.score.protocol_bonus)}</p></div>
              {me.best_move && <div><dt className="text-white/45">Лучший ход</dt><dd className="mt-1">{me.best_move_seats.filter(seat => seatPlayer(seat)?.team === 'black').length} чёрных из {me.best_move_seats.length}</dd></div>}
              {(me.role === 'sheriff' || me.role === 'don') && personal && <div><dt className="text-white/45">Результативные проверки</dt><dd className="mt-1">{me.role === 'sheriff' ? personal.checks.sheriff.black : personal.checks.don.sheriff} из {personal.checks[me.role].red + personal.checks[me.role].black}</dd></div>}
            </dl><p className="pb-2 text-[10px] leading-4 text-white/40">Учитываем записанные голоса обычных дней с одним заголосованным. Нулевой круг и уход нескольких игроков исключены.</p></details>}</div>
          {keyMoments.length > 0 && <details data-testid="game-key-moments" className="border-b border-white/10 px-3">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-white/80">Главное в игре<span aria-hidden="true" className="text-white/40">ПУ · ЛХ ▾</span></summary>
            <div className="grid grid-cols-2 gap-3 pb-3">
              {keyMoments.map((moment, index) => <div key={`${moment.label}:${index}`} className="min-w-0">
                <div className="text-xs text-white/50">{moment.label}</div>
                <div className="break-words text-xs font-medium text-white/90">{moment.value}</div>
                {moment.extra && <div className="mt-1 break-words text-xs text-white/60">{moment.extra}</div>}
              </div>)}
            </div>
          </details>}
          <details data-testid="game-full-protocol" className="group border-t border-white/10 px-3"><summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-white/75">Подробный протокол <span className="text-white/40 transition group-open:rotate-180">⌄</span></summary><div className="space-y-3 pb-3">
          {detail.protocol.reveals?.length ? (
            <Section title="Вскрытия" hint="Кто назвал себя шерифом и какие проверки объявил. Это слова за столом, а не ночные проверки.">
              <ul data-testid="game-reveals" className="grid gap-3 lg:grid-cols-2">
                {detail.protocol.reveals.map((reveal) => {
                  const owner = seatPlayer(reveal.seat);
                  return <RevealStatementScene key={reveal.seat} candidate={{
                    claimant: reveal.seat,
                    label: seatLabel(reveal.seat),
                    role: owner?.role ?? null,
                    checks: reveal.checks.map((check) => {
                      const target = seatPlayer(check.target);
                      return {
                        target: check.target,
                        nickname: seatLabel(check.target),
                        color: check.color,
                        trueTeam: target?.team === 'black' ? 'black' : target?.team === 'red' ? 'red' : null,
                      };
                    }),
                  }} />;
                })}
              </ul>
              {detail.protocol.reveal_versions?.length ? (
                <VersionDuelScene versions={detail.protocol.reveal_versions.map((version) => {
                  const claimant = seatPlayer(version.claimant);
                  return {
                    claimant: version.claimant,
                    label: seatLabel(version.claimant),
                    blacks: version.blacks,
                    reds: version.reds,
                    state: claimant ? claimant.role === 'sheriff' ? 'verified' as const : 'false' as const : 'unknown' as const,
                  };
                })} />
              ) : null}
            </Section>
          ) : null}

          {(story.length > 0 || detail.protocol.replacement) && (
            <Section title="Ход игры" hint="Голоса игроков по кругам и ночные выстрелы. Номера соответствуют местам за столом.">
              <ol data-testid="game-story-timeline" className="space-y-1.5">
                {story.map((entry) => {
                  if (entry.kind === 'night') {
                    const shot = entry.shot;
                    const tone = shot.result === 'killed' ? 'bg-rose-400/12 text-rose-100' : 'bg-white/[0.07] text-white/65';
                    return (
                      <li key={entry.key} className="rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white/90"><span aria-hidden="true" className="text-lg">☾</span> Ночь {shot.night_number}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{shotResultLabel(shot.result)}</span>
                        </div>
                        <NightShotScene target={seatLabel(shot.target_seat)} seat={shot.target_seat} result={shot.result} />
                      </li>
                    );
                  }
                  const vote = entry.vote;
                  const counts = vote.nominated_seats.map((seat) => ({ seat, votes: Number(vote.vote_counts[String(seat)] || 0) }));
                  const top = Math.max(1, ...counts.map((item) => item.votes));
                  const leaders = counts.filter((item) => item.votes === top && top > 0);
                  const result = vote.outcome === 'tie_revote' ? 'Ничья — переголосование'
                    : ['night', 'no_elimination'].includes(vote.outcome || '') ? 'Никто не заголосован — наступает ночь'
                    : ['eliminated', 'single_eliminated'].includes(vote.outcome || '') ? (leaders.length === 1 ? `Заголосован ${seatLabel(leaders[0].seat)}` : 'Игрок заголосован')
                    : vote.outcome ? vote.outcome.replaceAll('_', ' ') : null;
                  return (
                    <li key={entry.key} className="rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-semibold text-white/90"><span aria-hidden="true" className="text-lg text-rose-200/70">◉</span>{vote.day_number === 0 ? 'Нулевой круг' : `День ${vote.day_number}`}{vote.is_revote ? ' · переголосование' : ''}</span>
                      </div>
                      {(() => {
                        const ballots = analysis.circles.find(circle => circle.round === vote.day_number + 1)?.votings.find(round => round.number === vote.round_number)?.votes || [];
                        return ballots.length ? <div aria-label="Кто в кого голосовал" className="mt-1.5 space-y-1">{ballots.map(ballot => <div key={ballot.candidate} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1.5 text-[11px]"><span className="flex flex-wrap gap-1">{ballot.voters.map(seat => <span key={seat} title={seatLabel(seat)} aria-label={seatLabel(seat)} className={seatPlayer(seat)?.team === "black" ? "rounded bg-violet-400/20 px-1.5 py-0.5 font-semibold tabular-nums text-violet-200" : seatPlayer(seat)?.team === "red" ? "rounded bg-rose-400/20 px-1.5 py-0.5 font-semibold tabular-nums text-rose-200" : "rounded bg-white/10 px-1.5 py-0.5 tabular-nums text-white/70"}>{seat}</span>)}</span><span aria-hidden="true" className="text-white/40">→</span><span className="flex min-w-0 items-center gap-1.5"><GameRoleBadge role={seatPlayer(ballot.candidate)?.role}/><span className="truncate" title={seatLabel(ballot.candidate)}>{seatLabel(ballot.candidate)}</span></span></div>)}</div> : <><p className="mt-2 text-[11px] text-white/45">Индивидуальные голоса не записаны. В протоколе сохранились только суммы.</p><VoteSplitScene eligible={vote.eligible_voters} candidates={counts.map((item) => ({ seat: item.seat, nickname: seatPlayer(item.seat)?.nickname || "Неизвестный игрок", votes: item.votes, team: seatPlayer(item.seat)?.team }))} /></>;
                      })()}
                      {result ? <div className="mt-1.5 text-[11px] font-semibold text-white/75">{result}</div> : null}
                    </li>
                  );
                })}
              </ol>
              {detail.protocol.replacement ? <div className="mt-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">В протоколе зафиксирована замена игрока.</div> : null}
            </Section>
          )}

          {detail.protocol.judge_notes && (
            <Section title="Заметка судьи">
              <p className="rounded-2xl bg-black/20 px-3 py-3 text-sm leading-5 text-white/65">{detail.protocol.judge_notes}</p>
            </Section>
          )}
          </div></details>
        </article>
      )}
    </>
  );
}
