import { formatRubles } from '../../lib/formatRubleAmount.ts';

export type PersonalPrice = { tier: 'regular' | 'sometimes' | 'stopped'; game: number; cap: number; regular_cap: number; sometimes_cap: number; stopped_game: number; stopped_cap: number };

/** What the club evening price depends on (owner, 2026-11-11): the player sees his own tariff and what brings the lower one. */
export default function PriceDependsOnActivity({ price }: { price: PersonalPrice }) {
  // The tier follows the last visit before the evening (owner, 2026-11-16: «дороже только после 3 недель пропуска»).
  const own = price.tier === 'regular' ? 'Вы были у нас за последние 3 недели' : price.tier === 'stopped' ? 'Вас не было больше двух месяцев' : 'Вас не было больше 3 недель';
  return <div data-testid="price-depends-on-activity" className="mt-3 rounded-xl bg-black/20 px-3 py-2.5 text-[11px] leading-4 text-white/55">
    <div className="font-semibold text-white/80">{own}: {formatRubles(price.game)} за игру, не больше {formatRubles(price.cap)} за вечер</div>
    <div className="mt-1">Цена зависит от того, когда вы были в последний раз: кто был за последние 3 недели — не больше {formatRubles(price.regular_cap)} за вечер, кого не было больше 3 недель — не больше {formatRubles(price.sometimes_cap)}, а если не были больше двух месяцев — {formatRubles(price.stopped_game)} за игру, не больше {formatRubles(price.stopped_cap)}.</div>
    {price.tier !== 'regular' && <div className="mt-1 font-semibold text-emerald-200/80">Приходите чаще — цена станет ниже.</div>}
  </div>;
}
