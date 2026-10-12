import { useEffect, useRef } from 'react';

type SidebarPlayer = { id: string; nickname: string; seat: number; chips: number; folded?: boolean; sitting_out?: boolean };

const STREETS: Record<string, string> = { preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер', showdown: 'Вскрытие', finished: 'Раздача окончена' };
const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));

/**
 * The left column of the poker table on a wide screen (owner, 2026-10-12: poker had no desktop layout): the course of the
 * hand and the stacks, so a player at a computer sees what the phone hides behind buttons. It only reads the table — it
 * holds no state of the game and is hidden below 1120 px, where the table fills the screen.
 */
export default function PokerDeskSidebar({ hand, players, viewerId, describe, title }: {
  hand: any; players: SidebarPlayer[]; viewerId: string | null;
  /** The same sentence the table shows under the board: «Аня — рейз до 100». */
  describe: (entry: any) => string | null;
  title: string;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const log: any[] = Array.isArray(hand?.action_log) ? hand.action_log.filter((entry: any) => !String(entry?.type || '').includes('blind')) : [];
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log.length]);
  const handPlayers: SidebarPlayer[] = Array.isArray(hand?.players) ? hand.players : [];
  const stackOf = (player: SidebarPlayer) => handPlayers.find((item) => item.id === player.id)?.chips ?? player.chips;
  const foldedOf = (player: SidebarPlayer) => Boolean(handPlayers.find((item) => item.id === player.id)?.folded);
  let lastStreet = '';
  return (
    <aside data-testid="poker-desk-sidebar" className="poker-desk-sidebar" aria-label="Ход раздачи">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200/80">{title}</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{STREETS[hand?.street] || 'Раздача'}</h2>
          <span className="text-sm text-amber-100">Банк {money(hand?.pot)}</span>
        </div>
      </div>
      <section aria-label="Ходы" className="flex min-h-[96px] flex-1 flex-col">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Ходы</h3>
        <div ref={logRef} className="flex-1 space-y-0.5 overflow-y-auto rounded-2xl bg-black/30 p-2 text-[13px]">
          {log.length === 0 ? <p className="p-2 text-center text-xs text-white/40">Пока никто не ходил</p> : log.map((entry, index) => {
            const text = describe(entry);
            if (!text) return null;
            const heading = entry.street && entry.street !== lastStreet ? STREETS[entry.street] || entry.street : null;
            if (entry.street) lastStreet = entry.street;
            return <div key={`${entry.at}-${index}`}>
              {heading ? <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-200/70 first:mt-0">{heading}</div> : null}
              <p className={entry.player_id === viewerId ? 'text-amber-100' : 'text-white/80'}>{text}</p>
            </div>;
          })}
        </div>
      </section>
      <section aria-label="Стеки" className="shrink-0">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Стеки</h3>
        <ul className="space-y-1">
          {players.map((player) => {
            const active = hand?.current_seat === player.seat && hand?.street !== 'finished';
            const out = foldedOf(player) || player.sitting_out;
            return <li key={player.id} className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-[13px] ${active ? 'bg-amber-200/10 ring-1 ring-amber-200/30' : 'bg-white/[.04]'} ${out ? 'opacity-50' : ''}`}>
              <span className="min-w-0 truncate">{player.id === viewerId ? 'Я' : player.nickname}{active ? ' · ходит' : ''}{foldedOf(player) ? ' · пас' : ''}</span>
              <b className="shrink-0 tabular-nums text-amber-100">{money(stackOf(player))}</b>
            </li>;
          })}
        </ul>
      </section>
    </aside>
  );
}
