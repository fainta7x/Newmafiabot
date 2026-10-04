import React, { useMemo, useState } from 'react';
import type { PlayerResultData } from '../../../../lib/api';
import type { LiveGameEvent } from '../../../../shared/liveGameEvents';
import { buildGameAnalysis, type AnalysisCircle } from '../../../../lib/liveGameAnalysis';
import { ROLE_LABELS } from '../../../../lib/tournamentRoleValidation';

const OUTCOME_TEXT: Record<string, string> = {
  single_eliminated: 'выбывает один',
  tie_revote: 'ничья — переголосование',
  all_tied_eliminated: 'выбывают все спорные',
  no_elimination: 'никто не выбывает',
};
const EXIT_TEXT: Record<string, string> = {
  killed: 'убит', night_kill: 'убит', voted_day: 'заголосован', voted_zero_round: 'заголосован в нулевом круге', removed: 'удалён',
};
const CHECK_TEXT: Record<string, string> = { sheriff: 'Шериф', not_sheriff: 'не Шериф', red: 'красный', black: 'чёрный', Красный: 'красный', Чёрный: 'чёрный' };

const roundTitle = (round: number) => (round <= 1 ? 'Нулевой круг и первая ночь' : `Круг ${round - 1}`);

/**
 * «Разбор партии» (owner, 2026-10-04): the whole live game circle by circle — who nominated whom, every voting with the
 * voters, the shots and checks of the night, who left the game and how. Read-only; built from the engine chronology.
 */
export const GameAnalysis: React.FC<{ events?: LiveGameEvent[]; playerResults: PlayerResultData[] }> = ({ events, playerResults }) => {
  const analysis = useMemo(() => buildGameAnalysis(events || []), [events]);
  const [openRound, setOpenRound] = useState<number | null>(null);
  const people = useMemo(() => new Map(playerResults.map((player) => [player.seat_number, player])), [playerResults]);

  if (!events?.length || !analysis.circles.length) return null;

  const who = (seat: number | null | undefined) => {
    if (!seat) return '—';
    const player = people.get(seat);
    return `#${seat}${player?.display_name ? ` ${player.display_name}` : ''}`;
  };
  const roleOf = (seat: number) => {
    const role = people.get(seat)?.role as keyof typeof ROLE_LABELS | null | undefined;
    return role && ROLE_LABELS[role] ? ROLE_LABELS[role] : null;
  };
  const seatChip = (seat: number, key?: React.Key) => (
    <span key={key ?? seat} className="inline-flex items-center rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200" title={who(seat)}>#{seat}</span>
  );

  const renderCircle = (circle: AnalysisCircle) => (
    <div className="space-y-3 border-t border-slate-800 px-3 py-3 text-[12px] leading-5 text-slate-300">
      {circle.nominations.length ? (
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Выставлены</div>
          <ul className="mt-1 space-y-0.5">
            {circle.nominations.map((item) => <li key={item.seat}>{item.by ? `${who(item.by)} → ` : ''}<b className="text-slate-100">{who(item.seat)}</b></li>)}
          </ul>
        </div>
      ) : null}
      {circle.votings.map((voting) => (
        <div key={voting.number} className="rounded-lg bg-slate-950/50 p-2">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{voting.number > 1 ? `Переголосование ${voting.number - 1}` : 'Голосование'}</div>
          {voting.votes.length ? (
            <ul className="mt-1 space-y-1.5">
              {voting.votes.map((row) => (
                <li key={row.candidate} className="flex flex-wrap items-center gap-1.5">
                  <b className="text-slate-100">{who(row.candidate)}</b>
                  <span className="text-slate-500">{row.voters.length}:</span>
                  {row.voters.map((voter) => seatChip(voter))}
                </li>
              ))}
            </ul>
          ) : <div className="mt-1 text-slate-500">Голоса не записаны.</div>}
          {voting.tableVoters.length ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-slate-400">Поднять: {voting.tableVoters.map((voter) => seatChip(voter))}</div> : null}
          {voting.outcome ? <div className="mt-1.5 font-semibold text-amber-300">{OUTCOME_TEXT[voting.outcome] || voting.outcome}</div> : null}
        </div>
      ))}
      {circle.shot || circle.donCheck || circle.sheriffCheck ? (
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ночь</div>
          <ul className="mt-1 space-y-0.5">
            {circle.shot ? <li>Выстрел мафии: <b className="text-slate-100">{who(circle.shot)}</b></li> : null}
            {circle.donCheck ? <li>Дон проверил {who(circle.donCheck.target)}: {circle.donCheck.result ? (CHECK_TEXT[circle.donCheck.result] || circle.donCheck.result) : '—'}</li> : null}
            {circle.sheriffCheck ? <li>Шериф проверил {who(circle.sheriffCheck.target)}: {circle.sheriffCheck.result ? (CHECK_TEXT[circle.sheriffCheck.result] || circle.sheriffCheck.result) : '—'}</li> : null}
          </ul>
        </div>
      ) : null}
      {circle.exits.length || circle.ppk.length ? (
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Выбыли</div>
          <ul className="mt-1 space-y-0.5">
            {circle.exits.map((item) => <li key={`${item.seat}-${item.reason}`}><b className="text-slate-100">{who(item.seat)}</b> — {EXIT_TEXT[item.reason] || item.reason}{roleOf(item.seat) ? ` (${roleOf(item.seat)})` : ''}</li>)}
            {circle.ppk.map((seat) => <li key={`ppk-${seat}`}><b className="text-slate-100">{who(seat)}</b> — ППК</li>)}
          </ul>
        </div>
      ) : null}
      {circle.bestMove ? <div>Лучший ход {circle.bestMove.seat ? `(${who(circle.bestMove.seat)})` : ''}: {circle.bestMove.seats.map((seat) => seatChip(seat))}</div> : null}
      {circle.fouls.length ? (
        <div className="text-slate-400">Фолы: {circle.fouls.map((item) => `#${item.seat} ${item.kind === 'foul' ? `Ф${item.value}` : item.kind === 'tech_minor' ? `Т${item.value}` : `ТБ${item.value}`}`).join(' · ')}</div>
      ) : null}
    </div>
  );

  return (
    <section className="mb-3 mt-4 rounded-xl border border-slate-700/70 bg-slate-900/60" data-testid="game-analysis">
      <div className="px-3 py-3">
        <div className="text-xs font-black uppercase tracking-wide text-slate-200">Разбор партии</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {analysis.winner ? <span className="rounded-full bg-slate-800 px-2 py-0.5 font-semibold text-slate-100">Победа {analysis.winner === 'red' ? 'красных' : 'чёрных'}</span> : null}
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">Кругов: {analysis.circles.length}</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">Голосов: {analysis.votesCast}</span>
          {analysis.firstKilled ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">Первый убитый: {who(analysis.firstKilled)}</span> : null}
        </div>
      </div>
      {analysis.circles.map((circle) => {
        const open = openRound === circle.round;
        return (
          <div key={circle.round} data-testid={`game-analysis-circle-${circle.round}`}>
            <button type="button" onClick={() => setOpenRound(open ? null : circle.round)} aria-expanded={open}
              className="flex w-full min-h-[44px] items-center justify-between gap-2 border-t border-slate-800 px-3 py-2 text-left text-xs font-bold text-slate-200">
              <span>{roundTitle(circle.round)}</span>
              <span className="text-slate-400">{open ? 'Скрыть' : 'Открыть'}</span>
            </button>
            {open ? renderCircle(circle) : null}
          </div>
        );
      })}
    </section>
  );
};

export default GameAnalysis;
