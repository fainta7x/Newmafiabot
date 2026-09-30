import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clipboard, Laptop, Link2, Loader2, Mic, MicOff, Radio, RefreshCw, Unplug } from 'lucide-react';
import { OBS_RECOMMENDED_SCENES, orderObsScenes } from '../../lib/obsScenes.ts';

type ObsRemoteStatus = {
  paired: boolean;
  bridge_online: boolean;
  obs_connected: boolean;
  obs_version: string | null;
  websocket_version: string | null;
  current_scene: string | null;
  stream_active: boolean;
  recording_active: boolean;
  last_error: string | null;
  last_seen_at: string | null;
  scenes?: string[];
  audio_inputs?: Array<{ name: string; muted: boolean }>;
};

type PairingCode = { code: string; expires_at: string };

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    cache: 'no-store',
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Не удалось связаться с сервером');
  return body;
};

export const ObsRemoteCRM: React.FC = () => {
  const [status, setStatus] = useState<ObsRemoteStatus | null>(null);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridgeUrl = `${window.location.origin}/obs-bridge`;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setStatus(await request('/api/obs-remote/status'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось проверить OBS');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 4_000);
    return () => window.clearInterval(timer);
  }, []);

  const createCode = async () => {
    setBusy(true); setError(null);
    try { setPairing(await request('/api/obs-remote/pairing-code', { method: 'POST' })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось создать код'); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true); setError(null);
    try {
      await request('/api/obs-remote/revoke', { method: 'POST' });
      setPairing(null);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось отвязать ноутбук'); }
    finally { setBusy(false); }
  };

  const copy = async (value: string, marker: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(marker);
      window.setTimeout(() => setCopied(null), 1_800);
    } catch { setError('Не удалось скопировать. Нажмите и удерживайте текст.'); }
  };

  const connected = status?.obs_connected === true;
  const [sending, setSending] = useState<string | null>(null);

  // A button press waits for the laptop's next heartbeat (about 2 s); the status poll then shows the result.
  const send = async (key: string, command: Record<string, unknown>) => {
    setSending(key); setError(null);
    try {
      await request('/api/obs-remote/command', { method: 'POST', body: JSON.stringify(command) });
      window.setTimeout(() => void load(true), 2_500);
    } catch (err) { setError(err instanceof Error ? err.message : 'OBS не принял команду'); }
    finally { window.setTimeout(() => setSending(null), 2_500); }
  };
  const scenes = orderObsScenes(status?.scenes || []);
  const missingScenes = OBS_RECOMMENDED_SCENES.filter((item) => !(status?.scenes || []).includes(item.name));

  return <div className="space-y-3" data-testid="live-game-obs-remote">
    <section className={`rounded-[22px] border p-4 ${connected ? 'border-emerald-300/20 bg-emerald-300/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${connected ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/[0.07] text-white/45'}`}>
          {connected ? <CheckCircle2 className="h-5 w-5" /> : loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold text-white">{connected ? 'OBS подключён' : status?.bridge_online ? 'Ноутбук подключён, OBS пока нет' : status?.paired ? 'Ноутбук сейчас не в сети' : 'OBS ещё не подключён'}</h3>
          <p className="mt-1 text-[13px] leading-5 text-white/50">
            {connected ? `Сцена: ${status?.current_scene || 'не определена'}` : 'Подключение проходит через специальную страницу на ноутбуке.'}
          </p>
        </div>
        <button type="button" aria-label="Обновить статус OBS" onClick={() => void load()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white/50"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {connected ? <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl bg-black/20 px-3 py-2.5 text-white/55"><span className="block text-white/35">Версия OBS</span><strong className="mt-0.5 block text-white/80">{status?.obs_version || '—'}</strong></div>
        <div className="rounded-xl bg-black/20 px-3 py-2.5 text-white/55"><span className="block text-white/35">WebSocket</span><strong className="mt-0.5 block text-white/80">{status?.websocket_version || '—'}</strong></div>
        <div className="rounded-xl bg-black/20 px-3 py-2.5 text-white/55"><span className="block text-white/35">Трансляция</span><strong className={status?.stream_active ? 'mt-0.5 block text-emerald-200' : 'mt-0.5 block text-white/80'}>{status?.stream_active ? 'В эфире' : 'Не запущена'}</strong></div>
        <div className="rounded-xl bg-black/20 px-3 py-2.5 text-white/55"><span className="block text-white/35">Запись</span><strong className={status?.recording_active ? 'mt-0.5 block text-rose-200' : 'mt-0.5 block text-white/80'}>{status?.recording_active ? 'Идёт' : 'Не идёт'}</strong></div>
      </div> : null}
      {connected ? <div className="mt-4 space-y-3" data-testid="obs-remote-controls">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Сцена в эфире</div>
          <div className="grid grid-cols-2 gap-2">
            {scenes.map((scene) => {
              const live = status?.current_scene === scene.name;
              return <button key={scene.name} type="button" disabled={Boolean(sending) || live} onClick={() => void send(`scene:${scene.name}`, { type: 'scene', scene: scene.name })}
                className={`min-h-14 rounded-2xl border px-3 py-2 text-left disabled:opacity-100 ${live ? 'border-rose-300/40 bg-rose-400/15' : 'border-white/10 bg-black/20 active:bg-white/10'}`}>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-white">{live ? <Circle className="h-2.5 w-2.5 fill-rose-400 text-rose-400" /> : null}{scene.name}</span>
                {scene.hint ? <span className="block text-[11px] leading-4 text-white/40">{sending === `scene:${scene.name}` ? 'Переключаем…' : scene.hint}</span> : null}
              </button>;
            })}
          </div>
          {missingScenes.length ? <p className="mt-2 text-[11px] leading-4 text-white/35">Нет в OBS: {missingScenes.map((item) => `«${item.name}»`).join(', ')}. Создайте сцены с такими названиями — кнопки появятся сами.</p> : null}
        </div>
        {status?.audio_inputs?.length ? <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Звук</div>
          <div className="grid grid-cols-2 gap-2">
            {status.audio_inputs.map((input) => <button key={input.name} type="button" disabled={Boolean(sending)} onClick={() => void send(`mute:${input.name}`, { type: 'mute', input: input.name, muted: !input.muted })}
              aria-label={`${input.name}: ${input.muted ? 'выключен' : 'включён'}`}
              className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 text-left text-[13px] font-semibold ${input.muted ? 'border-white/10 bg-black/20 text-white/40' : 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'}`}>
              {input.muted ? <MicOff className="h-4 w-4 shrink-0" /> : <Mic className="h-4 w-4 shrink-0" />}<span className="min-w-0 truncate">{input.name}</span>
            </button>)}
          </div>
        </div> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={Boolean(sending)} onClick={() => { if (!status?.stream_active || window.confirm('Остановить трансляцию?')) void send('stream', { type: 'stream', action: status?.stream_active ? 'stop' : 'start' }); }}
            className={`min-h-12 rounded-2xl px-3 text-[13px] font-bold ${status?.stream_active ? 'border border-rose-300/30 bg-rose-400/10 text-rose-100' : 'bg-white text-black'}`}>{sending === 'stream' ? '…' : status?.stream_active ? 'Остановить эфир' : 'Начать эфир'}</button>
          <button type="button" disabled={Boolean(sending)} onClick={() => void send('record', { type: 'record', action: status?.recording_active ? 'stop' : 'start' })}
            className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-3 text-[13px] font-bold text-white/80">{sending === 'record' ? '…' : status?.recording_active ? 'Остановить запись' : 'Начать запись'}</button>
        </div>
      </div> : null}
      {status?.last_error ? <p className="mt-3 rounded-xl bg-rose-300/[0.08] px-3 py-2 text-[12px] leading-5 text-rose-100/80">{status.last_error}</p> : null}
    </section>

    {connected ? null : <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-white"><Laptop className="h-5 w-5 text-sky-200" /><h3 className="text-[15px] font-semibold">Подключить ноутбук</h3></div>
      <ol className="mt-3 space-y-2 text-[13px] leading-5 text-white/55">
        <li><span className="mr-2 text-white/30">1.</span>Откройте на ноутбуке страницу ниже.</li>
        <li><span className="mr-2 text-white/30">2.</span>Создайте код и введите его на ноутбуке.</li>
        <li><span className="mr-2 text-white/30">3.</span>Введите пароль WebSocket из OBS только на ноутбуке.</li>
      </ol>
      <button type="button" onClick={() => void copy(bridgeUrl, 'url')} className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 text-left text-[13px] text-white/70">
        <span className="min-w-0 truncate">{bridgeUrl}</span><span className="flex shrink-0 items-center gap-1.5 text-sky-200"><Clipboard className="h-4 w-4" />{copied === 'url' ? 'Готово' : 'Копировать'}</span>
      </button>

      {pairing ? <button type="button" onClick={() => void copy(pairing.code, 'code')} className="mt-3 w-full rounded-2xl border border-amber-200/15 bg-amber-200/[0.08] px-4 py-4 text-center">
        <span className="block text-[11px] uppercase tracking-[0.14em] text-amber-100/50">Код на 10 минут</span>
        <strong className="mt-1 block font-mono text-[28px] tracking-[0.16em] text-amber-50">{pairing.code}</strong>
        <span className="mt-1 block text-[12px] text-amber-100/55">{copied === 'code' ? 'Код скопирован' : 'Нажмите, чтобы скопировать'}</span>
      </button> : null}

      <button type="button" disabled={busy} onClick={() => void createCode()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[14px] font-bold text-black disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{pairing ? 'Создать другой код' : status?.paired ? 'Подключить другой ноутбук' : 'Создать код подключения'}
      </button>
    </section>}

    {status?.paired ? <button type="button" disabled={busy} onClick={() => void revoke()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[0.06] px-4 text-[13px] font-semibold text-rose-100/75 disabled:opacity-50"><Unplug className="h-4 w-4" />Отвязать ноутбук</button> : null}
    {error ? <p className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.06] px-4 py-3 text-[13px] leading-5 text-rose-100/80">{error}</p> : null}
  </div>;
};

export default ObsRemoteCRM;
