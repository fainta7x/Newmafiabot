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
    <section data-testid="vote-prompt-card" className={`rounded-[22px] border p-4 ${pending.voted ? 'border-white/10 bg-white/[0.04]' : 'border-amber-300/30 bg-amber-300/[0.08]'}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">🏆</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">MVP вечера «{pending.title}»</h2>
          {pending.voted
            ? <p className="mt-1 text-[13px] leading-5 text-white/60">Ты проголосовал за {pending.my_vote_nickname || 'игрока'}. Можно передумать до {untilText(pending.deadline)}.</p>
            : <p className="mt-1 text-[13px] leading-5 text-white/70">Кто сыграл лучше всех? Это 10 секунд. Голосуем до {untilText(pending.deadline)} · уже проголосовали {pending.voters} из {pending.attendees}.</p>}
        </div>
      </div>
      <button type="button" data-testid="vote-prompt-toggle" onClick={() => { const next = !open; setOpen(next); if (!next) void load(); }}
        className={`mt-3 min-h-12 w-full rounded-[14px] text-[14px] font-bold ${pending.voted ? 'border border-white/15 bg-white/[0.06] text-white' : 'bg-amber-300 text-black'}`}>
        {open ? 'Свернуть' : pending.voted ? 'Изменить голос' : 'Голосовать'}
      </button>
      {open ? <EveningVotingPanel eveningId={pending.evening_id} /> : null}
    </section>
  );
}
