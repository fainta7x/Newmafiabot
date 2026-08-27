import { useEffect, useState } from 'react';
import type { PlayerDetails } from '../../lib/api.ts';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export default function PlayerServiceTools({ player }: { player: PlayerDetails }) {
  const [eloSeed, setEloSeed] = useState(String(Number((player as any).elo_seed ?? 1000)));
  const [eloSeedReason, setEloSeedReason] = useState(String((player as any).elo_seed_reason || ''));
  const [currentElo, setCurrentElo] = useState(Number((player as any).elo || 1000));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Array<{ id: string; name: string; icon: string }>>([]);
  const [achievementId, setAchievementId] = useState('');
  const [achievementBusy, setAchievementBusy] = useState(false);
  const [achievementMessage, setAchievementMessage] = useState<string | null>(null);

  useEffect(() => {
    setEloSeed(String(Number((player as any).elo_seed ?? 1000)));
    setEloSeedReason(String((player as any).elo_seed_reason || ''));
    setCurrentElo(Number((player as any).elo || 1000));
    setMessage(null);
    setError(null);
  }, [player.id, (player as any).elo_seed, (player as any).elo_seed_reason, player.elo]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin-data/summary', { credentials: 'include', headers: organizerHeaders() })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить достижения');
        return Array.isArray(body?.achievements) ? body.achievements : [];
      })
      .then((items) => {
        if (cancelled) return;
        setAchievements(items);
        setAchievementId((current) => current || items[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setAchievements([]);
      });
    return () => { cancelled = true; };
  }, [player.id]);

  const changeAchievement = async (state: 'grant' | 'revoke' | 'auto') => {
    if (!achievementId || achievementBusy) return;
    setAchievementBusy(true); setAchievementMessage(null);
    try {
      const response = await fetch(`/api/admin-data/players/${encodeURIComponent(player.id)}/achievements/${encodeURIComponent(achievementId)}`, {
        method: 'POST', credentials: 'include', headers: organizerHeaders(), body: JSON.stringify({ state, note: 'Ручная настройка из карточки игрока' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить достижение');
      setAchievementMessage(state === 'grant' ? 'Достижение выдано' : state === 'revoke' ? 'Достижение отозвано' : 'Включена автоматическая выдача');
    } catch (achievementError: any) {
      setAchievementMessage(achievementError?.message || 'Не удалось изменить достижение');
    } finally { setAchievementBusy(false); }
  };

  const saveEloSeed = async () => {
    if (saving) return;
    const seed = Number(eloSeed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 10000) {
      setError('Стартовый Elo должен быть целым числом от 0 до 10000');
      return;
    }
    if (!window.confirm(`Установить стартовый Elo ${seed} для ${player.nickname} и пересчитать всю Elo-историю?`)) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/elo-seed`, {
        method: 'PATCH', credentials: 'include', headers: organizerHeaders(), body: JSON.stringify({ elo_seed: seed, reason: eloSeedReason.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить стартовый Elo');
      setEloSeed(String(Number(body?.player?.elo_seed ?? seed)));
      setEloSeedReason(String(body?.player?.elo_seed_reason || ''));
      setCurrentElo(Number(body?.player?.elo ?? currentElo));
      setMessage(`История пересчитана. Текущий Elo: ${Number(body?.player?.elo ?? currentElo)}`);
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось изменить стартовый Elo');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <PlayerTokenLedgerCard playerId={player.id} initialBalance={Number(player.tokens || 0)} />
      {achievements.length ? <section className="rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Ручное достижение</span><span className="mt-0.5 block text-[11px] leading-4 text-text-secondary">Исключение для конкретного игрока. Каталог достижений настраивается отдельно.</span></div>
        <select value={achievementId} onChange={(event) => setAchievementId(event.target.value)} className="mobile-field mt-3 min-h-[44px]">
          {achievements.map((achievement) => <option key={achievement.id} value={achievement.id}>{achievement.icon} {achievement.name}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" disabled={achievementBusy} onClick={() => void changeAchievement('grant')} className="min-h-[44px] rounded-xl bg-accent px-1 text-[11px] font-bold text-white disabled:opacity-50">Выдать</button>
          <button type="button" disabled={achievementBusy} onClick={() => void changeAchievement('revoke')} className="min-h-[44px] rounded-xl bg-danger-soft px-1 text-[11px] font-bold text-danger disabled:opacity-50">Забрать</button>
          <button type="button" disabled={achievementBusy} onClick={() => void changeAchievement('auto')} className="min-h-[44px] rounded-xl bg-surface-2 px-1 text-[11px] font-bold text-text-primary disabled:opacity-50">Авто</button>
        </div>
        {achievementMessage ? <p className="mt-2 text-[11px] text-text-secondary">{achievementMessage}</p> : null}
      </section> : null}
      <section className="rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Стартовый Elo</span><span className="mt-0.5 block text-[11px] leading-4 text-text-secondary">Редкая служебная коррекция с полным пересчётом истории.</span></div>
          <div className="shrink-0 text-right"><div className="text-[10px] text-text-muted">Сейчас</div><div className="text-lg font-black text-text-primary">{Math.round(currentElo)}</div></div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
          <input type="number" min={0} max={10000} step={1} value={eloSeed} onChange={(event) => setEloSeed(event.target.value)} className="mobile-field min-h-[44px]" aria-label="Стартовый Elo" />
          <input value={eloSeedReason} onChange={(event) => setEloSeedReason(event.target.value)} maxLength={200} placeholder="Основание изменения" className="mobile-field min-h-[44px]" />
        </div>
        <button type="button" disabled={saving} onClick={() => void saveEloSeed()} className="mt-2 min-h-[44px] w-full rounded-xl border border-border-soft bg-surface-2 px-3 text-xs font-black text-text-primary disabled:opacity-50">{saving ? 'Пересчитываем…' : 'Сохранить и пересчитать историю'}</button>
        {message ? <p className="mt-2 text-[11px] font-bold text-success">{message}</p> : null}
        {error ? <p className="mt-2 text-[11px] text-danger">{error}</p> : null}
      </section>
    </div>
  );
}
