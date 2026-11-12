import { formatRubles } from '../../lib/formatRubleAmount.ts';

export type PersonalPrice = { tier: 'regular' | 'sometimes' | 'stopped'; game: number; cap: number; regular_cap: number; sometimes_cap: number; stopped_game: number; stopped_cap: number };

/** What the club evening price depends on (owner, 2026-11-11): the player sees his own tariff and what brings the lower one. */
export default function PriceDependsOnActivity({ price }: { price: PersonalPrice }) {
  const own = price.tier === 'regular' ? 'Вы ходите постоянно' : price.tier === 'stopped' ? 'Вы давно не были' : 'Вы ходите иногда';
  return <div data-testid="price-depends-on-activity" className="mt-3 rounded-xl bg-black/20 px-3 py-2.5 text-[11px] leading-4 text-white/55">
    <div className="font-semibold text-white/80">{own}: {formatRubles(price.game)} за игру, не больше {formatRubles(price.cap)} за вечер</div>
    <div className="mt-1">Цена зависит от того, как часто вы бываете: постоянным игрокам (3 вечера и больше за 30 дней) — не больше {formatRubles(price.regular_cap)} за вечер, тем, кто ходит иногда — не больше {formatRubles(price.sometimes_cap)}, а если не были больше двух месяцев — {formatRubles(price.stopped_game)} за игру, не больше {formatRubles(price.stopped_cap)}.</div>
    {price.tier !== 'regular' && <div className="mt-1 font-semibold text-emerald-200/80">Приходите чаще — цена станет ниже.</div>}
  </div>;
}
