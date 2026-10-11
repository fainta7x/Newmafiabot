import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

export type PokerTournamentParticipant = { id: string; nickname: string; status: string; place: number | null; rebuys: number; out: boolean };

/** Who is in the tournament: every nickname opens the player's profile, as in the rosters of the evenings. A player who went out shows his place. */
export default function PokerTournamentParticipants({ participants, viewerId = null }: { participants: PokerTournamentParticipant[]; viewerId?: string | null }) {
  if (!participants.length) return <p className="text-xs text-white/45" data-testid="poker-tournament-participants-empty">Пока никто не записался</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid="poker-tournament-participants">
      {participants.map((participant) => (
        <li key={participant.id}>
          <button type="button" onClick={() => openCanonicalPlayerProfile(participant.id)}
            className={`min-h-9 rounded-full px-3 text-[12px] ${participant.out ? 'bg-white/[0.03] text-white/35' : 'bg-white/[0.07] text-white/80'} ${participant.id === viewerId ? 'ring-1 ring-amber-300/60' : ''}`}>
            {participant.nickname}
            {participant.out && participant.place ? <span className="ml-1 text-[10px] text-rose-200/70">{participant.place} м.</span> : null}
            {!participant.out && participant.rebuys > 0 ? <span className="ml-1 text-[10px] text-amber-200/70">+{participant.rebuys}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
