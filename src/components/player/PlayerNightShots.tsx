export type NightShots = {
  killed: number; games_as_red: number; black_nights: number; black_misses: number;
  partners: Array<{ player_id: string; nickname: string; kills: number; together: number }>;
} | null | undefined;

/** «Ночью»: how often the player was shot, when (with which black players at the table), and the misses of his black team. */
export default function PlayerNightShots({ shots }: { shots: NightShots }) {
  if (!shots || (shots.killed === 0 && shots.black_nights === 0)) return null;
  return <section data-testid="profile-night-shots" aria-label="Ночью" className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Ночью</div>
    {shots.games_as_red > 0 ? <div className="mt-2 text-sm">Убит ночью <b>{shots.killed}</b> из {shots.games_as_red} игр за красных</div> : null}
    {shots.partners.length ? <div className="mt-2">
      <div className="text-[11px] text-white/45">Чаще всего убивают, когда в чёрных:</div>
      <ul className="mt-1 space-y-1">{shots.partners.map((partner) => <li key={partner.player_id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"><span className="min-w-0 truncate">{partner.nickname}</span><span className="shrink-0 text-white/60">{partner.kills} из {partner.together} игр</span></li>)}</ul>
    </div> : null}
    {shots.black_nights > 0 ? <div className="mt-2 text-sm text-white/70">В чёрной команде: ночей без жертвы <b>{shots.black_misses}</b> из {shots.black_nights}</div> : null}
  </section>;
}
