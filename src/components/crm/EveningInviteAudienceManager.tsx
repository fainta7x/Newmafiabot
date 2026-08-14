import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { api, type Player } from '../../lib/api.ts';

type Props = {
  onChanged?: () => void;
};

const isFuturePause = (player: Player) => {
  if (!player.do_not_invite_until) return false;
  const until = new Date(player.do_not_invite_until).getTime();
  return Number.isFinite(until) && until > Date.now();
};

const isInMailing = (player: Player) => player.contact_status === 'normal' && !isFuturePause(player);

export default function EveningInviteAudienceManager({ onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api.getPlayers();
      setPlayers([...rows].sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить базу игроков');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!expanded || players.length) return;
    void load();
  }, [expanded]);

  const mailingCount = useMemo(() => players.filter(isInMailing).length, [players]);
  const excludedCount = players.length - mailingCount;
  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return players;
    return players.filter((player) => (
      player.nickname.toLocaleLowerCase('ru-RU').includes(query)
      || (player.full_name || '').toLocaleLowerCase('ru-RU').includes(query)
      || (player.telegram_username || '').toLocaleLowerCase('ru-RU').includes(query)
    ));
  }, [players, search]);

  const toggleMailing = async (player: Player) => {
    if (savingId || player.contact_status === 'blocked') return;
    setSavingId(player.id);
    setError('');
    try {
      const nextEnabled = !isInMailing(player);
      const updated = await api.updatePlayer(player.id, nextEnabled
        ? {
            contact_status: 'normal',
            do_not_invite_until: null,
            pause_reason: null,
          }
        : {
            contact_status: 'paused',
            do_not_invite_until: null,
            pause_reason: 'Исключён из рассылки организатором',
          });
      setPlayers((current) => current.map((item) => item.id === player.id ? { ...item, ...updated } : item));
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить рассылку');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-h-[44px] w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <strong className="block text-[13px] text-text-primary">База рассылки</strong>
          <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">
            {players.length ? `В базе ${players.length} · приглашаем ${mailingCount} · не приглашаем ${excludedCount}` : 'Укажи, кому вообще можно отправлять личные анонсы.'}
          </span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-border-soft pt-3">
          {loading ? <p className="py-3 text-[11px] text-text-secondary">Загружаю игроков…</p> : null}
          {error ? <div className="rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}

          {!loading ? <>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-9" />
            </label>

            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {visiblePlayers.map((player) => {
                const enabled = isInMailing(player);
                const blocked = player.contact_status === 'blocked';
                const busy = savingId === player.id;
                return (
                  <div key={player.id} className="flex min-h-[48px] items-center gap-3 rounded-[11px] bg-surface-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-[11px] text-text-primary">{player.nickname}</strong>
                      <span className="mt-0.5 block truncate text-[9px] text-text-muted">
                        {blocked ? 'Заблокирован' : enabled ? 'Получает личные анонсы' : isFuturePause(player) ? 'Временно не приглашать' : 'Не приглашать'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busy || blocked}
                      onClick={() => void toggleMailing(player)}
                      className={`min-h-[34px] shrink-0 rounded-[9px] px-3 text-[10px] font-bold disabled:opacity-40 ${enabled ? 'border border-border-soft bg-surface-1 text-text-secondary' : 'bg-accent text-white'}`}
                    >
                      {busy ? 'Сохраняю…' : blocked ? 'Блок' : enabled ? 'Не приглашать' : 'Вернуть'}
                    </button>
                  </div>
                );
              })}
              {!visiblePlayers.length && players.length ? <p className="py-5 text-center text-[11px] text-text-muted">Ничего не найдено.</p> : null}
            </div>
          </> : null}
        </div>
      ) : null}
    </section>
  );
}
