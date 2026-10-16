import type { LiveGameEvent } from '../../shared/liveGameEvents.ts';

type Person = { seat_number: number; nickname: string; team: 'red' | 'black' | null };
const labels: Record<string, string> = {
  game_start: 'Игра началась', nomination: 'Выставление', nomination_removed: 'Выставление отменено',
  vote: 'Голос', vote_removed: 'Голос отменён', table_vote: 'Голосование',
  table_vote_removed: 'Голосование отменено', vote_round_result: 'Итог голосования',
  shot_target: 'Выстрел', don_check: 'Проверка дона', sheriff_check: 'Проверка шерифа',
  foul: 'Фол', tech_minor: 'Технический фол', tech_major: 'Серьёзный техфол',
  exit: 'Выбыл', restored: 'Возвращён', first_killed: 'Первый убит',
  zero_round_voted: 'Заголосован в нулевом круге', best_move: 'Лучший ход',
  reveal: 'Вскрытие', announced_check: 'Объявленная проверка',
  ppk: 'ППК', death_protocol: 'Протокол после смерти', game_end: 'Игра завершена',
};
const color = (team: Person['team']) => team === 'red' ? 'text-rose-200 bg-rose-400/10'
  : team === 'black' ? 'text-violet-200 bg-violet-400/10' : 'text-white/65 bg-white/5';

/** Historical event log: never infer events absent from the recorded engine log. */
export default function PlayerGameActionJournal({ events, players }: { events: LiveGameEvent[]; players: Person[] }) {
  if (!events.length) return <p className="text-xs text-white/45">Подробный журнал действий для этой игры не записан.</p>;
  const known = new Map(players.map(player => [player.seat_number, player]));
  const seat = (number: number | null | undefined) => {
    const player = number == null ? null : known.get(number);
    return player ? `#${number} ${player.nickname}` : number != null ? `#${number}` : null;
  };
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  return <details data-testid="game-action-journal" className="rounded-xl border border-white/10 p-2.5">
    <summary className="cursor-pointer text-xs font-semibold text-white/85">Все действия · {ordered.length}</summary>
    <ol className="mt-2 max-h-[420px] space-y-1 overflow-auto">
      {ordered.map((event, index) => {
        const who = seat(event.seat);
        const target = seat(event.target);
        const team = event.seat == null ? null : known.get(event.seat)?.team ?? null;
        const detail = typeof event.value === 'string' || typeof event.value === 'number' ? String(event.value) : null;
        return <li key={`${event.seq}:${index}`} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white/[0.035] px-2 py-1.5 text-[11px]">
          <span className="tabular-nums text-white/40">Круг {event.round === 1 ? '0' : Math.max(0, event.round - 1)}</span>
          <strong className="text-white/80">{labels[event.kind] || event.kind.replaceAll('_', ' ')}</strong>
          {who && <span className={`rounded px-1.5 py-0.5 ${color(team)}`}>{who}</span>}
          {target && <span className="text-white/60">→ {target}</span>}
          {detail && <span className="break-all text-white/50">{detail}</span>}
        </li>;
      })}
    </ol>
  </details>;
}
