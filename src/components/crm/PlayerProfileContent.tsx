import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.ts';
import { PlayerProfileContent as PlayerProfileContentBase } from './PlayerProfileContentBase.tsx';
import { PlayerTokenLedgerCard } from './PlayerTokenLedgerCard.tsx';

export type PlayerProfileContentProps = React.ComponentProps<typeof PlayerProfileContentBase>;
type GameLevel = 'novice' | 'club' | 'tournament';
type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

const GAME_LEVEL_HINTS: Record<GameLevel, string> = {
  novice: 'Получает приглашения только на новичковые вечера',
  club: 'Получает приглашения на новичковые и обычные вечера',
  tournament: 'Получает приглашения на обычные и турнирные вечера',
};

const JUDGE_LEVEL_HINTS: Record<JudgeLevel, string> = {
  none: 'Не может самостоятельно вести игры',
  trainee: 'Может вести только игры новичков',
  host: 'Может вести новичковые и обычные клубные игры',
  judge: 'Может вести любые клубные, рейтинговые и турнирные игры',
};

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = (props) => {
  const initialLevel = ((props.player as any).game_level || 'club') as GameLevel;
  const initialJudgeLevel = ((props.player as any).judge_level || 'none') as JudgeLevel;
  const [gameLevel, setGameLevel] = useState<GameLevel>(initialLevel);
  const [judgeLevel, setJudgeLevel] = useState<JudgeLevel>(initialJudgeLevel);
  const [eloSeed, setEloSeed] = useState(String(Number((props.player as any).elo_seed ?? 1000)));
  const [eloSeedReason, setEloSeedReason] = useState(String((props.player as any).elo_seed_reason || ''));
  const [currentElo, setCurrentElo] = useState(Number((props.player as any).elo || 1000));
  const [levelSaving, setLevelSaving] = useState(false);
  const [judgeLevelSaving, setJudgeLevelSaving] = useState(false);
  const [eloSaving, setEloSaving] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);
  const [judgeLevelError, setJudgeLevelError] = useState<string | null>(null);
  const [eloMessage, setEloMessage] = useState<string | null>(null);
  const [eloError, setEloError] = useState<string | null>(null);

  useEffect(() => {
    setGameLevel((((props.player as any).game_level || 'club') as GameLevel));
    setJudgeLevel((((props.player as any).judge_level || 'none') as JudgeLevel));
    setEloSeed(String(Number((props.player as any).elo_seed ?? 1000)));
    setEloSeedReason(String((props.player as any).elo_seed_reason || ''));
    setCurrentElo(Number((props.player as any).elo || 1000));
    setLevelError(null);
    setJudgeLevelError(null);
    setEloError(null);
    setEloMessage(null);
  }, [props.player.id, (props.player as any).game_level, (props.player as any).judge_level]);

  const changeGameLevel = async (next: GameLevel) => {
    if (levelSaving || next === gameLevel) return;
    const previous = gameLevel;
    setGameLevel(next);
    setLevelSaving(true);
    setLevelError(null);
    try {
      await api.updatePlayer(props.player.id, { game_level: next } as any);
    } catch (error: any) {
      setGameLevel(previous);
      setLevelError(error?.message || 'Не удалось сохранить уровень игрока');
    } finally {
      setLevelSaving(false);
    }
  };

  const changeJudgeLevel = async (next: JudgeLevel) => {
    if (judgeLevelSaving || next === judgeLevel) return;
    const previous = judgeLevel;
    setJudgeLevel(next);
    setJudgeLevelSaving(true);
    setJudgeLevelError(null);
    try {
      await api.updatePlayer(props.player.id, { judge_level: next } as any);
    } catch (error: any) {
      setJudgeLevel(previous);
      setJudgeLevelError(error?.message || 'Не удалось сохранить полномочия ведущего');
    } finally {
      setJudgeLevelSaving(false);
    }
  };

  const saveEloSeed = async () => {
    if (eloSaving) return;
    const seed = Number(eloSeed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 10000) {
      setEloError('Стартовый Elo должен быть целым числом от 0 до 10000');
      return;
    }
    if (!window.confirm(`Установить стартовый Elo ${seed} для ${props.player.nickname} и пересчитать всю Elo-историю?`)) return;
    setEloSaving(true);
    setEloError(null);
    setEloMessage(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(props.player.id)}/elo-seed`, {
        method: 'PATCH',
        credentials: 'include',
        headers: organizerHeaders(),
        body: JSON.stringify({ elo_seed: seed, reason: eloSeedReason.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить стартовый Elo');
      setEloSeed(String(Number(body?.player?.elo_seed ?? seed)));
      setEloSeedReason(String(body?.player?.elo_seed_reason || ''));
      setCurrentElo(Number(body?.player?.elo ?? currentElo));
      setEloMessage(`История пересчитана. Текущий Elo: ${Number(body?.player?.elo ?? currentElo)}`);
    } catch (error: any) {
      setEloError(error?.message || 'Не удалось изменить стартовый Elo');
    } finally {
      setEloSaving(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Telegram</span>
          <strong className="mt-0.5 block truncate text-[13px] text-text-primary">
            {props.player.telegram_user_id ? 'Профиль привязан' : 'Профиль не привязан'}
          </strong>
        </div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${props.player.telegram_user_id ? 'bg-success' : 'bg-text-muted'}`} />
      </div>

      <div className="rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Уровень игры</span>
            <span className="mt-0.5 block text-[11px] text-text-secondary">{GAME_LEVEL_HINTS[gameLevel]}</span>
          </div>
          <select
            value={gameLevel}
            disabled={levelSaving}
            onChange={(event) => void changeGameLevel(event.target.value as GameLevel)}
            className="mobile-field min-h-[44px] sm:w-[190px]"
          >
            <option value="novice">Новичок</option>
            <option value="club">Игрок клуба</option>
            <option value="tournament">Турнирный игрок</option>
          </select>
        </div>
        {levelSaving ? <p className="mt-2 text-[11px] text-text-muted">Сохраняем…</p> : null}
        {levelError ? <p className="mt-2 text-[11px] text-danger">{levelError}</p> : null}
      </div>

      <div className="rounded-[14px] border border-border-soft bg-surface-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Стартовый Elo</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-text-secondary">Фиксированная точка входа в Elo. Уровень игрока её автоматически не меняет.</span>
          </div>
          <div className="shrink-0 text-right"><div className="text-[10px] text-text-muted">Сейчас</div><div className="text-lg font-black text-text-primary">{Math.round(currentElo)}</div></div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
          <input type="number" min={0} max={10000} step={1} value={eloSeed} onChange={(event) => setEloSeed(event.target.value)} className="mobile-field min-h-[44px]" aria-label="Стартовый Elo" />
          <input value={eloSeedReason} onChange={(event) => setEloSeedReason(event.target.value)} maxLength={200} placeholder="Основание, например: опытный игрок клуба" className="mobile-field min-h-[44px]" />
        </div>
        <button type="button" disabled={eloSaving} onClick={() => void saveEloSeed()} className="mt-2 min-h-[44px] w-full rounded-xl border border-border-soft bg-surface-2 px-3 text-xs font-black text-text-primary disabled:opacity-50">{eloSaving ? 'Пересчитываем Elo…' : 'Сохранить и пересчитать всю историю'}</button>
        <p className="mt-2 text-[10px] leading-4 text-text-muted">Новичковые игры по-прежнему не влияют на Elo. Турниры и остальные учитываемые игры пересчитаются от нового seed.</p>
        {eloMessage ? <p className="mt-2 text-[11px] font-bold text-success">{eloMessage}</p> : null}
        {eloError ? <p className="mt-2 text-[11px] text-danger">{eloError}</p> : null}
      </div>

      <div className="rounded-[14px] border border-accent/20 bg-surface-1 px-3.5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Полномочия ведущего</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-text-secondary">{JUDGE_LEVEL_HINTS[judgeLevel]}</span>
          </div>
          <select
            value={judgeLevel}
            disabled={judgeLevelSaving}
            onChange={(event) => void changeJudgeLevel(event.target.value as JudgeLevel)}
            className="mobile-field min-h-[44px] sm:w-[210px]"
          >
            <option value="none">Нет полномочий</option>
            <option value="trainee">Начинающий ведущий</option>
            <option value="host">Ведущий</option>
            <option value="judge">Судья</option>
          </select>
        </div>
        {judgeLevelSaving ? <p className="mt-2 text-[11px] text-text-muted">Сохраняем полномочия…</p> : null}
        {judgeLevelError ? <p className="mt-2 text-[11px] text-danger">{judgeLevelError}</p> : null}
      </div>

      <PlayerTokenLedgerCard
        playerId={props.player.id}
        initialBalance={Number((props.player as any).tokens || 0)}
      />
      <PlayerProfileContentBase {...props} />
    </div>
  );
};

export default PlayerProfileContent;
