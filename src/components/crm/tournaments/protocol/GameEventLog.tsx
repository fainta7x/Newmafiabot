import React, { useMemo, useState } from 'react';
import type { PlayerResultData } from '../../../../lib/api';
import type { LiveGameEvent } from '../../../../shared/liveGameEvents';
import { describeLiveGameEvents } from '../../../../lib/liveGameEventText';

/**
 * «Журнал партии»: what happened in the live game, step by step. Read-only; the source is the chronology the engine
 * wrote next to the protocol.
 */
export const GameEventLog: React.FC<{ events?: LiveGameEvent[]; playerResults: PlayerResultData[] }> = ({ events, playerResults }) => {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => {
    const names = new Map(playerResults.map((player) => [player.seat_number, player.display_name]));
    return describeLiveGameEvents(events || [], (seat) => `#${seat}${names.get(seat) ? ` ${names.get(seat)}` : ''}`);
  }, [events, playerResults]);

  if (!events?.length) return null;

  return (
    <section className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/60" data-testid="game-event-log">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-slate-200"
        aria-expanded={open}
      >
        <span>Журнал партии · {events.length} записей</span>
        <span className="text-slate-400">{open ? 'Скрыть' : 'Показать'}</span>
      </button>
      {open ? (
        <ol className="max-h-[50dvh] overflow-y-auto border-t border-slate-800 px-3 py-2 text-[11px] leading-5">
          {lines.map((line) => (
            <li key={line.seq} className={line.heading ? 'mt-2 font-black uppercase tracking-wide text-amber-300' : 'text-slate-300'}>
              {line.time ? <span className="mr-2 font-mono text-slate-500">{line.time}</span> : null}
              {line.text}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};

export default GameEventLog;
