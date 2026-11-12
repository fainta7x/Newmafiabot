import { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../lib/api.ts';
import { SECTION_PLAYER_HANDOFF, openCrmSection } from '../../lib/crmSectionNavigation.ts';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

/** Club tokens (in-game currency) in one place (owner, 2026-11-10): balances of all players and one player's ledger with manual accrual. Real-money payments stay in «Оплата и поддержка». */
export default function TokensCRM() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [playerId, setPlayerId] = useState(() => {
    const key = SECTION_PLAYER_HANDOFF.tokens!;
    try { const id = sessionStorage.getItem(key) || ''; sessionStorage.removeItem(key); return id; } catch { return ''; }
  });
  const [error, setError] = useState('');

  const load = () => api.getPlayers().then((people) => setPlayers(Array.isArray(people) ? people : [])).catch((cause: any) => setError(cause?.message || 'Не удалось загрузить игроков')).finally(() => setLoaded(true));
  useEffect(() => { void load(); }, []);

  const total = useMemo(() => players.reduce((sum, player) => sum + Number(player.tokens || 0), 0), [players]);
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru-RU');
    return [...players].filter((player) => !needle || String(player.nickname).toLocaleLowerCase('ru-RU').includes(needle))
      .sort((a, b) => Number(b.tokens || 0) - Number(a.tokens || 0));
  }, [players, search]);
  const selected = players.find((player) => String(player.id) === playerId);

  if (playerId) {
    return <div data-testid="crm-tokens-player" className="mx-auto w-full max-w-2xl space-y-3">
      <button type="button" onClick={() => { setPlayerId(''); void load(); }} className="min-h-11 rounded-xl border border-border-soft bg-surface-1 px-3 text-[13px] font-semibold text-text-primary">← Все игроки</button>
      <div className="px-1 text-[15px] font-semibold text-text-primary">{selected?.nickname || 'Игрок'}</div>
      <button type="button" data-testid="crm-tokens-open-shop" onClick={() => openCrmSection('shop', playerId)} className="min-h-11 w-full rounded-xl border border-border-soft bg-surface-1 px-3 text-[13px] font-semibold text-text-primary">Покупки игрока в магазине</button>
      <PlayerTokenLedgerCard key={playerId} playerId={playerId} initialBalance={Number(selected?.tokens || 0)} />
    </div>;
  }

  return <div data-testid="crm-tokens" className="mx-auto w-full max-w-2xl space-y-3">
    <p className="text-[13px] leading-5 text-text-secondary">Жетоны клуба — внутриигровая валюта: балансы игроков, журнал операций и ручное начисление или списание.</p>
    {error ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
    <div className="flex items-center justify-between gap-3 rounded-[17px] border border-border-soft bg-surface-1 p-3.5 text-[13px] text-text-secondary"><span className="min-w-0">У игроков сейчас: <strong className="text-text-primary">{total.toLocaleString('ru-RU')}</strong> жетонов · {players.length} игроков</span><button type="button" data-testid="crm-tokens-open-shop-list" onClick={() => openCrmSection('shop')} className="min-h-11 shrink-0 rounded-xl border border-border-soft px-3 text-[12px] font-bold text-text-primary">Магазин →</button></div>
    <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Поиск игрока" placeholder="Поиск по нику" className="mobile-field min-h-[44px]" />
    {!loaded ? <p className="py-6 text-center text-[13px] text-text-secondary">Загрузка…</p> : rows.length ? <div className="overflow-hidden rounded-[17px] border border-border-soft bg-surface-1">{rows.map((player, index) => <button key={player.id} type="button" onClick={() => setPlayerId(String(player.id))} className={`flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 text-left ${index ? 'border-t border-border-soft' : ''}`}>
      <span className="min-w-0 break-words text-[14px] font-semibold text-text-primary">{player.nickname}</span>
      <strong className="shrink-0 text-[14px] text-text-primary">{Number(player.tokens || 0).toLocaleString('ru-RU')}</strong>
    </button>)}</div> : <p className="rounded-[17px] border border-border-soft bg-surface-1 p-4 text-[12px] text-text-muted">Никого не нашли.</p>}
  </div>;
}
