import { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../lib/api.ts';
import { SECTION_PLAYER_HANDOFF } from '../../lib/crmSectionNavigation.ts';
import { VIP_ROLES } from '../../lib/vipLabels.ts';
import { PlayerVipSettings } from './PlayerVipSettings.tsx';

/** VIP card pull for all players in one place (owner, 2026-11-10): who has which conditions, and the editor of one player. Only the club owner sees it. */
type Rule = { id: string; playerId: string; kind: 'role' | 'same_color' | 'different_color'; role: string | null; otherPlayerId: string | null; percent: number; enabled: boolean };
type Quota = { playerId: string; wholeEvening: boolean; maxSuccessfulGames: number | null };

async function read(url: string) {
  const response = await fetch(url, { credentials: 'include' });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Не удалось загрузить'), { status: response.status });
  return body;
}

export default function VipCRM() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [playerId, setPlayerId] = useState(() => {
    const key = SECTION_PLAYER_HANDOFF.vip!;
    try { const id = sessionStorage.getItem(key) || ''; sessionStorage.removeItem(key); return id; } catch { return ''; }
  });

  const load = async () => {
    try {
      const [ruleData, quotaData] = await Promise.all([read('/api/admin/vip-probability-rules'), read('/api/admin/vip-probability-rules/game-quotas')]);
      setRules(Array.isArray(ruleData.rules) ? ruleData.rules : []);
      setQuotas(Array.isArray(quotaData.quotas) ? quotaData.quotas : []);
      setAllowed(true);
    } catch (cause: any) { setAllowed(cause?.status === 403 ? false : true); if (cause?.status !== 403) setError(cause?.message || 'Не удалось загрузить'); }
  };
  useEffect(() => { void load(); void api.getPlayers().then((people) => setPlayers(Array.isArray(people) ? people : [])).catch(() => undefined); }, []);

  const name = (id: string | null) => players.find((player) => String(player.id) === id)?.nickname || 'игрок';
  const roleName = (id: string | null) => VIP_ROLES.find(([key]) => key === id)?.[1] || 'роль';
  const describe = (rule: Rule) => `${rule.kind === 'role' ? roleName(rule.role) : rule.kind === 'same_color' ? `одноцвет с ${name(rule.otherPlayerId)}` : `не в одноцвете с ${name(rule.otherPlayerId)}`} · ${rule.percent}%${rule.enabled ? '' : ' (выкл.)'}`;
  const withRules = useMemo(() => {
    const ids = [...new Set(rules.map((rule) => rule.playerId))];
    return ids.map((id) => ({ id, rules: rules.filter((rule) => rule.playerId === id), quota: quotas.find((quota) => quota.playerId === id) || null }))
      .sort((a, b) => String(name(a.id)).localeCompare(String(name(b.id)), 'ru'));
  }, [rules, quotas, players]);
  const others = useMemo(() => players.filter((player) => !withRules.some((row) => row.id === String(player.id))).sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), 'ru')), [players, withRules]);

  if (allowed === null) return <p className="py-10 text-center text-[13px] text-text-secondary">Загрузка…</p>;
  if (allowed === false) return <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">Раздел «VIP» доступен только владельцу клуба.</p>;

  if (playerId) {
    return <div data-testid="crm-vip-player" className="mx-auto w-full max-w-2xl space-y-3">
      <button type="button" onClick={() => { setPlayerId(''); void load(); }} className="min-h-11 rounded-xl border border-border-soft bg-surface-1 px-3 text-[13px] font-semibold text-text-primary">← Все игроки</button>
      <div className="px-1 text-[15px] font-semibold text-text-primary">{name(playerId)}</div>
      <PlayerVipSettings playerId={playerId} />
    </div>;
  }

  return <div data-testid="crm-vip" className="mx-auto w-full max-w-2xl space-y-4">
    <p className="text-[13px] leading-5 text-text-secondary">Подкрутка карт в виртуальной раздаче обычных и новичковых вечеров. Видите только вы. 50% — обычная раздача, 100% — всегда, 0% — никогда.</p>
    {error ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
    <section className="space-y-2">
      <div className="px-1 text-[13px] font-bold text-text-primary">У кого есть условия · {withRules.length}</div>
      {withRules.length ? <div className="overflow-hidden rounded-[17px] border border-border-soft bg-surface-1">{withRules.map((row, index) => <button key={row.id} type="button" onClick={() => setPlayerId(row.id)} className={`block min-h-[64px] w-full px-3.5 py-3 text-left ${index ? 'border-t border-border-soft' : ''}`}>
        <strong className="block text-[14px] font-semibold text-text-primary">{name(row.id)}</strong>
        <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{row.rules.map(describe).join(' · ')}</span>
        <span className="mt-0.5 block text-[11px] text-text-muted">{!row.quota ? 'Условия не сработают: не выбрано «На весь вечер» или число игр' : row.quota.wholeEvening ? 'На весь вечер' : `Игр со сработавшей подкруткой за вечер: ${row.quota.maxSuccessfulGames}`}</span>
      </button>)}</div> : <p className="rounded-[17px] border border-border-soft bg-surface-1 p-4 text-[12px] text-text-muted">Пока ни у кого нет условий.</p>}
    </section>
    <section className="space-y-2 rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
      <div className="text-[13px] font-bold text-text-primary">Добавить игроку</div>
      <select aria-label="Игрок" value="" onChange={(event) => setPlayerId(event.target.value)} className="mobile-field min-h-[44px]">
        <option value="">Выберите игрока</option>
        {others.map((player) => <option key={player.id} value={String(player.id)}>{player.nickname}</option>)}
      </select>
    </section>
  </div>;
}
