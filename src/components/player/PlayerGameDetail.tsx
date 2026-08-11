import React from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';

export type PlayerGameEloChange = {
  id: string;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
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
  players: Array<{
    player_id: string | null;
    nickname: string;
    avatar_url: string | null;
    seat_number: number;
    role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
    team: 'red' | 'black' | null;
    won: boolean;
    exit_type: string | null;
    regular_fouls: number;
    minor_technical_fouls: number;
    major_technical_fouls: number;
    judge_bonus: number;
    protocol_bonus: number;
    ci_points: number;
    penalty_points: number;
    disciplinary_penalty_points: number;
    first_killed: boolean;
    zero_round_voted: boolean;
    best_move: boolean;
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

const shortNumber = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
};

export const formatEloDelta = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return 'Elo не меняется';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${shortNumber(rounded)} Elo`;
};

const eloClass = (value: number | null) => {
  if (value == null || Math.abs(value) < 0.0001) return 'text-white/45';
  return value > 0 ? 'text-emerald-300' : 'text-rose-300';
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
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
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-white/85">{winnerLabel(detail.game.winner_team)}</div>
              <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-white/55">
                {detail.game.source === 'tournament'
                  ? 'Турнир'
                  : EVENING_FORMAT_LABELS[normalizeEveningFormat(detail.game.format)]}
              </span>
            </div>
            {(detail.game.table_name || detail.game.judge_name) && (
              <div className="mt-2 text-xs text-white/35">
                {[detail.game.table_name, detail.game.judge_name ? `судья ${detail.game.judge_name}` : null].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="mt-3 rounded-2xl bg-black/20 px-3 py-2.5 text-xs text-white/45">
              {detail.game.elo_affected
                ? 'Elo рассчитан по состоянию рейтинга перед этой игрой.'
                : 'Эта игра не влияет на Elo.'}
            </div>
          </Section>

          <Section title="Игроки">
            <div className="space-y-2">
              {detail.players.map((item) => {
                const isSelf = item.player_id === selfId;
                const pointParts = [
                  item.judge_bonus ? `судья ${item.judge_bonus > 0 ? '+' : ''}${item.judge_bonus}` : null,
                  item.protocol_bonus ? `бонус ${item.protocol_bonus > 0 ? '+' : ''}${item.protocol_bonus}` : null,
                  item.ci_points ? `CI ${item.ci_points > 0 ? '+' : ''}${item.ci_points}` : null,
                  item.penalty_points ? `штраф ${item.penalty_points}` : null,
                  item.disciplinary_penalty_points ? `дисц. ${item.disciplinary_penalty_points}` : null,
                ].filter(Boolean);

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
                        <div className={`text-sm font-semibold ${eloClass(item.elo_delta)}`}>{formatEloDelta(item.elo_delta)}</div>
                        {item.elo_before != null && item.elo_after != null && (
                          <div className="mt-0.5 text-[10px] text-white/30">{shortNumber(item.elo_before)} → {shortNumber(item.elo_after)}</div>
                        )}
                      </div>
                    </div>

                    {(item.first_killed || item.best_move || item.zero_round_voted || pointParts.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-white/50">
                        {item.first_killed && <span className="rounded-full bg-white/[0.06] px-2 py-1">ПУ</span>}
                        {item.best_move && <span className="rounded-full bg-white/[0.06] px-2 py-1">ЛХ</span>}
                        {item.zero_round_voted && <span className="rounded-full bg-white/[0.06] px-2 py-1">0 круг</span>}
                        {pointParts.map((part) => <span key={String(part)} className="rounded-full bg-white/[0.06] px-2 py-1">{part}</span>)}
                      </div>
                    )}
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
