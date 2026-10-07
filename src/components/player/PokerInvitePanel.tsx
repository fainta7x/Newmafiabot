import { useEffect, useMemo, useState } from 'react';

type Candidate = {
  player_id: string;
  nickname: string;
  app_online: boolean;
  vk_linked: boolean;
  vk_online: boolean;
  vk_last_seen_at: string | null;
  vk_status_available: boolean;
  telegram_linked: boolean;
  at_table?: boolean;
  at_table_title?: string | null;
  can_invite: boolean;
  invite_cooldown_seconds: number;
};

const statusFor = (candidate: Candidate, now = Date.now()) => {
  if (candidate.at_table) return { label: candidate.at_table_title ? `За столом · ${candidate.at_table_title}` : 'Уже за столом', tone: 'text-white/45', dot: 'bg-white/30' };
  if (candidate.app_online) return { label: 'В приложении сейчас', tone: 'text-emerald-200', dot: 'bg-emerald-400' };
  if (candidate.vk_online) return { label: 'Онлайн VK', tone: 'text-emerald-200', dot: 'bg-emerald-400' };
  if (candidate.vk_last_seen_at) {
    const age = Math.max(0, now - new Date(candidate.vk_last_seen_at).getTime());
    if (age < 60 * 60 * 1000) {
      const minutes = Math.max(1, Math.round(age / 60_000));
      return { label: `VK · ${minutes} мин назад`, tone: 'text-amber-100/75', dot: 'bg-amber-300' };
    }
    if (age < 24 * 60 * 60 * 1000) {
      const hours = Math.max(1, Math.round(age / 3_600_000));
      return { label: `VK · ${hours} ч назад`, tone: 'text-white/50', dot: 'bg-white/30' };
    }
  }
  if (candidate.telegram_linked) return { label: 'Можно позвать в Telegram', tone: 'text-white/45', dot: 'bg-white/20' };
  return { label: 'Нет Telegram для приглашения', tone: 'text-white/30', dot: 'bg-white/15' };
};

const cooldownLabel = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
};

export default function PokerInvitePanel({ lobbyId }: { lobbyId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = async () => {
    const response = await fetch('/api/player/poker/invite-candidates', { credentials: 'include' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.error || 'Не удалось загрузить игроков.');
    setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
  };

  useEffect(() => {
    void load().catch(() => undefined);
    const timer = window.setInterval(() => void load().catch(() => undefined), 30_000);
    return () => window.clearInterval(timer);
  }, [lobbyId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCandidates((current) => current.map((candidate) => candidate.invite_cooldown_seconds > 0
        ? { ...candidate, invite_cooldown_seconds: Math.max(0, candidate.invite_cooldown_seconds - 1), can_invite: candidate.telegram_linked && !candidate.at_table && candidate.invite_cooldown_seconds <= 1 }
        : candidate));
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => candidates.slice(0, 30), [candidates]);

  const invite = async (candidate: Candidate) => {
    setBusy(candidate.player_id);
    setNotice(null);
    try {
      const response = await fetch(`/api/player/poker/lobbies/${encodeURIComponent(lobbyId)}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: candidate.player_id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const retry = Number(body?.retry_after_seconds || 0);
        if (retry > 0) {
          setCandidates((current) => current.map((item) => item.player_id === candidate.player_id
            ? { ...item, invite_cooldown_seconds: retry, can_invite: false } : item));
        }
        throw new Error(body?.error || 'Не удалось отправить приглашение.');
      }
      const cooldown = Number(body?.invite?.cooldown_seconds || 120);
      setCandidates((current) => current.map((item) => item.player_id === candidate.player_id
        ? { ...item, invite_cooldown_seconds: cooldown, can_invite: false } : item));
      setNotice(`${candidate.nickname}: приглашение отправлено в Telegram`);
    } catch (error: any) {
      setNotice(error?.message || 'Не удалось отправить приглашение.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-3" data-testid="poker-invite-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Кого позвать</h3>
          <p className="mt-0.5 text-[10px] leading-4 text-white/40">Онлайн берём из приложения и VK. Приглашение приходит в Telegram.</p>
        </div>
        <button type="button" onClick={() => void load()} className="min-h-8 shrink-0 rounded-xl bg-white/[.06] px-2.5 text-[10px] text-white/55">Обновить</button>
      </div>

      {notice ? <div className="mt-2 rounded-xl bg-white/[.06] px-3 py-2 text-[11px] text-white/70">{notice}</div> : null}

      <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-0.5">
        {visible.length ? visible.map((candidate) => {
          const status = statusFor(candidate);
          const cooldown = Number(candidate.invite_cooldown_seconds || 0);
          const disabled = busy === candidate.player_id || !candidate.can_invite || cooldown > 0;
          const buttonLabel = candidate.at_table
            ? 'За столом'
            : !candidate.telegram_linked
              ? 'Нет TG'
              : cooldown > 0
                ? cooldownLabel(cooldown)
                : busy === candidate.player_id ? '…' : 'Позвать';
          return (
            <div key={candidate.player_id} className="flex min-h-12 items-center gap-2 rounded-xl bg-white/[.045] px-2.5 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs text-white/90">{candidate.nickname}</b>
                <small className={`block truncate text-[9px] ${status.tone}`}>{status.label}</small>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void invite(candidate)}
                className="min-h-8 min-w-[72px] shrink-0 rounded-xl bg-amber-300 px-2 text-[10px] font-black text-black disabled:bg-white/[.07] disabled:text-white/35"
              >
                {buttonLabel}
              </button>
            </div>
          );
        }) : <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">Пока некого звать</div>}
      </div>
    </section>
  );
}
