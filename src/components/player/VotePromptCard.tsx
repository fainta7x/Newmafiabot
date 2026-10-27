import { useCallback, useEffect, useState } from 'react';
import EveningVotingPanel from './EveningVotingPanel.tsx';

type Pending = { evening_id: string; title: string; deadline: string; voted: boolean; my_vote_nickname: string | null; voters: number; attendees: number };

const untilText = (iso: string) => new Date(iso).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/**
 * «MVP вечера» on the player's home page (owner, 2026-10-13: the vote was hidden deep in «Клуб → Матчи» and people skipped
 * it). Shown while voting is open for an evening the player attended; the vote itself opens right here.
 */
export default function VotePromptCard() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/player/voting/pending', { credentials: 'include' });
      const body = response.ok ? await response.json().catch(() => null) : null;
      setPending(body?.pending || null);
    } catch { setPending(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!pending) return null;
  return (
    <section data-testid="vote-prompt-card" className={`rounded-[20px] border p-3 ${pending.voted ? 'border-white/10 bg-white/[0.04]' : 'border-amber-300/30 bg-amber-300/[0.08]'}`}>
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">🏆</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold leading-snug">MVP вечера «{pending.title}»</h2>
          <p className="mt-0.5 text-[12px] leading-4 text-white/60">
            {pending.voted
              ? `Ты проголосовал за ${pending.my_vote_nickname || 'игрока'} · до ${untilText(pending.deadline)}`
              : `Голосуем до ${untilText(pending.deadline)} · проголосовали ${pending.voters} из ${pending.attendees}`}
          </p>
        </div>
        <button type="button" data-testid="vote-prompt-toggle" onClick={() => { const next = !open; setOpen(next); if (!next) void load(); }}
          className={`min-h-11 shrink-0 rounded-[12px] px-4 text-[13px] font-bold ${pending.voted ? 'border border-white/15 bg-white/[0.06] text-white' : 'bg-amber-300 text-black'}`}>
          {open ? 'Свернуть' : pending.voted ? 'Изменить' : 'Голосовать'}
        </button>
      </div>
      {open ? <EveningVotingPanel eveningId={pending.evening_id} /> : null}
    </section>
  );
}
