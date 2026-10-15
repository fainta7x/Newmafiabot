import type { TargetCounts } from '../../lib/gameActionFacts';
import type { PlayerGameStatistics, Share } from '../../lib/gameStatistics';

/**
 * «Точность решений» in the player's career: how accurate his votes, nominations and best moves are, how often he was the
 * first killed, how the sheriff / don checks went. Counted from the chronology of his own games, so a block with no such
 * game stays hidden, and a figure with nothing behind it shows «—».
 */

const percentText = (value: Share) => (value.percent === null ? '—' : `${value.percent}%`);

function Tile({ title, value, hint }: { title: string; value: string; hint: string; percent?: number | null }) {
  return <div className="flex min-w-0 items-start justify-between gap-3 py-3">
    <div className="min-w-0"><p className="text-sm font-medium text-white/85">{title}</p><p className="mt-1 text-xs leading-5 text-white/55">{hint}</p></div>
    <p className="shrink-0 text-lg font-semibold tabular-nums">{value}</p>
  </div>;
}

export default function PlayerGameNumbers({ stats, totalGames }: { stats: PlayerGameStatistics | null | undefined; totalGames?: number }) {
  if (!stats || stats.games === 0) return null;
  const tiles: Array<{ title: string; value: string; hint: string; percent?: number | null }> = [];
  if (stats.votesAsRed.total > 0) tiles.push({ title: 'Голоса в чёрных', value: percentText(stats.votesAsRed), hint: `${stats.votesAsRed.count} из ${stats.votesAsRed.total} голосов при игре за красных`, percent: stats.votesAsRed.percent });
  if (stats.nominationsAsRed.total > 0) tiles.push({ title: 'Меткость выставлений', value: percentText(stats.nominationsAsRed), hint: `${stats.nominationsAsRed.count} из ${stats.nominationsAsRed.total} в чёрных`, percent: stats.nominationsAsRed.percent });
  if (stats.bestMove.count > 0) tiles.push({ title: 'Лучший ход', value: stats.bestMove.averageBlack === null ? '—' : `${stats.bestMove.averageBlack} из 3`, hint: `чёрных в среднем, ходов: ${stats.bestMove.count}` });
  if (stats.firstKilled.total > 0) tiles.push({ title: 'Первым убитым', value: `${stats.firstKilled.count}`, hint: `из ${stats.firstKilled.total} игр за красных` });
  if (stats.sheriffChecks.total > 0) tiles.push({ title: 'Проверки шерифа', value: percentText(stats.sheriffChecks), hint: `${stats.sheriffChecks.count} из ${stats.sheriffChecks.total} в чёрных`, percent: stats.sheriffChecks.percent });
  if (stats.donChecks.total > 0) tiles.push({ title: 'Проверки Дона', value: percentText(stats.donChecks), hint: `${stats.donChecks.count} из ${stats.donChecks.total} в Шерифа`, percent: stats.donChecks.percent });
  if (!tiles.length && !stats.actions) return null;
  return <section className="border-t border-white/10 pt-4" aria-label="Точность решений">
    <div className="text-sm font-semibold text-white/85">Точность решений</div>
    <div className="mt-0.5 text-xs text-white/55">По всем доступным журналам: {stats.games} из {Math.max(stats.games, totalGames ?? stats.games)} игр</div>
    <div className="mt-2 divide-y divide-white/[.07]">{tiles.map((tile) => <Tile key={tile.title} {...tile} />)}</div>
    {stats.actions && <details data-testid="game-action-metrics" className="mt-4 border-t border-white/10 pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Проверки и голосования</summary>
      <p className="mt-2 text-xs leading-relaxed text-white/55">Не считаем нулевой круг и голосования, после которых одновременно вышло несколько игроков. Учитываем голос в каждой сохранённой фазе, включая переголосование, если в итоге дня вышел ровно один игрок. Важно, в кого был отдан голос, а не кого вывели. Шериф входит в красную команду.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{[
        ['Голосования · играл красным',stats.actions.votes.red], ['Голосования · играл чёрным',stats.actions.votes.black],
        ['Критический круг · играл красным',stats.actions.criticalVotes.red], ['Критический круг · играл чёрным',stats.actions.criticalVotes.black],
        ['Проверки шерифом',stats.actions.checks.sheriff], ['Проверки доном',stats.actions.checks.don],
      ].map(([title,raw]) => { const counts = raw as TargetCounts;return <div key={String(title)} className="border-t border-white/[.07] pt-3"><h3 className="text-sm font-semibold">{String(title)}</h3><dl className="mt-2 space-y-1 text-sm text-white/65"><div className="flex justify-between gap-2"><dt>В красных</dt><dd>{counts.red}</dd></div><div className="flex justify-between gap-2"><dt>В чёрных</dt><dd>{counts.black}</dd></div><div className="flex justify-between gap-2"><dt>В том числе в шерифа</dt><dd>{counts.sheriff}</dd></div>{counts.unknown > 0 && <div className="flex justify-between gap-2"><dt>Роль неизвестна</dt><dd>{counts.unknown}</dd></div>}</dl></div>;})}</div>
      <p className="mt-3 text-xs leading-relaxed text-white/50">Критический круг — когда ошибка в красного ведёт к паритету сразу или после следующего отстрела. Это только факты действий, а не оценка речей: красная проверка шерифа бывает полезной.</p>
      {(stats.actions.votes.red.unknown + stats.actions.checks.sheriff.unknown + stats.actions.checks.don.unknown) > 0 && <p className="mt-2 text-xs text-white/50">Голоса и проверки с неизвестной ролью цели показаны отдельно и не включены в процент точности.</p>}
      {stats.actions.unknownCriticalDays > 0 && <p className="mt-2 text-xs text-white/50">Ещё {stats.actions.unknownCriticalDays} голосований без достаточных данных о живых: в критические не включены.</p>}
    </details>}
  </section>;
}
