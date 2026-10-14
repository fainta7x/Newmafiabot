import React, { useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { formatPlayerGameDate as formatDate } from '../../lib/playerGameDate.ts';
import { getPlayerGameWinnerLabel } from '../../lib/playerGameResultLabels.ts';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { GameTableScene, VoteSplitScene } from './PlayerVisualScenes.tsx';

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

const roleLabel = (role: DetailPlayer['role']) => getPlayerGameRoleLabel(role) ?? 'Роль не указана';

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

const ROLE_CHIP: Record<string, string> = {
  citizen: 'bg-rose-400/12 text-rose-100',
  sheriff: 'bg-amber-300/15 text-amber-100',
  mafia: 'bg-slate-300/15 text-slate-100',
  don: 'bg-violet-300/15 text-violet-100',
};
const pointsTone = (value: number) => (value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-white/70');

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {hint ? <p className="mt-1 text-[12px] leading-4 text-white/35">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RoleChip({ role }: { role: DetailPlayer['role'] }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_CHIP[role || ''] || 'bg-white/[0.07] text-white/55'}`}>{roleLabel(role)}</span>;
}

function Avatar({ player }: { player: DetailPlayer }) {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white/15 to-white/[.035] text-sm font-semibold text-white/70 ring-1 ring-white/10">
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
      <details key={`${item.seat_number}:${item.player_id || item.nickname}`} data-testid={`game-player-${item.seat_number}`} className={`group rounded-2xl border ${isSelf ? 'border-sky-200/25 bg-sky-200/[0.07]' : 'border-white/[0.06] bg-black/20'}`}>
        <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-2.5 px-2.5 py-2">
          <div className="w-5 shrink-0 text-center text-xs font-semibold text-white/35">{item.seat_number}</div>
          <Avatar player={item} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{item.nickname}{isSelf ? <span className="ml-1.5 text-[11px] font-semibold text-sky-100/70">вы</span> : null}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <RoleChip role={item.role} />
              {exit ? <span className="truncate text-[11px] text-white/40">{exit}</span> : null}
              {marks.map((mark) => <span key={mark} className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/55">{mark}</span>)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-base font-semibold tabular-nums ${pointsTone(item.score.total_points)}`}>{signedScore(item.score.total_points)}</div>
            {detail?.game.elo_affected && item.elo_delta != null ? <div className={`text-[11px] tabular-nums ${pointsTone(item.elo_delta)}`}>{formatEloDelta(item.elo_delta)}</div> : <div className="text-[11px] text-white/25">баллы</div>}
          </div>
          <span className="shrink-0 text-white/30 transition group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="space-y-2 border-t border-white/[0.06] px-3 pb-3 pt-2.5 text-[12px] text-white/55">
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
          {item.player_id ? <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id!)} className="min-h-9 rounded-xl bg-white/[0.07] px-3 text-[12px] text-white/70">Открыть профиль игрока</button> : null}
          <div className="border-t border-white/[0.06] pt-2 text-[11px] text-white/35">
            {detail?.game.elo_affected && item.elo_delta != null
              ? `Elo: ${formatEloDelta(item.elo_delta)}${item.elo_before != null && item.elo_after != null ? ` · было ${shortNumber(item.elo_before)}, стало ${shortNumber(item.elo_after)}` : ''}`
              : 'Эта игра рейтинг Elo не меняет.'}
          </div>
        </div>
      </details>
    );
  };

  const winnerTone = detail?.game.winner_team === 'red' ? 'from-rose-500/20 via-rose-500/[0.07]' : detail?.game.winner_team === 'black' ? 'from-slate-300/20 via-slate-300/[0.06]' : 'from-white/10 via-white/[0.03]';
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
      <button type="button" onClick={onBack} className="self-start rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/65">
        ← Назад к играм
      </button>

      {loading && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игры…</p>}
      {error && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/55">{error}</p>}

      {detail && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
          <section data-testid="game-hero" className={`relative min-h-[180px] overflow-hidden rounded-[30px] border border-amber-200/15 bg-gradient-to-br ${winnerTone} to-[#101116] p-5 sm:p-6`}>
            <div aria-hidden="true" className="pointer-events-none absolute -right-7 -bottom-8 text-[160px] leading-none text-amber-200/[.055]">♠</div>
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">2LA Noire · Игра №{detail.game.game_number}</div>
                <h1 className="mt-1 text-xl font-semibold leading-6 text-white">{detail.game.title}</h1>
                <p className="mt-1 text-sm text-white/45">{formatDate(detail.game.date)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/60">
                {detail.game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizeEveningFormat(detail.game.format)]}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-white">{winnerLabel(detail.game.winner_team)}</div>
                <div className="text-sm text-white/50">{endReasonLabel(detail.protocol.end_reason)}</div>
              </div>
            </div>
            {(detail.game.table_name || detail.game.judge_name) && (
              <div className="mt-3 text-xs text-white/40">
                {[detail.game.table_name, detail.game.judge_name ? `судья ${detail.game.judge_name}` : null].filter(Boolean).join(' · ')}
              </div>
            )}
          </section>

          {me && (
            <section data-testid="game-mine" className="rounded-3xl border border-sky-200/20 bg-sky-200/[0.06] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/60">Ваша игра</div>
              <div className="mt-2 flex items-center gap-3">
                <Avatar player={me} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><RoleChip role={me.role} /><span className={`text-sm font-semibold ${me.won ? 'text-emerald-300' : 'text-rose-300'}`}>{me.won ? 'Победа' : 'Поражение'}</span></div>
                  <div className="mt-1 text-xs text-white/45">Место за столом {me.seat_number}{exitLabel(me.exit_type) ? ` · ${exitLabel(me.exit_type)}` : ''}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-2xl font-semibold tabular-nums ${pointsTone(me.score.total_points)}`}>{signedScore(me.score.total_points)}</div>
                  <div className="text-[11px] text-white/40">{detail.game.elo_affected && me.elo_delta != null ? formatEloDelta(me.elo_delta) : 'баллов за игру'}</div>
                </div>
              </div>
            </section>
          )}

            </div>
            <GameTableScene players={detail.players} winner={detail.game.winner_team} selfId={selfId} />
          </div>

          <section aria-label="Ход игры в цифрах" className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] border border-white/10 bg-gradient-to-br from-white/[.08] to-black/25 p-3">
              <div className="text-[10px] uppercase tracking-wider text-white/45">Игроков</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{detail.players.length}</div>
              <div className="mt-1 text-[10px] text-white/45">за столом</div>
            </div>
            <div className="rounded-[20px] border border-rose-200/15 bg-gradient-to-br from-rose-300/[.09] to-black/25 p-3">
              <div className="text-[10px] uppercase tracking-wider text-white/45">Голосования</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{detail.protocol.votes.length}</div>
              <div className="mt-1 text-[10px] text-white/45">в протоколе</div>
            </div>
            <div className="rounded-[20px] border border-violet-200/15 bg-gradient-to-br from-violet-300/[.09] to-black/25 p-3">
              <div className="text-[10px] uppercase tracking-wider text-white/45">Ночи</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{detail.protocol.shots.length}</div>
              <div className="mt-1 text-[10px] text-white/45">выстрелов</div>
            </div>
          </section>

          {keyMoments.length > 0 && (
            <Section title="Главное в игре">
              <ul className="grid gap-2 sm:grid-cols-2">
                {keyMoments.map((moment, index) => (
                  <li key={`${moment.label}:${index}`} className="rounded-[20px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[.07] to-black/25 px-3 py-3">
                    <div className="text-[11px] text-white/40">{moment.label}</div>
                    <div className="mt-0.5 text-sm font-medium text-white/90">{moment.value}</div>
                    {moment.extra ? <div className="mt-0.5 text-[12px] text-white/50">{moment.extra}</div> : null}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Составы и баллы" hint="На схеме выше — места за столом. Здесь откройте участника, чтобы увидеть его действия и начисления.">
            <div className="grid gap-4 lg:grid-cols-2">
              {sides.map((side) => (
                <div key={side.team}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${side.team === 'red' ? 'bg-rose-500' : 'bg-slate-200'}`} aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-white/80">{side.title}</h3>
                    {detail.game.winner_team === side.team ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-200">победили</span> : null}
                  </div>
                  <div className="grid gap-2">{side.players.map(renderPlayer)}</div>
                </div>
              ))}
              {unassigned.length ? <div className="space-y-2">{unassigned.map(renderPlayer)}</div> : null}
            </div>
          </Section>

          {detail.protocol.reveals?.length ? (
            <Section title="Вскрытия" hint="Кто назвал себя шерифом и какие проверки объявил. Это слова за столом, а не ночные проверки.">
              <ul data-testid="game-reveals" className="space-y-2.5">
                {detail.protocol.reveals.map((reveal) => {
                  const owner = seatPlayer(reveal.seat);
                  return (
                    <li key={reveal.seat} className="rounded-2xl bg-black/20 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-white/80">{seatLabel(reveal.seat)}</span>
                        <RoleChip role={owner?.role ?? null} />
                      </div>
                      {reveal.checks.length ? (
                        <ul className="mt-2 space-y-1.5">
                          {reveal.checks.map((check) => {
                            const target = seatPlayer(check.target);
                            const truth = target?.team === 'black' ? 'black' : target?.team === 'red' ? 'red' : null;
                            const lie = truth !== null && truth !== check.color;
                            return (
                              <li key={check.target} className="flex items-center justify-between gap-2 text-[12px]">
                                <span className="min-w-0 truncate text-white/65">{seatLabel(check.target)}</span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${check.color === 'black' ? 'bg-slate-200/15 text-slate-100' : 'bg-rose-400/15 text-rose-100'}`}>назвал {check.color === 'black' ? 'чёрным' : 'красным'}</span>
                                  {target ? <RoleChip role={target.role} /> : null}
                                  {lie ? <span className="text-[11px] text-amber-200/80">неправда</span> : null}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : <div className="mt-1 text-[12px] text-white/40">Проверок не объявлял.</div>}
                    </li>
                  );
                })}
              </ul>
              {detail.protocol.reveal_versions?.length ? (
                <div data-testid="game-reveal-versions" className="mt-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100/55">Две версии стола</div>
                  <div className="mt-1 text-[11px] leading-4 text-white/40">Если шериф он, то чёрные те, кого он назвал, и тот, кто вскрылся против него. Верна ровно одна версия.</div>
                  <ul className="mt-2 space-y-2">
                    {detail.protocol.reveal_versions.map((version) => {
                      const claimant = seatPlayer(version.claimant);
                      const real = claimant?.role === 'sheriff';
                      return (
                        <li key={version.claimant} className={`rounded-xl px-3 py-2 text-[12px] ${real ? 'bg-emerald-400/10' : 'bg-black/20'}`}>
                          <div className="flex items-center justify-between gap-2"><b className="min-w-0 truncate text-white/80">Шериф — {seatLabel(version.claimant)}</b>{claimant ? <span className={`shrink-0 text-[11px] ${real ? 'text-emerald-200/80' : 'text-amber-200/80'}`}>{real ? 'верная версия' : 'ложная версия'}</span> : null}</div>
                          <div className="mt-1 text-white/55">Чёрные: {version.blacks.length ? version.blacks.map((seat) => `#${seat}`).join(', ') : '—'}{version.reds.length ? ` · красные: ${version.reds.map((seat) => `#${seat}`).join(', ')}` : ''}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </Section>
          ) : null}

          {(story.length > 0 || detail.protocol.replacement) && (
            <Section title="Ход игры" hint="Хронология партии: голосования, переголосования и ночные выстрелы. Шкалы показывают доли голосов среди выставленных кандидатов.">
              <ol data-testid="game-story-timeline" className="relative space-y-3 border-l-2 border-amber-200/20 pl-4 sm:pl-6">
                {story.map((entry) => {
                  if (entry.kind === 'night') {
                    const shot = entry.shot;
                    const tone = shot.result === 'killed' ? 'bg-rose-400/12 text-rose-100' : 'bg-white/[0.07] text-white/65';
                    return (
                      <li key={entry.key} className="relative rounded-[22px] border border-violet-200/15 bg-gradient-to-br from-violet-200/[.075] via-[#18141e] to-[#101216] p-4 before:absolute before:-left-[22px] before:top-5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-violet-200/70 before:bg-[#090a0d] sm:before:-left-[30px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white/90"><span aria-hidden="true" className="text-lg">☾</span> Ночь {shot.night_number}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{shotResultLabel(shot.result)}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2 text-[13px] text-white/75"><span aria-hidden="true" className="text-xl text-violet-200/70">⌖</span><span>Мафия стреляла в <b className="font-semibold text-white/90">{seatLabel(shot.target_seat)}</b></span></div>
                      </li>
                    );
                  }
                  const vote = entry.vote;
                  const counts = vote.nominated_seats.map((seat) => ({ seat, votes: Number(vote.vote_counts[String(seat)] || 0) }));
                  const top = Math.max(1, ...counts.map((item) => item.votes));
                  const leaders = counts.filter((item) => item.votes === top && top > 0);
                  const result = vote.outcome === 'tie_revote' ? 'Ничья — переголосование'
                    : vote.outcome === 'night' ? 'Никто не заголосован — наступает ночь'
                    : vote.outcome === 'eliminated' ? (leaders.length === 1 ? `Заголосован ${seatLabel(leaders[0].seat)}` : 'Игрок заголосован')
                    : vote.outcome ? vote.outcome.replaceAll('_', ' ') : null;
                  return (
                    <li key={entry.key} className="relative rounded-[22px] border border-rose-200/15 bg-gradient-to-br from-rose-200/[.055] via-[#171316] to-[#101216] p-4 before:absolute before:-left-[22px] before:top-5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-rose-200/70 before:bg-[#090a0d] sm:before:-left-[30px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-semibold text-white/90"><span aria-hidden="true" className="text-lg text-rose-200/70">◉</span>{vote.day_number === 0 ? 'Нулевой круг' : `День ${vote.day_number}`}{vote.is_revote ? ' · переголосование' : ''}</span>
                        {vote.eligible_voters != null ? <span className="shrink-0 text-[11px] text-white/35">голосуют {vote.eligible_voters}</span> : null}
                      </div>
                      <VoteSplitScene eligible={vote.eligible_voters} candidates={counts.map((item) => ({ seat: item.seat, nickname: seatPlayer(item.seat)?.nickname || "Неизвестный игрок", votes: item.votes, team: seatPlayer(item.seat)?.team }))} />
                      {result ? <div className="mt-3 rounded-xl border border-white/[.08] bg-black/25 px-3 py-2 text-[12px] font-medium text-white/75">{result}</div> : null}
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
        </>
      )}
    </>
  );
}
