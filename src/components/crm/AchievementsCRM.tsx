import { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../lib/api.ts';
import { organizerJson } from '../../lib/organizerAuth.ts';
import { SECTION_PLAYER_HANDOFF } from '../../lib/crmSectionNavigation.ts';
import { ACHIEVEMENT_CATEGORIES } from '../../lib/achievementCategories.ts';
import { AchievementEditor, type Achievement } from './AchievementEditor.tsx';
import PlayerAwardsPanel from './PlayerAwardsPanel.tsx';

/** Everything about achievements and awards in one place (owner, 2026-11-10): the catalogue, and a chosen player's manual achievements and official awards. */
const ACHIEVEMENTS_PLAYER_HANDOFF = SECTION_PLAYER_HANDOFF.achievements!;

export default function AchievementsCRM() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState(() => {
    try { const id = sessionStorage.getItem(ACHIEVEMENTS_PLAYER_HANDOFF) || ''; sessionStorage.removeItem(ACHIEVEMENTS_PLAYER_HANDOFF); return id; } catch { return ''; }
  });
  const [achievementId, setAchievementId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const body = await organizerJson<any>('/api/admin-data/summary', 'Не удалось загрузить достижения');
      const list: Achievement[] = Array.isArray(body?.achievements) ? body.achievements : [];
      setItems(list);
      setAchievementId((current) => current || list[0]?.id || '');
    } catch (cause: any) { setError(cause?.message || 'Не удалось загрузить достижения'); }
  };
  useEffect(() => { void load(); void api.getPlayers().then((people) => setPlayers(Array.isArray(people) ? people : [])).catch(() => undefined); }, []);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), 'ru')), [players]);
  const groups = useMemo(() => {
    const known = new Set(ACHIEVEMENT_CATEGORIES.map(([id]) => id));
    const result = ACHIEVEMENT_CATEGORIES.map(([id, label]) => ({ id, label, rows: items.filter((item) => item.category === id).sort((a, b) => a.order - b.order) }));
    const other = items.filter((item) => !known.has(item.category));
    return (other.length ? [...result, { id: 'other', label: 'Другие', rows: other }] : result).filter((group) => group.rows.length);
  }, [items]);

  const change = async (state: 'grant' | 'revoke' | 'auto') => {
    if (!playerId || !achievementId || busy) return;
    setBusy(true); setMessage(null);
    try {
      await organizerJson(`/api/admin-data/players/${encodeURIComponent(playerId)}/achievements/${encodeURIComponent(achievementId)}`, 'Не удалось изменить достижение', {
        method: 'POST', body: JSON.stringify({ state, note: 'Ручная настройка из раздела «Достижения»' }),
      });
      setMessage(state === 'grant' ? 'Достижение выдано' : state === 'revoke' ? 'Достижение отозвано' : 'Включена автоматическая выдача');
    } catch (cause: any) { setMessage(cause?.message || 'Не удалось изменить достижение'); } finally { setBusy(false); }
  };

  return <div data-testid="crm-achievements" className="mx-auto w-full max-w-2xl space-y-4">
    <p className="text-[13px] leading-5 text-text-secondary">Каталог достижений, выдача вручную и официальные награды игроков.</p>
    {error ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}

    <section className="space-y-3 rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
      <div className="text-[13px] font-bold text-text-primary">Игрок</div>
      <select aria-label="Игрок" value={playerId} onChange={(event) => { setPlayerId(event.target.value); setMessage(null); }} className="mobile-field min-h-[44px]">
        <option value="">Выберите игрока</option>
        {sortedPlayers.map((player) => <option key={player.id} value={String(player.id)}>{player.nickname}</option>)}
      </select>
      {playerId ? <>
        <div className="space-y-2 rounded-[14px] border border-border-soft bg-surface-2 p-3">
          <span className="block text-[12px] font-semibold text-text-primary">Выдать или забрать достижение</span>
          <span className="block text-[11px] leading-4 text-text-secondary">Исключение для этого игрока. «Авто» возвращает обычную выдачу по условиям.</span>
          <select aria-label="Достижение" value={achievementId} onChange={(event) => setAchievementId(event.target.value)} className="mobile-field min-h-[44px]">
            {items.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={busy} onClick={() => void change('grant')} className="min-h-[44px] rounded-xl bg-accent px-1 text-[12px] font-bold text-white disabled:opacity-50">Выдать</button>
            <button type="button" disabled={busy} onClick={() => void change('revoke')} className="min-h-[44px] rounded-xl bg-danger-soft px-1 text-[12px] font-bold text-danger disabled:opacity-50">Забрать</button>
            <button type="button" disabled={busy} onClick={() => void change('auto')} className="min-h-[44px] rounded-xl bg-surface-1 px-1 text-[12px] font-bold text-text-primary disabled:opacity-50">Авто</button>
          </div>
          {message ? <p role="status" className="text-[11px] text-text-secondary">{message}</p> : null}
        </div>
        <PlayerAwardsPanel playerId={playerId} />
      </> : <p className="text-[12px] text-text-muted">Выберите игрока, чтобы выдать достижение или посмотреть его награды.</p>}
    </section>

    <section className="space-y-2">
      <div className="px-1 text-[13px] font-bold text-text-primary">Каталог достижений · {items.length}</div>
      {groups.map((group) => <details key={group.id} className="rounded-[16px] border border-border-soft bg-surface-1">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-[13px] font-semibold text-text-primary"><span>{group.label}</span><span className="text-[11px] font-normal text-text-muted">{group.rows.length}</span></summary>
        <div className="space-y-2 border-t border-border-soft p-2.5">{group.rows.map((item) => <AchievementEditor key={item.id} item={item} onSaved={load} />)}</div>
      </details>)}
    </section>
  </div>;
}
