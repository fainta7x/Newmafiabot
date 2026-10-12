export type RevealNumbers = {
  sheriffGames: number; sheriffReveals: number; sheriffCheckedDon: number; sheriffCheckedMafia: number; sheriffCheckedRed: number;
  blackGames: number; blackReveals: number; blackRevealsDon: number; blackRevealsMafia: number; blackCovers: number; blackAnnouncedBlackOnRed: number;
  townChances: number; townVotesSheriff: number; townVotesMafia: number; townVotesDon: number;
} | null | undefined;

const row = 'flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm';

/** «Вскрытия»: the judge's record of who claimed to be the Sheriff and the checks announced (what the table heard, not the night checks). */
export default function PlayerReveals({ numbers }: { numbers: RevealNumbers }) {
  if (!numbers) return null;
  const asSheriff = numbers.sheriffReveals > 0;
  const asBlack = numbers.blackReveals > 0 || numbers.blackCovers > 0;
  const asTown = numbers.townChances > 0;
  if (!asSheriff && !asBlack && !asTown) return null;
  return <section data-testid="profile-reveals" aria-label="Вскрытия" className="rounded-2xl border border-amber-200/10 bg-amber-200/[0.03] p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/50">Вскрытия</div>
    {asSheriff ? <div className="mt-2">
      <div className="text-[11px] text-white/45">Шерифом вскрылся {numbers.sheriffReveals} из {numbers.sheriffGames} игр. Объявленные проверки:</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>Дон</span><b>{numbers.sheriffCheckedDon}</b></li>
        <li className={row}><span>Мафия</span><b>{numbers.sheriffCheckedMafia}</b></li>
        <li className={row}><span>Красные</span><b>{numbers.sheriffCheckedRed}</b></li>
        <li className={row}><span>Нашёл чёрных</span><b>{numbers.sheriffCheckedDon + numbers.sheriffCheckedMafia}</b></li>
      </ul>
    </div> : null}
    {asBlack ? <div className="mt-3">
      <div className="text-[11px] text-white/45">За чёрных вскрылся шерифом {numbers.blackReveals} из {numbers.blackGames} игр{numbers.blackReveals ? ` (дон ${numbers.blackRevealsDon}, мафия ${numbers.blackRevealsMafia})` : ''}</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>Накрыл своего чёрного красной проверкой</span><b>{numbers.blackCovers}</b></li>
        <li className={row}><span>Назвал красного чёрным</span><b>{numbers.blackAnnouncedBlackOnRed}</b></li>
      </ul>
    </div> : null}
    {asTown ? <div className="mt-3">
      <div className="text-[11px] text-white/45">Голосовал за вскрывшихся: {numbers.townVotesSheriff + numbers.townVotesMafia + numbers.townVotesDon} из {numbers.townChances} голосований</div>
      <ul className="mt-1 space-y-1">
        <li className={row}><span>За настоящего шерифа</span><b>{numbers.townVotesSheriff}</b></li>
        <li className={row}><span>За мафию</span><b>{numbers.townVotesMafia}</b></li>
        <li className={row}><span>За дона</span><b>{numbers.townVotesDon}</b></li>
      </ul>
    </div> : null}
  </section>;
}
