import { useCallback, useEffect, useState } from 'react';
import PlayerSettingsLoadState from './PlayerSettingsLoadState.tsx';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type State = { blocked_kinds: string[]; allow_direct_contact: boolean; kinds: Array<{ kind: string; label: string }> };

/**
 * «Приглашения» (owner, 2026-10-13): the player chooses which invitations and mailings they want, so nobody is bothered
 * about formats they do not play, and whether friends may write to them directly from their own VK / Telegram.
 */
export default function PlayerInviteSettings() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setState(await getJson<State>('/api/player/invite-preferences', 'Не удалось загрузить настройки')); }
    catch (e: any) { setError(e?.message || 'Не удалось загрузить настройки'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const body = await sendJson('/api/player/invite-preferences', 'PUT', patch, 'Не удалось сохранить');
      setState(body as State); setSaved(true);
    } catch (e: any) { setError(e?.message || 'Не удалось сохранить'); } finally { setBusy(false); }
  };

  if (!state) return <PlayerSettingsLoadState title="Приглашения" loading="Загружаем настройки приглашений…" error={error} onRetry={() => void load()} />;
  const blocked = new Set(state.blocked_kinds);
  const toggle = (kind: string) => {
    const next = new Set(blocked);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    void save({ blocked_kinds: [...next] });
  };
  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4" data-testid="player-invite-settings" aria-busy={busy}>
    <h2 className="font-semibold">Приглашения</h2>
    <p className="mt-1 text-sm text-white/50">Выключи то, что тебе не интересно: тебе не будут писать об этих вечерах и не будут предлагать позвать тебя на них.</p>
    <div className="mt-3 space-y-2">
      {state.kinds.map((item) => <label key={item.kind} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 px-3 text-sm">
        <span>{item.label}</span>
        <input type="checkbox" aria-label={item.label} checked={!blocked.has(item.kind)} disabled={busy} onChange={() => toggle(item.kind)} />
      </label>)}
    </div>
    <label className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 px-3 text-sm">
      <span><span className="block">Друзья могут написать мне лично</span><span className="block text-xs text-white/45">Покажем им ссылку на твой ВК или Telegram, чтобы они позвали тебя от себя.</span></span>
      <input type="checkbox" aria-label="Друзья могут написать мне лично" checked={state.allow_direct_contact} disabled={busy} onChange={(event) => void save({ allow_direct_contact: event.target.checked })} />
    </label>
    {busy ? <p role="status" className="mt-2 text-xs text-white/50">Сохраняем…</p> : saved ? <p role="status" className="mt-2 text-xs text-emerald-300">Настройки приглашений сохранены</p> : null}
    {error ? <div role="alert" className="mt-2 text-xs text-rose-300">{error}</div> : null}
  </section>;
}
