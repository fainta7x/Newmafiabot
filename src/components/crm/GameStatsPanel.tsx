import React from 'react';
import { formatShare } from '../../lib/analyticsFormat.ts';
import { AnalyticsHeading, AnalyticsHelp, AnalyticsStatus, analyticsCard, useAnalyticsQuery } from './analyticsShared.tsx';
import type { ClubGameStatistics, Share } from '../../lib/gameStatistics';

/**
 * «Игры в цифрах» in the organizer's analytics: what happens at the tables — how long games last, how often a voting
 * ends in a tie, how the night checks go. Counted from the chronology of finished games, so the older games without
 * a chronology are only named in the footnote.
 */

const card = analyticsCard;
const percentText = (value: Share) => formatShare(value.count,value.total);

function Tile({ title, value, hint, help='games' }: { title: string; value: string; hint: string; help?: Parameters<typeof AnalyticsHelp>[0]['name'] }) {
  return <div className="rounded-[12px] border border-border-soft bg-surface-2 p-3">
    <div className="flex items-start justify-between gap-1"><span className="min-w-0 break-words pt-2 text-xs text-text-secondary">{title}</span><AnalyticsHelp name={help} title={title} /></div>
    <div className="mt-1 text-[20px] font-black text-text-primary">{value}</div>
    <div className="mt-0.5 text-[12px] leading-snug text-text-secondary">{hint}</div>
  </div>;
}

export const GameStatsPanel: React.FC<{ period: string; active?: boolean }> = ({ period, active=true }) => {
  const query = useAnalyticsQuery<ClubGameStatistics & { capped?: boolean }>('/api/analytics/game-stats?period='+encodeURIComponent(period),active);
  const stats = query.data;
  if (!stats) return <section className={card}><AnalyticsHeading title="Игры в цифрах" help="games" caption="За период · завершённые игры" /><AnalyticsStatus {...query} /></section>;

  return <section className={card} aria-label="Игры в цифрах">
    <AnalyticsHeading title="Игры в цифрах" help="games" caption="За период · по дате сохранения протокола" />
    <AnalyticsStatus {...query} />
    {stats.capped && <p className="mt-2 text-xs text-text-secondary">Показаны 2000 последних завершённых игр периода.</p>}
    {stats.games === 0
      ? <p className="mt-3 text-[12px] text-text-secondary">За выбранный период нет игр с журналом ходов{stats.gamesTotal > 0 ? ` (игр всего: ${stats.gamesTotal})` : ''}. Журнал появляется у игр, сыгранных после его запуска.</p>
      : <>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile title="Игр с журналом" value={String(stats.games)} hint={`из ${stats.gamesTotal} завершённых за период`} />
          <Tile title="Дней голосования" help="gameDays" value={stats.averageVotingDays === null ? '—' : String(stats.averageVotingDays)} hint="в среднем за игру" />
          <Tile title="Переголосование" help="revotes" value={percentText(stats.revoteDays)} hint={`дней с ничьёй: ${stats.revoteDays.count} из ${stats.revoteDays.total}`} />
          <Tile title="Решение стола" help="tableDecision" value={percentText(stats.tableDecisions)} hint={`голосований: ${stats.tableDecisions.count} из ${stats.tableDecisions.total}`} />
          <Tile title="Мафия в первом голосовании (круг 0)" help="zeroRound" value={percentText(stats.zeroRound.blackVotedOut)} hint={`заголосованных: ${stats.zeroRound.blackVotedOut.count} из ${stats.zeroRound.games}`} />
          <Tile title="Шериф находит чёрных" help="sheriff" value={percentText(stats.nights.sheriffChecks)} hint={`проверок: ${stats.nights.sheriffChecks.total}`} />
          <Tile title="Дон находит Шерифа" help="don" value={percentText(stats.nights.donChecks)} hint={`проверок: ${stats.nights.donChecks.total}`} />
          <Tile title="Лучший ход с чёрным" help="bestMove" value={percentText(stats.firstKilled.bestMoveWithBlack)} hint={stats.firstKilled.averageBlackInBestMove === null ? 'ходов нет' : `в среднем ${stats.firstKilled.averageBlackInBestMove} из 3`} />
        </div>
        {stats.byLength.length > 0 && <div className="mt-4">
          <AnalyticsHeading title="Победы красных по длине игры" caption="За период · игры с известным победителем" help="redWins" />
          <div className="mt-2 space-y-1.5">
            {stats.byLength.map((row) => <div key={row.days} className="flex items-center gap-3 text-[12px]">
              <div className="w-24 shrink-0 text-text-secondary">{row.label} {row.days === 1 ? 'день' : 'дн.'}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${row.redWins.percent ?? 0}%` }} /></div>
              <div className="w-24 shrink-0 text-right font-semibold text-text-primary">{percentText(row.redWins)} <span className="font-normal text-text-secondary">· игр {row.games}</span></div>
            </div>)}
          </div>
        </div>}
      </>}
  </section>;
};
