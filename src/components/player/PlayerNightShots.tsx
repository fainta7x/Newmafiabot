export type NightShots = {
  killed: number; games_as_red: number; black_nights: number; black_misses: number;
  partners: Array<{ player_id: string; nickname: string; kills: number; together: number }>;
} | null | undefined;

/** «Ночью»: how often the player was shot, when (with which black players at the table), and the misses of his black team. */
export default function PlayerNightShots({ shots }: { shots: NightShots }) {
  if (!shots || (shots.killed === 0 && shots.black_nights === 0)) return null;
  return <section data-testid="profile-night-shots" aria-label="Ночью" className="border-t border-white/10 pt-4">
    <div className="text-sm font-semibold text-white/85">Ночью</div>
    <p className="mt-1 text-xs leading-5 text-white/55">События сохранённых игр: отстрелы при игре за красных и ночи своей чёрной команды.</p>
    {shots.games_as_red > 0 ? <div className="mt-2 text-sm">Убит ночью <b>{shots.killed}</b> из {shots.games_as_red} игр за красных</div> : null}
    {shots.partners.length ? <div className="mt-2">
      <div className="text-xs leading-5 text-white/55">Убит ночью в играх, где за чёрных играли:</div>
      <ul className="mt-1 space-y-1">{shots.partners.map((partner) => <li key={partner.player_id} className="flex items-center justify-between gap-3 border-b border-white/[.06] py-2 text-sm"><span className="min-w-0 truncate">{partner.nickname}</span><span className="shrink-0 text-white/60">{partner.kills} из {partner.together} игр</span></li>)}</ul>
    </div> : null}
    {shots.black_nights > 0 ? <div className="mt-3"><p className="text-sm text-white/70">В чёрной команде: ночей без жертвы <b>{shots.black_misses}</b> из {shots.black_nights}</p><p className="mt-1 text-xs leading-5 text-white/55">Счётчик команды: сам по себе не определяет причину пропуска и ответственного за выстрел.</p></div> : null}
  </section>;
}
