export type RevealNumbers = {
  sheriffGames: number; sheriffReveals: number; sheriffCheckedDon: number; sheriffCheckedMafia: number; sheriffCheckedRed: number;
  blackGames: number; blackReveals: number; blackRevealsDon: number; blackRevealsMafia: number; blackCovers: number; blackAnnouncedBlackOnRed: number;
  townChances: number; townVotesSheriff: number; townVotesMafia: number; townVotesDon: number;
  donGames?: number; donHandedReveal?: number; donNamedBlackRed?: number; donNamedBlackBlack?: number; donNamedRedBlack?: number; donNamedRedRed?: number;
  don?: { named_black: Array<{ player_id: string; nickname: string; count: number }>; named_red: Array<{ player_id: string; nickname: string; count: number }>; bundles: Array<{ nicknames: string[]; count: number }> };
} | null | undefined;

const row = 'flex items-center justify-between gap-3 border-b border-white/[.06] py-2 text-sm';

/** «Вскрытия»: the judge's record of who claimed to be the Sheriff and the checks announced (what the table heard, not the night checks). */
export default function PlayerReveals({ numbers }: { numbers: RevealNumbers }) {
  if (!numbers) return null;
  const asSheriff = numbers.sheriffReveals > 0;
  const asBlack = numbers.blackReveals > 0 || numbers.blackCovers > 0;
  const asTown = numbers.townChances > 0;
  const asDon = (numbers.donGames ?? 0) > 0 && (numbers.blackRevealsDon > 0 || (numbers.donHandedReveal ?? 0) > 0);
  if (!asSheriff && !asBlack && !asTown && !asDon) return null;
  return <section data-testid="profile-reveals" aria-label="Вскрытия" className="border-t border-white/10 pt-4">
    <div className="text-sm font-semibold text-white/85">Вскрытия</div>
    <p className="mt-1 text-xs leading-5 text-white/55">Что было объявлено за столом. Реальные ночные проверки показаны в разделе решений.</p>
    {asSheriff ? <div className="mt-2">
      <div className="text-xs leading-5 text-white/55">Шерифом вскрылся {numbers.sheriffReveals} из {numbers.sheriffGames} игр. Объявленные проверки:</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>Дон</span><b>{numbers.sheriffCheckedDon}</b></li>
        <li className={row}><span>Мафия</span><b>{numbers.sheriffCheckedMafia}</b></li>
        <li className={row}><span>Красные</span><b>{numbers.sheriffCheckedRed}</b></li>
        <li className={row}><span>Чёрных среди объявленных проверок</span><b>{numbers.sheriffCheckedDon + numbers.sheriffCheckedMafia}</b></li>
      </ul>
    </div> : null}
    {asBlack ? <div className="mt-3">
      <div className="text-xs leading-5 text-white/55">За чёрных вскрылся шерифом {numbers.blackReveals} из {numbers.blackGames} игр{numbers.blackReveals ? ` (дон ${numbers.blackRevealsDon}, мафия ${numbers.blackRevealsMafia})` : ''}</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>Накрыл своего чёрного красной проверкой</span><b>{numbers.blackCovers}</b></li>
        <li className={row}><span>Назвал красного чёрным</span><b>{numbers.blackAnnouncedBlackOnRed}</b></li>
      </ul>
    </div> : null}
    {asDon ? <div className="mt-3" data-testid="profile-don-reveals">
      <div className="text-xs leading-5 text-white/55">Дон: вскрылся сам {numbers.blackRevealsDon} из {numbers.donGames} игр, отдал вскрытие обычному чёрному {numbers.donHandedReveal ?? 0}</div>
      {numbers.don?.named_black.length ? <>
        <div className="mt-2 text-xs leading-5 text-white/55">Чаще всего называет чёрным (вместе с тем, кто вскрылся против него):</div>
        <ul className="mt-1 space-y-1">{numbers.don.named_black.map((item) => <li key={item.player_id} className={row}><span className="min-w-0 truncate">{item.nickname}</span><b>{item.count}</b></li>)}</ul>
      </> : null}
      {numbers.don?.bundles.length ? <>
        <div className="mt-2 text-xs leading-5 text-white/55">Связки: кого называет чёрными вместе</div>
        <ul className="mt-1 space-y-1">{numbers.don.bundles.map((item) => <li key={item.nicknames.join('|')} className={row}><span className="min-w-0 truncate">{item.nicknames.join(' + ')}</span><b>{item.count}</b></li>)}</ul>
      </> : null}
      {numbers.don?.named_red.length ? <>
        <div className="mt-2 text-xs leading-5 text-white/55">Чаще всего называет красным:</div>
        <ul className="mt-1 space-y-1">{numbers.don.named_red.map((item) => <li key={item.player_id} className={row}><span className="min-w-0 truncate">{item.nickname}</span><b>{item.count}</b></li>)}</ul>
      </> : null}
      <div className="mt-2 text-xs leading-5 text-white/55">Названо чёрным: настоящих красных {numbers.donNamedBlackRed ?? 0}, своих чёрных {numbers.donNamedBlackBlack ?? 0}. Названо красным: своих чёрных (накрыл) {numbers.donNamedRedBlack ?? 0}, настоящих красных {numbers.donNamedRedRed ?? 0}.</div>
    </div> : null}
    {asTown ? <div className="mt-3">
      <div className="text-xs leading-5 text-white/55">Голосовал за вскрывшихся: {numbers.townVotesSheriff + numbers.townVotesMafia + numbers.townVotesDon} из {numbers.townChances} голосований</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>За настоящего шерифа</span><b>{numbers.townVotesSheriff}</b></li>
        <li className={row}><span>За мафию</span><b>{numbers.townVotesMafia}</b></li>
        <li className={row}><span>За дона</span><b>{numbers.townVotesDon}</b></li>
      </ul>
    </div> : null}
  </section>;
}
