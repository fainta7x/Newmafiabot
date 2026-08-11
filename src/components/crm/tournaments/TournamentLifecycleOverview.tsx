import React from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, Play, RotateCcw, Trophy, Users } from 'lucide-react';
import type { Tournament } from '../../../lib/api.ts';

type TournamentTab = 'organization' | 'games' | 'standings' | 'nominations';

interface TournamentLifecycleOverviewProps {
  tournament: Tournament;
  onNavigate: (tab: TournamentTab) => void;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
}

const statusLabel = (status: Tournament['status']) => {
  if (status === 'draft') return 'Подготовка';
  if (status === 'active') return 'Турнир идёт';
  if (status === 'correction') return 'Корректировка';
  return 'Завершён';
};

export const TournamentLifecycleOverview: React.FC<TournamentLifecycleOverviewProps> = ({
  tournament,
  onNavigate,
  onStart,
  onComplete,
  onReopen,
}) => {
  const games = tournament.games || [];
  const completedGames = games.filter((game) => game.status === 'completed').length;
  const activeGame = games.find((game) => game.status === 'active') || null;
  const completedProtocols = games.filter((game) => game.protocol_status === 'completed').length;
  const draftProtocols = games.filter((game) => game.protocol_status === 'draft').length;
  const participants = tournament.participants?.length ?? tournament.participants_count ?? 0;

  const startReady = Boolean(tournament.start_readiness?.ready);
  const completeReady = Boolean(tournament.complete_readiness?.isReady);
  const blockers = tournament.status === 'draft'
    ? (tournament.start_readiness?.errors || [])
    : tournament.status === 'active' || tournament.status === 'correction'
      ? (tournament.complete_readiness?.errors || [])
      : [];

  let actionLabel = 'Открыть игры';
  let actionDisabled = false;
  let action: () => void = () => onNavigate('games');

  if (tournament.status === 'draft') {
    if (startReady) {
      actionLabel = 'Запустить турнир';
      action = onStart;
    } else {
      actionLabel = 'Исправить подготовку';
      action = () => onNavigate('organization');
    }
  } else if (tournament.status === 'active') {
    if (completeReady) {
      actionLabel = 'Завершить турнир';
      action = onComplete;
    } else if (activeGame) {
      actionLabel = `Продолжить игру №${activeGame.game_number}`;
      action = () => onNavigate('games');
    } else {
      const nextGame = games.find((game) => game.status === 'planned');
      actionLabel = nextGame ? `Перейти к игре №${nextGame.game_number}` : 'Проверить завершение';
      action = () => onNavigate(nextGame ? 'games' : 'organization');
    }
  } else if (tournament.status === 'correction') {
    actionLabel = completeReady ? 'Завершить корректировку' : 'Открыть игры для исправления';
    action = completeReady ? onComplete : () => onNavigate('games');
  } else {
    actionLabel = 'Открыть итоговую таблицу';
    action = () => onNavigate('standings');
  }

  if (!games.length && tournament.status !== 'draft') actionDisabled = true;

  const progress = games.length ? Math.round((completedGames / games.length) * 100) : 0;

  return (
    <section className="rounded-[20px] border border-accent/20 bg-surface-1 p-4 sm:p-5" data-testid="tournament-lifecycle-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-black text-text-primary">Обзор турнира</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
              tournament.status === 'completed'
                ? 'border-border-soft bg-surface-2 text-text-muted'
                : tournament.status === 'correction'
                  ? 'border-warning/30 bg-warning-soft text-warning'
                  : tournament.status === 'active'
                    ? 'border-success/30 bg-success-soft text-success'
                    : 'border-accent/25 bg-accent-soft text-accent'
            }`}>
              {statusLabel(tournament.status)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-text-secondary">
            {tournament.status === 'draft'
              ? 'Проверь состав и рассадку перед запуском.'
              : tournament.status === 'active'
                ? activeGame ? `Сейчас идёт игра №${activeGame.game_number}.` : 'Активной игры сейчас нет.'
                : tournament.status === 'correction'
                  ? 'Публичные итоги скрыты до повторного завершения.'
                  : 'Турнир официально завершён, результаты зафиксированы.'}
          </p>
        </div>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={action}
          className="min-h-[44px] shrink-0 rounded-[12px] bg-accent px-4 text-[12px] font-black text-white disabled:opacity-40"
        >
          {actionLabel}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-[14px] bg-surface-2 p-3">
          <Users className="h-4 w-4 text-accent" />
          <strong className="mt-2 block text-[19px] leading-none text-text-primary">{participants}</strong>
          <span className="mt-1 block text-[10px] text-text-muted">участников</span>
        </div>
        <div className="rounded-[14px] bg-surface-2 p-3">
          <Trophy className="h-4 w-4 text-warning" />
          <strong className="mt-2 block text-[19px] leading-none text-text-primary">{completedGames}/{games.length}</strong>
          <span className="mt-1 block text-[10px] text-text-muted">игр завершено</span>
        </div>
        <div className="rounded-[14px] bg-surface-2 p-3">
          <ClipboardCheck className="h-4 w-4 text-success" />
          <strong className="mt-2 block text-[19px] leading-none text-text-primary">{completedProtocols}</strong>
          <span className="mt-1 block text-[10px] text-text-muted">протоколов готово</span>
        </div>
        <div className="rounded-[14px] bg-surface-2 p-3">
          {blockers.length ? <AlertCircle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
          <strong className={`mt-2 block text-[19px] leading-none ${blockers.length ? 'text-danger' : 'text-success'}`}>{blockers.length}</strong>
          <span className="mt-1 block text-[10px] text-text-muted">проблем</span>
        </div>
      </div>

      {games.length ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-text-muted">
            <span>Прогресс игр</span>
            <span>{progress}%{draftProtocols ? ` · черновиков протокола: ${draftProtocols}` : ''}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {blockers.length ? (
        <details className="mt-4 rounded-[14px] border border-danger/25 bg-danger-soft">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-[11px] font-black text-danger">
            <AlertCircle className="h-4 w-4" /> Что мешает перейти дальше · {blockers.length}
          </summary>
          <ul className="space-y-1 border-t border-danger/15 px-4 py-3 text-[11px] leading-4 text-text-secondary">
            {blockers.map((error, index) => <li key={`${index}:${error}`}>• {error}</li>)}
          </ul>
        </details>
      ) : null}

      {tournament.status === 'completed' ? (
        <button type="button" onClick={onReopen} className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-[11px] border border-warning/25 bg-warning-soft px-3 text-[11px] font-bold text-warning">
          <RotateCcw className="h-4 w-4" /> Вернуть на корректировку
        </button>
      ) : null}
    </section>
  );
};

export default TournamentLifecycleOverview;
