import React, { useEffect, useMemo, useState } from 'react';

type EconomyScope = 'shop' | 'bets' | 'history';
type BetTeam = 'red' | 'black';

type ShopItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  item_type: string;
};

type ShopPurchase = {
  id: string;
  item_id: string;
  item_name_snapshot: string;
  item_type_snapshot: string;
  price_snapshot: number;
  status: string;
  purchased_at: string;
  redeemed_at: string | null;
  notes: string | null;
};

type TokenLedgerEntry = {
  id: string;
  amount: number;
  balance_after: number;
  reason_type: string;
  description: string;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

type EconomyData = {
  balance: number;
  shop_items: ShopItem[];
  purchases: ShopPurchase[];
  ledger: {
    items: TokenLedgerEntry[];
    total: number;
  };
};

type BettingPlayer = {
  seat_number: number;
  player_id: string;
  nickname: string;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don';
  team: BetTeam;
};

type PlayerBet = {
  id: string;
  game_id: number;
  team: BetTeam;
  amount: number;
  status: string;
  payout_amount: number;
  final_coefficient: number | null;
  placed_at: string;
  settled_at: string | null;
};

type ActiveBetPool = {
  id: string;
  game_id: number;
  game_number: number | null;
  game_date: string | null;
  status: 'open' | 'closed';
  opens_at: string;
  closes_at: string;
  house_rate_bps: number;
  max_coefficient: number;
  red_pool: number;
  black_pool: number;
  red_coefficient: number;
  black_coefficient: number;
  role_snapshot: BettingPlayer[];
  my_bet: PlayerBet | null;
};

type BetHistoryItem = PlayerBet & {
  game_number: number | null;
  game_date: string | null;
  settled_winner: BetTeam | null;
};

type BettingData = {
  balance: number;
  active: ActiveBetPool | null;
  blocked: { game_id: number; game_number: number | null; reason: string } | null;
  history: BetHistoryItem[];
  club_stats: {
    games: number;
    black_wins: number;
    red_wins: number;
    black_win_rate: number | null;
    red_win_rate: number | null;
  };
};

const formatTokens = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('ru-RU');

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const purchaseStatusLabel = (status: string) => {
  if (status === 'redeemed') return 'использовано';
  if (status === 'cancelled') return 'отменено';
  return 'куплено';
};

const betStatusLabel = (status: string) => {
  if (status === 'won') return 'выигрыш';
  if (status === 'lost') return 'проигрыш';
  if (status === 'refunded') return 'возврат';
  return 'ожидает результата';
};

const roleLabel = (role: BettingPlayer['role']) => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

const makeRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const calculateCoefficient = (sidePool: number, otherPool: number, houseRateBps: number, maxCoefficient: number) => {
  const side = Math.max(0, Math.trunc(sidePool || 0));
  const other = Math.max(0, Math.trunc(otherPool || 0));
  const keep = 1 - Math.max(0, Math.min(10000, houseRateBps || 0)) / 10000;
  if (side <= 0) return other > 0 ? maxCoefficient : 1;
  return Math.min(maxCoefficient, (side + Math.floor(other * keep)) / side);
};

const formatCoefficient = (value: number) => `x${Number(value || 1).toFixed(value >= 5 ? 1 : 2)}`;

const formatCountdown = (closesAt: string, now: number) => {
  const remaining = Math.max(0, new Date(closesAt).getTime() - now);
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

export default function PlayerEconomy({ onBalanceChange }: { onBalanceChange?: (balance: number) => void }) {
  const [scope, setScope] = useState<EconomyScope>('shop');
  const [data, setData] = useState<EconomyData | null>(null);
  const [betting, setBetting] = useState<BettingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betError, setBetError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<BetTeam>('black');
  const [betAmount, setBetAmount] = useState('50');
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    try {
      const response = await fetch('/api/player/economy', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить жетоны');
      const next = body as EconomyData;
      setData(next);
      setError(null);
      onBalanceChange?.(Number(next.balance || 0));
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить жетоны');
    }
  };

  const loadBetting = async () => {
    try {
      const response = await fetch('/api/player/bets', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить ставки');
      const next = body as BettingData;
      setBetting(next);
      setData((previous) => previous ? { ...previous, balance: Number(next.balance || 0) } : previous);
      setBetError(null);
      onBalanceChange?.(Number(next.balance || 0));
    } catch (loadError: any) {
      setBetError(loadError?.message || 'Не удалось загрузить ставки');
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (scope !== 'bets') return;
    void loadBetting();
    const refresh = window.setInterval(() => { void loadBetting(); }, 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(refresh); window.clearInterval(clock); };
  }, [scope]);

  const confirmPurchase = async () => {
    if (!activeItem || buying) return;
    setBuying(true);
    setError(null);
    try {
      const response = await fetch('/api/player/shop/purchase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: activeItem.id, request_id: makeRequestId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось совершить покупку');
      const newBalance = Number(body?.balance || 0);
      setSuccess(`${activeItem.icon} ${activeItem.name} — покупка оформлена`);
      setActiveItem(null);
      onBalanceChange?.(newBalance);
      await load();
    } catch (purchaseError: any) {
      setError(purchaseError?.message || 'Не удалось совершить покупку');
    } finally {
      setBuying(false);
    }
  };

  const activePool = betting?.active || null;
  const amount = Math.max(0, Math.trunc(Number(betAmount || 0)));
  const projected = useMemo(() => {
    if (!activePool || activePool.my_bet || amount <= 0) return null;
    const redPool = activePool.red_pool + (selectedTeam === 'red' ? amount : 0);
    const blackPool = activePool.black_pool + (selectedTeam === 'black' ? amount : 0);
    const coefficient = selectedTeam === 'red'
      ? calculateCoefficient(redPool, blackPool, activePool.house_rate_bps, activePool.max_coefficient)
      : calculateCoefficient(blackPool, redPool, activePool.house_rate_bps, activePool.max_coefficient);
    return { coefficient, payout: Math.floor(amount * coefficient) };
  }, [activePool, amount, selectedTeam]);

  const placeBet = async () => {
    if (!activePool || activePool.status !== 'open' || activePool.my_bet || placingBet) return;
    if (!Number.isInteger(amount) || amount < 50) {
      setBetError('Минимальная ставка — 50 жетонов');
      return;
    }
    setPlacingBet(true);
    setBetError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/player/bets/place', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: activePool.game_id, team: selectedTeam, amount, request_id: makeRequestId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось принять ставку');
      setSuccess(`Ставка ${formatTokens(amount)} 🪙 на ${selectedTeam === 'red' ? 'красных' : 'чёрных'} принята`);
      onBalanceChange?.(Number(body?.balance || 0));
      await Promise.all([loadBetting(), load()]);
    } catch (placeError: any) {
      setBetError(placeError?.message || 'Не удалось принять ставку');
    } finally {
      setPlacingBet(false);
    }
  };

  if (!data && !error) {
    return <Section title="Жетоны и магазин"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка кошелька…</p></Section>;
  }

  const redPlayers = activePool?.role_snapshot.filter((player) => player.team === 'red') || [];
  const blackPlayers = activePool?.role_snapshot.filter((player) => player.team === 'black') || [];
  const currentMyCoefficient = activePool?.my_bet
    ? activePool.my_bet.team === 'red' ? activePool.red_coefficient : activePool.black_coefficient
    : null;

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-white/35">Кошелёк</div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold text-white">{formatTokens(data?.balance || betting?.balance || 0)} 🪙</div>
            <div className="mt-1 text-sm text-white/40">жетонов на балансе</div>
          </div>
          <div className="rounded-2xl bg-black/20 px-3 py-2 text-right">
            <div className="text-sm font-semibold text-white/75">{data?.purchases.length || 0}</div>
            <div className="text-[10px] text-white/35">покупок</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.045] p-1">
        <button type="button" onClick={() => setScope('shop')} className={`min-h-10 rounded-xl px-2 text-sm font-medium ${scope === 'shop' ? 'bg-white text-black' : 'text-white/50'}`}>Магазин</button>
        <button type="button" onClick={() => setScope('bets')} className={`min-h-10 rounded-xl px-2 text-sm font-medium ${scope === 'bets' ? 'bg-white text-black' : 'text-white/50'}`}>Ставки</button>
        <button type="button" onClick={() => setScope('history')} className={`min-h-10 rounded-xl px-2 text-sm font-medium ${scope === 'history' ? 'bg-white text-black' : 'text-white/50'}`}>История</button>
      </div>

      {error && <p className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-3 text-sm text-rose-100/70">{error}</p>}
      {success && <p className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.06] px-3 py-3 text-sm text-emerald-100/75">{success}</p>}

      {scope === 'shop' ? (
        <Section title="Доступные товары">
          {data?.shop_items.length ? (
            <div className="space-y-2">
              {data.shop_items.map((item) => {
                const affordable = Number(data.balance || 0) >= Number(item.price || 0);
                return (
                  <article key={item.id} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-2xl">{item.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white">{item.name}</div>
                        <p className="mt-1 text-xs leading-5 text-white/40">{item.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                      <div><div className="text-[10px] uppercase tracking-[0.12em] text-white/30">Цена</div><div className="mt-0.5 font-semibold text-white/80">{formatTokens(item.price)} 🪙</div></div>
                      <button type="button" disabled={!affordable || buying} onClick={() => { setSuccess(null); setActiveItem(item); }} className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${affordable ? 'bg-white text-black' : 'bg-white/[0.05] text-white/25'}`}>
                        {affordable ? 'Купить' : 'Не хватает'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас в магазине нет товаров.</p>}
        </Section>
      ) : scope === 'bets' ? (
        <>
          {betError && <p className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-3 text-sm text-rose-100/70">{betError}</p>}
          {!betting && !betError && <Section title="Ставки"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Ищем активную игру…</p></Section>}
          {betting?.blocked && <Section title={`Игра №${betting.blocked.game_number || betting.blocked.game_id}`}><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm leading-6 text-white/55">{betting.blocked.reason}. Состав и роли этой игры вам не показываются.</p></Section>}
          {betting && !activePool && !betting.blocked && <Section title="Ставки"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас нет игры с открытыми ставками.</p></Section>}

          {activePool && (
            <>
              <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-xs uppercase tracking-[0.18em] text-white/35">Игра №{activePool.game_number || activePool.game_id}</div><div className="mt-2 text-xl font-semibold text-white">Тотализатор</div></div>
                  <div className={`rounded-xl px-3 py-2 text-right ${activePool.status === 'open' ? 'bg-emerald-400/[0.08]' : 'bg-white/[0.05]'}`}>
                    <div className={`text-sm font-semibold ${activePool.status === 'open' ? 'text-emerald-200' : 'text-white/55'}`}>{activePool.status === 'open' ? formatCountdown(activePool.closes_at, now) : 'Закрыто'}</div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-white/30">{activePool.status === 'open' ? 'до закрытия' : 'ждём итог'}</div>
                  </div>
                </div>
                {betting.club_stats.games > 0 && <div className="mt-3 text-xs text-white/35">История клуба: ⚫ {Math.round((betting.club_stats.black_win_rate || 0) * 100)}% · 🔴 {Math.round((betting.club_stats.red_win_rate || 0) * 100)}%</div>}
              </section>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { team: 'red' as const, title: 'Красные', icon: '🔴', pool: activePool.red_pool, coef: activePool.red_coefficient, players: redPlayers },
                  { team: 'black' as const, title: 'Чёрные', icon: '⚫', pool: activePool.black_pool, coef: activePool.black_coefficient, players: blackPlayers },
                ]).map((side) => (
                  <button key={side.team} type="button" disabled={Boolean(activePool.my_bet) || activePool.status !== 'open'} onClick={() => setSelectedTeam(side.team)} className={`rounded-3xl border p-3 text-left ${selectedTeam === side.team && !activePool.my_bet ? 'border-white/30 bg-white/[0.08]' : 'border-white/10 bg-white/[0.035]'}`}>
                    <div className="flex items-start justify-between gap-2"><div className="text-sm font-semibold text-white">{side.icon} {side.title}</div><div className="text-lg font-semibold text-white">{formatCoefficient(side.coef)}</div></div>
                    <div className="mt-1 text-[10px] text-white/35">в банке {formatTokens(side.pool)} 🪙</div>
                    <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                      {side.players.map((player) => <div key={player.seat_number} className="text-[10px] leading-4 text-white/50"><span className="text-white/30">#{player.seat_number}</span> {player.nickname}<span className="block pl-4 text-white/25">{roleLabel(player.role)}</span></div>)}
                    </div>
                  </button>
                ))}
              </div>

              {activePool.my_bet ? (
                <Section title="Ваша ставка">
                  <div className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3"><span className="text-sm text-white/55">{activePool.my_bet.team === 'red' ? '🔴 Красные' : '⚫ Чёрные'}</span><strong className="text-white">{formatTokens(activePool.my_bet.amount)} 🪙</strong></div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="text-white/35">Коэффициент сейчас</span><strong className="text-white/80">{formatCoefficient(currentMyCoefficient || 1)}</strong></div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="text-white/35">Выплата сейчас</span><strong className="text-emerald-200/80">{formatTokens(Math.floor(activePool.my_bet.amount * (currentMyCoefficient || 1)))} 🪙</strong></div>
                  </div>
                  {activePool.status === 'open' && <p className="mt-3 text-xs leading-5 text-white/35">Коэффициент меняется до закрытия ставок. Чем больше жетонов ставят на одну сторону, тем менее выгодной она становится.</p>}
                </Section>
              ) : activePool.status === 'open' ? (
                <Section title="Сделать ставку">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSelectedTeam('red')} className={`min-h-11 rounded-xl text-sm font-medium ${selectedTeam === 'red' ? 'bg-white text-black' : 'bg-black/20 text-white/55'}`}>🔴 Красные</button>
                    <button type="button" onClick={() => setSelectedTeam('black')} className={`min-h-11 rounded-xl text-sm font-medium ${selectedTeam === 'black' ? 'bg-white text-black' : 'bg-black/20 text-white/55'}`}>⚫ Чёрные</button>
                  </div>
                  <div className="mt-3 flex gap-2"><input inputMode="numeric" value={betAmount} onChange={(event) => setBetAmount(event.target.value.replace(/[^0-9]/g, ''))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white outline-none" /><div className="flex items-center rounded-xl bg-black/20 px-3 text-sm text-white/40">🪙</div></div>
                  <div className="mt-2 grid grid-cols-4 gap-1">{[50, 100, 250, 500].map((preset) => <button key={preset} type="button" onClick={() => setBetAmount(String(preset))} className="rounded-lg bg-white/[0.05] py-2 text-[10px] text-white/45">{preset}</button>)}</div>
                  {projected && <div className="mt-3 rounded-2xl bg-black/20 p-3 text-sm"><div className="flex justify-between text-white/45"><span>Коэффициент после вашей ставки</span><strong className="text-white/80">{formatCoefficient(projected.coefficient)}</strong></div><div className="mt-2 flex justify-between text-white/45"><span>Выплата, если линия не изменится</span><strong className="text-emerald-200/80">{formatTokens(projected.payout)} 🪙</strong></div></div>}
                  <button type="button" disabled={placingBet || amount < 50 || amount > Number(betting.balance || 0)} onClick={() => void placeBet()} className="mt-3 min-h-12 w-full rounded-xl bg-white text-sm font-semibold text-black disabled:bg-white/[0.06] disabled:text-white/25">{placingBet ? 'Принимаем…' : amount > Number(betting.balance || 0) ? 'Не хватает жетонов' : `Поставить ${formatTokens(amount)} 🪙`}</button>
                  <p className="mt-3 text-xs leading-5 text-white/35">Ставки игроков образуют общий банк. 90% проигранного банка распределяется победителям, 10% выводится из оборота. Максимальный коэффициент — x10. Итоговый коэффициент фиксируется только после закрытия линии.</p>
                </Section>
              ) : null}
            </>
          )}

          {betting?.history?.length ? <Section title="Последние ставки"><div className="space-y-2">{betting.history.slice(0, 6).map((bet) => (
            <div key={bet.id} className="rounded-2xl bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-white">Игра №{bet.game_number || bet.game_id} · {bet.team === 'red' ? '🔴 красные' : '⚫ чёрные'}</div><div className="mt-1 text-xs text-white/30">{formatDateTime(bet.placed_at)} · {betStatusLabel(bet.status)}</div></div><div className="text-right"><div className="text-sm font-semibold text-white/75">{formatTokens(bet.amount)} 🪙</div>{bet.status === 'won' && <div className="mt-1 text-xs text-emerald-300">+{formatTokens(Math.max(0, bet.payout_amount - bet.amount))}</div>}</div></div>
            </div>
          ))}</div></Section> : null}
        </>
      ) : (
        <>
          <Section title="Мои покупки">
            {data?.purchases.length ? <div className="space-y-2">{data.purchases.map((purchase) => (
              <div key={purchase.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{purchase.item_name_snapshot}</div><div className="mt-1 text-xs text-white/35">{formatDateTime(purchase.purchased_at)}</div></div>
                  <div className="shrink-0 text-right"><div className="text-sm font-semibold text-rose-200/80">−{formatTokens(purchase.price_snapshot)} 🪙</div><div className="mt-1 text-[10px] text-white/30">{purchaseStatusLabel(purchase.status)}</div></div>
                </div>
              </div>
            ))}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Покупок пока нет.</p>}
          </Section>

          <Section title="История жетонов">
            {data?.ledger.items.length ? <div className="space-y-2">{data.ledger.items.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium text-white/80">{entry.description}</div><div className="mt-1 text-xs text-white/30">{formatDateTime(entry.created_at)}</div></div>
                  <div className="shrink-0 text-right"><div className={`text-sm font-semibold ${entry.amount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.amount > 0 ? '+' : ''}{formatTokens(entry.amount)} 🪙</div><div className="mt-1 text-[10px] text-white/30">баланс {formatTokens(entry.balance_after)}</div></div>
                </div>
              </div>
            ))}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">История жетонов пока пустая.</p>}
          </Section>
        </>
      )}

      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-[410px] rounded-[28px] border border-white/10 bg-[#15161b] p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-3xl">{activeItem.icon}</div>
              <div className="min-w-0 flex-1"><div className="text-lg font-semibold text-white">{activeItem.name}</div><p className="mt-1 text-sm leading-5 text-white/45">{activeItem.description}</p></div>
            </div>
            <div className="mt-4 rounded-2xl bg-black/25 p-3 text-sm">
              <div className="flex justify-between text-white/45"><span>Сейчас</span><span>{formatTokens(data?.balance || 0)} 🪙</span></div>
              <div className="mt-2 flex justify-between text-white/45"><span>Покупка</span><span>−{formatTokens(activeItem.price)} 🪙</span></div>
              <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 font-semibold text-white/80"><span>Останется</span><span>{formatTokens((data?.balance || 0) - activeItem.price)} 🪙</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={buying} onClick={() => setActiveItem(null)} className="min-h-11 rounded-xl bg-white/[0.06] text-sm font-medium text-white/60">Отмена</button>
              <button type="button" disabled={buying} onClick={() => void confirmPurchase()} className="min-h-11 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-50">{buying ? 'Покупаем…' : 'Подтвердить'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
