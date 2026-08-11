import React from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';

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

const formatDate = (value: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const roleLabel = (role: PlayerGameDetailData['players'][number]['role']) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Роль не указана';
};

const winnerLabel = (winner: PlayerGameDetailData['game']['winner_team']) => {
  if (winner === 'red') return '🔴 Победа красных';
  if (winner === 'black') return '⚫ Победа чёрных';
  return 'Результат не указан';
};

const endReasonLabel = (reason: string) => {
  if (!reason || reason === 'normal') return 'Обычное завершение';
  if (reason === 'ppk') return 'Игра завершена ППК';
  return reason;
};

const exitLabel = (exit: string | null) => {
  if (exit === 'alive') return 'дожил до конца';
  if (exit === 'killed') return 'убит ночью';
  if (exit === 'voted_zero_round') return 'заголосован в 0 круг';
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

const voteOutcomeLabel = (outcome: string | null) => {
  if (!outcome) return null;
  if (outcome === 'tie_revote') return 'ничья → переголосование';
  if (outcome === 'night') return 'никто не покинул стол → ночь';
  if (outcome === 'eliminated') return 'игрок покинул стол';
  return outcome.replaceAll('_', ' ');
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

function PersonTag({ person, prefix }: { person: ProtocolPerson; prefix: string }) {
  if (!person) return null;
  return (
    <div className="rounded-2xl bg-black/20 px-3 py-2 text-sm text-white/70">
      <span className="text-white/40">{prefix}: </span>
      <span className="font-medium text-white/85">#{person.seat_number} {person.nickname}</span>
    </div>
  );
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

  return (
    <>
      <button type="button" onClick={onBack} className="self-start rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/65">
        ← Назад к играм
      </button>

      {loading && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игры…</p>}
      {error && <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/55">{error}</p>}

      {detail && (
        <>
          <div className="px-1 pb-1 pt-2">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire · Игра №{detail.game.game_number}</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">{detail.game.title}</h1>
            <p className="mt-1 text-sm text-white/45">{formatDate(detail.game.date)}</p>
          </div>

          <Section title="Итог игры">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white/90">{winnerLabel(detail.game.winner_team)}</div>
                <div className="mt-1 text-sm text-white/45">{endReasonLabel(detail.protocol.end_reason)}</div>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-white/55">
                {detail.game.source === 'tournament'
                  ? 'Турнир'
                  : EVENING_FORMAT_LABELS[normalizeEveningFormat(detail.game.format)]}
              </span>
            </div>
            {(detail.game.table_name || detail.game.judge_name) && (
              <div className="mt-3 text-xs text-white/35">
                {[detail.game.table_name, detail.game.judge_name ? `судья ${detail.game.judge_name}` : null].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="mt-3 space-y-2">
              <PersonTag person={detail.protocol.first_killed} prefix="ПУ" />
              <PersonTag person={detail.protocol.zero_round_voted} prefix="Заголосован в 0 круг" />
              <PersonTag person={detail.protocol.ppk_culprit} prefix="ППК" />
            </div>
            {detail.protocol.judge_notes && (
              <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-3 text-sm leading-5 text-white/60">
                <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/30">Заметка судьи</div>
                {detail.protocol.judge_notes}
              </div>
            )}
          </Section>

          {(detail.protocol.votes.length > 0 || detail.protocol.shots.length > 0 || detail.protocol.replacement) && (
            <Section title="Как проходила игра">
              {detail.protocol.votes.length > 0 && (
                <div>
                  <div className="mb-2 text-sm font-medium text-white/75">Голосования</div>
                  <div className="space-y-2">
                    {detail.protocol.votes.map((round) => {
                      const outcome = voteOutcomeLabel(round.outcome);
                      return (
                        <div key={round.round_number} className="rounded-2xl bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-white/80">
                              {round.day_number === 0 ? 'Нулевой круг' : `День ${round.day_number}`}
                              {round.is_revote ? ' · переголосование' : ''}
                            </div>
                            {round.eligible_voters != null && <div className="text-[10px] text-white/30">голосуют {round.eligible_voters}</div>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {round.nominated_seats.map((seat) => {
                              const candidate = seatPlayer(seat);
                              const count = Number(round.vote_counts[String(seat)] || 0);
                              return (
                                <span key={seat} className="rounded-xl bg-white/[0.06] px-2 py-1.5 text-xs text-white/65">
                                  #{seat}{candidate ? ` ${candidate.nickname}` : ''} · {count}
                                </span>
                              );
                            })}
                          </div>
                          {outcome && <div className="mt-2 text-[11px] text-white/35">Итог: {outcome}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detail.protocol.shots.length > 0 && (
                <div className={detail.protocol.votes.length ? 'mt-4' : ''}>
                  <div className="mb-2 text-sm font-medium text-white/75">Ночи</div>
                  <div className="space-y-2">
                    {detail.protocol.shots.map((shot) => {
                      const target = seatPlayer(shot.target_seat);
                      return (
                        <div key={shot.night_number} className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2.5">
                          <span className="text-sm text-white/55">Ночь {shot.night_number}</span>
                          <span className="text-right text-sm text-white/75">
                            #{shot.target_seat}{target ? ` ${target.nickname}` : ''} · {shotResultLabel(shot.result)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detail.protocol.replacement && (
                <div className="mt-4 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">В протоколе зафиксирована замена игрока.</div>
              )}
            </Section>
          )}

          <Section title="Игроки и баллы">
            <div className="space-y-2">
              {detail.players.map((item) => {
                const isSelf = item.player_id === selfId;
                const scoreParts = [
                  item.score.win_point ? { label: 'победа', value: item.score.win_point } : null,
                  item.score.judge_bonus ? { label: 'судья', value: item.score.judge_bonus } : null,
                  item.score.protocol_bonus ? { label: 'протокол', value: item.score.protocol_bonus } : null,
                  item.score.best_move_points ? { label: 'ЛХ', value: item.score.best_move_points } : null,
                  item.score.ci_points ? { label: 'CI', value: item.score.ci_points } : null,
                  item.score.disciplinary_penalty_points ? { label: 'дисциплина', value: -item.score.disciplinary_penalty_points } : null,
                ].filter(Boolean) as Array<{ label: string; value: number }>;
                const exit = exitLabel(item.exit_type);

                return (
                  <div key={`${item.seat_number}:${item.player_id || item.nickname}`} className={`rounded-2xl border p-3 ${isSelf ? 'border-white/20 bg-white/[0.08]' : 'border-transparent bg-black/20'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-5 shrink-0 text-center text-xs font-semibold text-white/35">{item.seat_number}</div>
                      {item.avatar_url ? (
                        <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/65">
                          {item.nickname.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{item.nickname}{isSelf ? ' · вы' : ''}</div>
                        <div className="mt-0.5 text-xs text-white/40">{roleLabel(item.role)} · {item.won ? 'победа' : 'поражение'}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-white/30">Итого</div>
                        <div className={`text-lg font-semibold ${item.score.total_points > 0 ? 'text-emerald-300' : item.score.total_points < 0 ? 'text-rose-300' : 'text-white/75'}`}>
                          {signedScore(item.score.total_points)}
                        </div>
                      </div>
                    </div>

                    {scoreParts.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        {scoreParts.map((part) => (
                          <span key={`${part.label}:${part.value}`} className={`rounded-full px-2 py-1 ${part.value > 0 ? 'bg-emerald-400/10 text-emerald-200/80' : 'bg-rose-400/10 text-rose-200/80'}`}>
                            {part.label} {signedScore(part.value)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-[11px] text-white/30">Дополнительных начислений нет.</div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-white/50">
                      {exit && <span className="rounded-full bg-white/[0.06] px-2 py-1">{exit}</span>}
                      {item.exit_order != null && <span className="rounded-full bg-white/[0.06] px-2 py-1">уход #{item.exit_order}</span>}
                      {item.regular_fouls > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-1">фолы {item.regular_fouls}</span>}
                      {item.minor_technical_fouls > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-1">мал. тех {item.minor_technical_fouls}</span>}
                      {item.major_technical_fouls > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-1">бол. тех {item.major_technical_fouls}</span>}
                      {item.first_killed && <span className="rounded-full bg-white/[0.06] px-2 py-1">ПУ</span>}
                      {item.zero_round_voted && <span className="rounded-full bg-white/[0.06] px-2 py-1">0 круг</span>}
                    </div>

                    {item.best_move && (
                      <div className="mt-2 rounded-xl bg-white/[0.045] px-2.5 py-2 text-xs text-white/55">
                        ЛХ: {item.best_move_seats.length ? item.best_move_seats.map((seat) => `#${seat}`).join(', ') : 'без номеров'}
                      </div>
                    )}

                    {item.color_protocol.length > 0 && (
                      <div className="mt-2 rounded-xl bg-white/[0.045] px-2.5 py-2 text-xs text-white/55">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-white/30">Цветовой протокол</div>
                        {item.color_protocol.map((entry, index) => (
                          <div key={`${entry.mark}:${index}`}>{colorMarkLabel(entry.mark)}: {entry.seat_numbers.length ? entry.seat_numbers.map((seat) => `#${seat}`).join(', ') : '—'}</div>
                        ))}
                      </div>
                    )}

                    {(item.removal_reason || item.notes) && (
                      <div className="mt-2 text-[11px] leading-5 text-white/35">
                        {item.removal_reason && <div>Причина удаления: {item.removal_reason}</div>}
                        {item.notes && <div>{item.notes}</div>}
                      </div>
                    )}

                    <div className="mt-3 border-t border-white/[0.06] pt-2 text-[10px] text-white/28">
                      {detail.game.elo_affected && item.elo_delta != null
                        ? `Elo: ${formatEloDelta(item.elo_delta)}${item.elo_before != null && item.elo_after != null ? ` · ${shortNumber(item.elo_before)} → ${shortNumber(item.elo_after)}` : ''}`
                        : 'Elo: эта игра рейтинг не меняет'}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
