import { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../lib/api.ts';

/**
 * VIP role pull in the player's card (owner, 2026-11-03: «из CRM в профиле игрока менять ему настройку на подкрутку карты»).
 * The same rules and quota as «Данные и настройки», shown for one player: each condition in the owner's words with a slider
 * (the chance the condition fires), new conditions start at 50 %, and one «На весь вечер» switch for all of them.
 * Visible only to the club owner: the rules API answers 403 to anybody else and the block then hides.
 */
type Kind = 'role' | 'same_color' | 'different_color' | 'red_color';
type Rule = { id: string; playerId: string; kind: Kind; role: string | null; otherPlayerId: string | null; percent: number; enabled: boolean };
type Quota = { playerId: string; wholeEvening: boolean; maxSuccessfulGames: number | null };

const DEFAULT_PERCENT = 50;
const ROLES: Array<[string, string]> = [['citizen', 'Мирный'], ['sheriff', 'Шериф'], ['mafia', 'Мафия'], ['don', 'Дон']];
const PHRASE: Record<Kind, string> = {
  role: 'Мне нравится играть на',
  same_color: 'Люблю играть в одноцвете с',
  different_color: 'Не хочу играть в одноцвете с',
  red_color: 'Красная карта (мирный)',
};
const field = 'min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-sm text-white';

async function send(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Не удалось сохранить'), { status: response.status });
  return body;
}

type Draft = { kind: Kind; role: string | null; otherPlayerId: string | null };

export function PlayerVipSettings({ playerId }: { playerId: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [maxGames, setMaxGames] = useState(2);

  const load = async () => {
    const [ruleData, quotaData] = await Promise.all([send('/api/admin/vip-probability-rules'), send('/api/admin/vip-probability-rules/game-quotas')]);
    setRules((Array.isArray(ruleData.rules) ? ruleData.rules : []).filter((rule: Rule) => rule.playerId === playerId));
    const mine = (Array.isArray(quotaData.quotas) ? quotaData.quotas : []).find((item: Quota) => item.playerId === playerId) || null;
    setQuota(mine);
    setMaxGames(mine?.maxSuccessfulGames ?? 2);
  };
  useEffect(() => {
    let alive = true;
    setAllowed(null); setDraft(null); setError('');
    load().then(() => { if (alive) setAllowed(true); }).catch((cause: any) => { if (alive) { setAllowed(cause?.status === 403 ? false : true); if (cause?.status !== 403) setError(cause?.message || 'Не удалось загрузить'); } });
    void api.getPlayers().then((people) => { if (alive) setPlayers(Array.isArray(people) ? people : []); }).catch(() => undefined);
    return () => { alive = false; };
  }, [playerId]);

  const others = useMemo(() => players.filter((player) => String(player.id) !== playerId).sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), 'ru')), [players, playerId]);
  if (allowed === false || allowed === null) return null;

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await load(); } catch (cause: any) { setError(cause?.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };
  const payload = (rule: Omit<Rule, 'id'>) => JSON.stringify({ ...rule, role: rule.kind === 'role' ? rule.role : null, otherPlayerId: rule.kind === 'same_color' || rule.kind === 'different_color' ? rule.otherPlayerId : null });
  const update = (rule: Rule, patch: Partial<Rule>) => {
    const next = { ...rule, ...patch };
    setRules((list) => list.map((item) => (item.id === rule.id ? next : item)));
    return run(() => send(`/api/admin/vip-probability-rules/${encodeURIComponent(rule.id)}`, { method: 'PUT', body: payload(next) }));
  };
  const add = () => {
    if (!draft) return;
    return run(async () => {
      await send('/api/admin/vip-probability-rules', { method: 'POST', body: payload({ playerId, ...draft, percent: DEFAULT_PERCENT, enabled: true }) });
      // Without a saved quota the deal never fires a player's conditions: the first condition switches «На весь вечер» on.
      if (!quota) await send(`/api/admin/vip-probability-rules/game-quotas/${encodeURIComponent(playerId)}`, { method: 'PUT', body: JSON.stringify({ wholeEvening: true, maxSuccessfulGames: null }) });
      setDraft(null);
    });
  };
  const saveQuota = (wholeEvening: boolean, games: number) => run(() => send(`/api/admin/vip-probability-rules/game-quotas/${encodeURIComponent(playerId)}`, {
    method: 'PUT', body: JSON.stringify({ wholeEvening, maxSuccessfulGames: wholeEvening ? null : games }),
  }));
  const wholeEvening = quota?.wholeEvening ?? false;

  return (
    <section data-testid="crm-player-vip" className="space-y-3 rounded-[17px] border border-amber-300/20 bg-amber-300/[0.04] p-3.5">
      <div>
        <div className="text-[13px] font-bold text-text-primary">VIP-подкрутка</div>
        <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">Только обычные и новичковые вечера, виртуальная раздача. Процент — шанс, что условие сработает. Видите только вы.</p>
      </div>

      {rules.map((rule) => (
        <div key={rule.id} data-testid="crm-player-vip-rule" className={`space-y-2 rounded-xl border border-white/10 bg-black/15 p-3 ${rule.enabled ? '' : 'opacity-60'}`}>
          <div className="text-[12px] font-semibold text-text-primary">{PHRASE[rule.kind]}</div>
          {rule.kind === 'role' ? (
            <select aria-label="Роль" className={field} value={rule.role || 'citizen'} disabled={busy} onChange={(event) => void update(rule, { role: event.target.value })}>
              {ROLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          ) : rule.kind === 'red_color' ? null : (
            <select aria-label="Игрок" className={field} value={rule.otherPlayerId || ''} disabled={busy} onChange={(event) => void update(rule, { otherPlayerId: event.target.value })}>
              {others.map((player) => <option key={player.id} value={String(player.id)}>{player.nickname}</option>)}
            </select>
          )}
          <label className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <span>Шанс срабатывания</span><strong className="text-[13px] text-text-primary">{rule.percent}%</strong>
          </label>
          <input type="range" min={0} max={100} step={5} aria-label={`${PHRASE[rule.kind]}: шанс срабатывания`} className="w-full accent-white" value={rule.percent} disabled={busy}
            onChange={(event) => setRules((list) => list.map((item) => (item.id === rule.id ? { ...item, percent: Number(event.target.value) } : item)))}
            onPointerUp={(event) => void update(rule, { percent: Number((event.target as HTMLInputElement).value) })}
            onKeyUp={(event) => void update(rule, { percent: Number((event.target as HTMLInputElement).value) })} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void update(rule, { enabled: !rule.enabled })} className="min-h-10 flex-1 rounded-lg border border-white/15 px-3 text-[12px] text-text-primary">{rule.enabled ? 'Выключить' : 'Включить'}</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('Удалить условие?')) void run(() => send(`/api/admin/vip-probability-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })); }} className="min-h-10 flex-1 rounded-lg border border-white/15 px-3 text-[12px] text-text-secondary">Удалить</button>
          </div>
        </div>
      ))}

      {draft ? (
        <div data-testid="crm-player-vip-draft" className="space-y-2 rounded-xl border border-white/15 p-3">
          <div className="text-[12px] font-semibold text-text-primary">{PHRASE[draft.kind]}</div>
          {draft.kind === 'role' ? (
            <select aria-label="Роль" className={field} value={draft.role || 'citizen'} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
              {ROLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          ) : (
            <select aria-label="Игрок" className={field} value={draft.otherPlayerId || ''} onChange={(event) => setDraft({ ...draft, otherPlayerId: event.target.value || null })}>
              <option value="">Выберите игрока</option>
              {others.map((player) => <option key={player.id} value={String(player.id)}>{player.nickname}</option>)}
            </select>
          )}
          <p className="text-[11px] text-text-secondary">Шанс срабатывания {DEFAULT_PERCENT}% — его можно поменять ползунком после добавления.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || (draft.kind !== 'role' && !draft.otherPlayerId)} onClick={() => void add()} className="min-h-11 flex-1 rounded-xl bg-white px-3 text-[13px] font-semibold text-black disabled:opacity-40">Добавить</button>
            <button type="button" onClick={() => setDraft(null)} className="min-h-11 flex-1 rounded-xl border border-white/15 px-3 text-[13px] text-text-primary">Отмена</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <button type="button" disabled={busy} onClick={() => setDraft({ kind: 'role', role: 'citizen', otherPlayerId: null })} className="min-h-11 rounded-xl border border-white/15 px-3 text-left text-[12px] text-text-primary">+ Мне нравится играть на…</button>
          <button type="button" disabled={busy} onClick={() => setDraft({ kind: 'same_color', role: null, otherPlayerId: null })} className="min-h-11 rounded-xl border border-white/15 px-3 text-left text-[12px] text-text-primary">+ Люблю играть в одноцвете с…</button>
          <button type="button" disabled={busy} onClick={() => setDraft({ kind: 'different_color', role: null, otherPlayerId: null })} className="min-h-11 rounded-xl border border-white/15 px-3 text-left text-[12px] text-text-primary">+ Не хочу играть в одноцвете с…</button>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        {!quota && rules.length ? <p role="alert" data-testid="crm-player-vip-no-quota" className="text-[12px] text-amber-200">Условия не сработают, пока не выбрано «На весь вечер» или число игр.</p> : null}
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-text-primary">
          <input type="checkbox" checked={wholeEvening} disabled={busy} onChange={(event) => void saveQuota(event.target.checked, maxGames)} /> На весь вечер
        </label>
        {wholeEvening ? <p className="text-[11px] text-text-secondary">Условия проверяются в каждой игре вечера.</p> : (
          <>
            <label className="flex items-center justify-between gap-2 text-[11px] text-text-secondary"><span>Игр со сработавшей подкруткой за вечер</span><strong className="text-[13px] text-text-primary">{maxGames}</strong></label>
            <input type="range" min={1} max={10} step={1} aria-label="Игр со сработавшей подкруткой за вечер" className="w-full accent-white" value={maxGames} disabled={busy}
              onChange={(event) => setMaxGames(Number(event.target.value))}
              onPointerUp={(event) => void saveQuota(false, Number((event.target as HTMLInputElement).value))}
              onKeyUp={(event) => void saveQuota(false, Number((event.target as HTMLInputElement).value))} />
          </>
        )}
      </div>
      {error ? <p role="alert" className="text-[12px] text-amber-200">{error}</p> : null}
    </section>
  );
}
