import React from 'react';
import { type PlayerGameHistoryItem } from '../../lib/api.ts';

const fmtDate = (value?: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const roleInfo = (role: PlayerGameHistoryItem['role']) => {
  if (role === 'don') return { label: 'Дон', icon: '🎩', className: 'border-purple-500/30 bg-purple-500/10 text-purple-300' };
  if (role === 'mafia') return { label: 'Мафия', icon: '🔫', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  if (role === 'sheriff') return { label: 'Шериф', icon: '⭐', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' };
  if (role === 'citizen') return { label: 'Мирный', icon: '❤️', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' };
  return { label: 'Роль не указана', icon: '•', className: 'border-border-soft bg-surface-1 text-text-secondary' };
};

const exitLabel = (value: string | null) => {
  if (value === 'killed') return 'Убит ночью';
  if (value === 'voted_zero_round') return 'Заголосован в 0 круге';
  if (value === 'voted_day') return 'Заголосован';
  if (value === 'removed') return 'Удалён';
  if (value === 'alive') return 'Дожил до конца';
  return value || 'Без отметки';
};

const signed = (value: number) => value > 0 ? `+${value}` : String(value);

interface PlayerGameCardProps {
  game: PlayerGameHistoryItem;
}

export const PlayerGameCard: React.FC<PlayerGameCardProps> = ({ game }) => {
  const role = roleInfo(game.role);
  const technicalFouls = game.minor_technical_fouls + game.major_technical_fouls;

  return (
    <article className="rounded-[16px] border border-border-soft bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 break-words text-[14px] font-semibold leading-5 text-text-primary">{game.title}</h4>
            <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
              {game.source === 'tournament' ? 'Турнир' : 'Клуб'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-text-secondary">
            {fmtDate(game.date)} · Игра #{game.game_number || '—'}{game.table_name ? ` · ${game.table_name}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
          game.status !== 'completed'
            ? 'bg-surface-1 text-text-muted'
            : game.won
              ? 'bg-success-soft text-success'
              : 'bg-danger-soft text-danger'
        }`}>
          {game.status !== 'completed' ? game.status : game.won ? 'Победа' : 'Поражение'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Роль</span>
          <span className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${role.className}`}>
            {role.icon} {role.label}
          </span>
        </div>
        <div className="rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Место</span>
          <strong className="mt-1 block text-[13px] text-text-primary">#{game.seat_number || '—'}</strong>
        </div>
        <div className="col-span-2 rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Итог для игрока</span>
          <strong className="mt-1 block text-[12px] text-text-primary">{exitLabel(game.exit_type)}</strong>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {game.best_move && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">
            Лучший ход{game.best_move_source === 'first_killed' ? ' · ПУ' : game.best_move_source === 'zero_round_voted' ? ' · 0 круг' : ''}
          </span>
        )}
        {game.first_killed && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">ПУ</span>}
        {game.zero_round_voted && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">0 круг</span>}
        {game.regular_fouls > 0 && <span className="rounded-full bg-surface-1 px-2.5 py-1 text-text-secondary">Фолы: {game.regular_fouls}</span>}
        {technicalFouls > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Тех: {technicalFouls}</span>}
        {game.judge_bonus !== 0 && <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">Судья {signed(game.judge_bonus)}</span>}
        {game.protocol_bonus !== 0 && <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">Протокол {signed(game.protocol_bonus)}</span>}
        {game.ci_points !== 0 && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">CI {signed(game.ci_points)}</span>}
        {game.penalty_points !== 0 && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Штраф {signed(game.penalty_points)}</span>}
        {game.disciplinary_penalty_points !== 0 && (
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Дисц. {signed(game.disciplinary_penalty_points)}</span>
        )}
      </div>
    </article>
  );
};

export default PlayerGameCard;
