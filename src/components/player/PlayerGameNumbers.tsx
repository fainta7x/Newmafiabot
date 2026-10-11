import type { TargetCounts } from '../../lib/gameActionFacts';
import type { PlayerGameStatistics, Share } from '../../lib/gameStatistics';

/**
 * «Игра в цифрах» in the player's career: how accurate his votes, nominations and best moves are, how often he was the
 * first killed, how the sheriff / don checks went. Counted from the chronology of his own games, so a block with no such
 * game stays hidden, and a figure with nothing behind it shows «—».
 */

/** «По 1 игре», «По 2 играм», «По 21 игре»: the case follows the last digits of the number. */
const gamesDative = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'игре' : 'играм');
const percentText = (value: Share) => (value.percent === null ? '—' : `${value.percent}%`);

function Tile({ title, value, hint }: { title: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-white/[0.05] bg-black/15 p-3">
    <div className="text-[11px] font-semibold text-white/45">{title}</div>
    <div className="mt-1 text-xl font-black">{value}</div>
    <div className="mt-0.5 text-[11px] leading-snug text-white/25">{hint}</div>
  </div>;
}

export default function PlayerGameNumbers({ stats }: { stats: PlayerGameStatistics | null | undefined }) {
  if (!stats || stats.games === 0) return null;
  const tiles: Array<{ title: string; value: string; hint: string }> = [];
  if (stats.votesAsRed.total > 0) tiles.push({ title: 'Голоса красным в чёрных', value: percentText(stats.votesAsRed), hint: `голосов за чёрных: ${stats.votesAsRed.count} из ${stats.votesAsRed.total} (за красных)` });
  if (stats.nominationsAsRed.total > 0) tiles.push({ title: 'Меткость выставлений', value: percentText(stats.nominationsAsRed), hint: `выставил чёрных: ${stats.nominationsAsRed.count} из ${stats.nominationsAsRed.total}` });
  if (stats.bestMove.count > 0) tiles.push({ title: 'Лучший ход', value: stats.bestMove.averageBlack === null ? '—' : `${stats.bestMove.averageBlack} из 3`, hint: `чёрных в среднем, ходов: ${stats.bestMove.count}` });
  if (stats.firstKilled.total > 0) tiles.push({ title: 'Первым убитым', value: `${stats.firstKilled.count}`, hint: `из ${stats.firstKilled.total} игр за красных` });
  if (stats.sheriffChecks.total > 0) tiles.push({ title: 'Чёрные проверки шерифа', value: percentText(stats.sheriffChecks), hint: `нашёл чёрных: ${stats.sheriffChecks.count} из ${stats.sheriffChecks.total}` });
  if (stats.donChecks.total > 0) tiles.push({ title: 'Проверки Дона', value: percentText(stats.donChecks), hint: `нашёл Шерифа: ${stats.donChecks.count} из ${stats.donChecks.total}` });
  if (!tiles.length && !stats.actions) return null;
  return <section className="mt-3 rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4" aria-label="Игра в цифрах">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Игра в цифрах</div>
    <div className="mt-0.5 text-[11px] text-white/20">По {stats.games} {gamesDative(stats.games)} с журналом ходов</div>
    <div className="mt-3 grid grid-cols-2 gap-2">{tiles.map((tile) => <Tile key={tile.title} {...tile} />)}</div>
    {stats.actions && <details data-testid="game-action-metrics" className="mt-4 border-t border-white/10 pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Проверки и голосования</summary>
      <p className="mt-2 text-xs leading-relaxed text-white/55">Не считаем нулевой круг и попилы, где решали «поднять» или «оставить». Переголосование — один итоговый голос за день. Шериф считается красным.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{[
        ['Голосования · играл красным',stats.actions.votes.red], ['Голосования · играл чёрным',stats.actions.votes.black],
        ['Критический круг · играл красным',stats.actions.criticalVotes.red], ['Критический круг · играл чёрным',stats.actions.criticalVotes.black],
        ['Проверки шерифом',stats.actions.checks.sheriff], ['Проверки доном',stats.actions.checks.don],
      ].map(([title,raw]) => { const counts = raw as TargetCounts;return <div key={String(title)} className="rounded-2xl bg-black/20 p-3"><h3 className="text-sm font-semibold">{String(title)}</h3><dl className="mt-2 space-y-1 text-sm text-white/65"><div className="flex justify-between gap-2"><dt>В красных</dt><dd>{counts.red}</dd></div><div className="flex justify-between gap-2"><dt>В чёрных</dt><dd>{counts.black}</dd></div><div className="flex justify-between gap-2"><dt>В том числе в шерифа</dt><dd>{counts.sheriff}</dd></div>{counts.unknown > 0 && <div className="flex justify-between gap-2"><dt>Роль неизвестна</dt><dd>{counts.unknown}</dd></div>}</dl></div>;})}</div>
      <p className="mt-3 text-xs leading-relaxed text-white/50">Критический круг — когда ошибка в красного ведёт к паритету сразу или после следующего отстрела. Это только факты действий, а не оценка речей: красная проверка шерифа бывает полезной.</p>
      {stats.actions.unknownCriticalDays > 0 && <p className="mt-2 text-xs text-white/50">Ещё {stats.actions.unknownCriticalDays} голосований без достаточных данных о живых: в критические не включены.</p>}
    </details>}
  </section>;
}
