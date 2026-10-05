import React, { useEffect, useState } from 'react';
import type { ClubGameStatistics, Share } from '../../lib/gameStatistics';

/**
 * «Игры в цифрах» in the organizer's analytics: what happens at the tables — how long games last, how often a voting
 * ends in a tie, how the night checks go. Counted from the chronology of finished games, so the older games without
 * a chronology are only named in the footnote.
 */

const card = 'rounded-[16px] border border-border-soft bg-surface-1 p-4';
const percentText = (value: Share) => (value.percent === null ? '—' : `${value.percent}%`);

function Tile({ title, value, hint }: { title: string; value: string; hint: string }) {
  return <div className="rounded-[12px] border border-border-soft bg-surface-2 p-3">
    <div className="text-[11px] font-semibold text-text-secondary">{title}</div>
    <div className="mt-1 text-[20px] font-black text-text-primary">{value}</div>
    <div className="mt-0.5 text-[11px] leading-snug text-text-secondary">{hint}</div>
  </div>;
}

export const GameStatsPanel: React.FC<{ period: string }> = ({ period }) => {
  const [stats, setStats] = useState<ClubGameStatistics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void fetch(`/api/analytics/game-stats?period=${encodeURIComponent(period)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('failed');
        const body = await response.json();
        if (!cancelled) setStats(body as ClubGameStatistics);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [period]);

  if (failed) return null;
  if (!stats) return <section className={card}><div className="text-xs text-text-secondary">Считаем игры…</div></section>;

  return <section className={card} aria-label="Игры в цифрах">
    <div>
      <h3 className="text-[15px] font-black text-text-primary">Игры в цифрах</h3>
      <p className="mt-1 text-[11px] text-text-secondary">Что происходит за столами: длина игр, ничьи, ночные проверки, лучший ход.</p>
    </div>
    {stats.games === 0
      ? <p className="mt-3 text-[12px] text-text-secondary">За выбранный период нет игр с журналом ходов{stats.gamesTotal > 0 ? ` (игр всего: ${stats.gamesTotal})` : ''}. Журнал появляется у игр, сыгранных после его запуска.</p>
      : <>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile title="Игр с журналом" value={String(stats.games)} hint={`из ${stats.gamesTotal} завершённых за период`} />
          <Tile title="Дней голосования" value={stats.averageVotingDays === null ? '—' : String(stats.averageVotingDays)} hint="в среднем за игру" />
          <Tile title="Переголосование" value={percentText(stats.revoteDays)} hint={`дней с ничьёй: ${stats.revoteDays.count} из ${stats.revoteDays.total}`} />
          <Tile title="Решение стола" value={percentText(stats.tableDecisions)} hint={`голосований: ${stats.tableDecisions.count} из ${stats.tableDecisions.total}`} />
          <Tile title="Мафия в нулевом круге" value={percentText(stats.zeroRound.blackVotedOut)} hint={`заголосованных: ${stats.zeroRound.blackVotedOut.count} из ${stats.zeroRound.games}`} />
          <Tile title="Шериф находит чёрных" value={percentText(stats.nights.sheriffChecks)} hint={`проверок: ${stats.nights.sheriffChecks.total}`} />
          <Tile title="Дон находит Шерифа" value={percentText(stats.nights.donChecks)} hint={`проверок: ${stats.nights.donChecks.total}`} />
          <Tile title="Лучший ход с чёрным" value={percentText(stats.firstKilled.bestMoveWithBlack)} hint={stats.firstKilled.averageBlackInBestMove === null ? 'ходов нет' : `в среднем ${stats.firstKilled.averageBlackInBestMove} из 3`} />
        </div>
        {stats.byLength.length > 0 && <div className="mt-4">
          <div className="text-[12px] font-bold text-text-primary">Победы красных по длине игры</div>
          <div className="mt-2 space-y-1.5">
            {stats.byLength.map((row) => <div key={row.days} className="flex items-center gap-3 text-[12px]">
              <div className="w-24 shrink-0 text-text-secondary">{row.label} {row.days === 1 ? 'день' : 'дн.'}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${row.redWins.percent ?? 0}%` }} /></div>
              <div className="w-28 shrink-0 text-right font-semibold text-text-primary">{percentText(row.redWins)} <span className="font-normal text-text-secondary">· игр {row.games}</span></div>
            </div>)}
          </div>
        </div>}
      </>}
  </section>;
};
