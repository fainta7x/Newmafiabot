import { useEffect, useState } from 'react';

type Channel = 'telegram' | 'vk';
type State = {
  preferred_channel: 'auto' | Channel;
  personal_enabled: boolean;
  available_channels: Channel[];
  effective_channel: Channel | null;
  channel_status?: Record<Channel, { linked: boolean; available: boolean; problem?: { message?: string } | null }>;
};

const LABEL: Record<Channel, string> = { telegram: 'Telegram', vk: 'VK' };

export default function PlayerNotificationSettings() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetch('/api/player/notification-preferences', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить настройки');
    setState(body as State);
  };
  useEffect(() => { void load().catch((e) => setError(e?.message || 'Не удалось загрузить настройки')); }, []);

  const save = async (patch: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/player/notification-preferences', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить настройки');
      setState(body as State); setMessage('Настройки уведомлений сохранены');
    } catch (e: any) { setError(e?.message || 'Не удалось сохранить настройки'); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/player/notification-preferences/test', { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить тест');
      setMessage(`Тест поставлен в очередь${body.channel ? ` · ${LABEL[body.channel as Channel]}` : ''}`);
      await load();
    } catch (e: any) { setError(e?.message || 'Не удалось отправить тест'); }
    finally { setBusy(false); }
  };

  if (!state) return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/50">{error || 'Загружаем каналы уведомлений…'}</section>;
  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4" data-testid="player-notification-settings">
    <h2 className="font-semibold">Личные уведомления</h2>
    <p className="mt-1 text-sm text-white/50">Выберите один связанный канал. Одно уведомление не дублируется одновременно в Telegram и VK.</p>
    <label className="mt-4 flex items-center justify-between gap-3 text-sm"><span>Получать личные уведомления</span><input type="checkbox" checked={state.personal_enabled} disabled={busy} onChange={(e)=>void save({ personal_enabled:e.target.checked })}/></label>
    <div className="mt-4 space-y-2" role="radiogroup" aria-label="Предпочтительный канал">
      {state.available_channels.map((channel) => {
        const status=state.channel_status?.[channel];
        return <label key={channel} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 px-3">
          <span><span className="font-medium">{LABEL[channel]}</span><span className="ml-2 text-xs text-white/45">{status?.available===false?'нужно разрешить сообщения':'доступен'}</span></span>
          <input type="radio" name="notification-channel" value={channel} checked={state.preferred_channel===channel || (state.preferred_channel==='auto'&&state.effective_channel===channel)} disabled={busy} onChange={()=>void save({ preferred_channel:channel })}/>
        </label>;
      })}
    </div>
    {state.channel_status?.vk?.problem?.message ? <div className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100">{state.channel_status.vk.problem.message}</div> : null}
    {!state.available_channels.length ? <div className="mt-3 text-sm text-white/50">Сначала свяжите Telegram или VK с игровым профилем.</div> : null}
    <button type="button" disabled={busy || !state.personal_enabled || !state.effective_channel} onClick={()=>void sendTest()} className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm font-medium disabled:opacity-40">Отправить тестовое уведомление</button>
    {message ? <div className="mt-2 text-xs text-emerald-300">{message}</div> : null}
    {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
  </section>;
}
