import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Laptop, Loader2, Radio, Unplug } from 'lucide-react';
import { ObsWebSocketClient, type ObsConnectionSnapshot } from '../../lib/obsWebSocket.ts';

const TOKEN_KEY = '2la-obs-bridge-token-v1';
const EMPTY_SNAPSHOT: ObsConnectionSnapshot = {
  obsVersion: null,
  websocketVersion: null,
  currentScene: null,
  streamActive: false,
  recordingActive: false,
};

const heartbeat = async (token: string, snapshot: ObsConnectionSnapshot, connected: boolean, error: string | null = null) => {
  const response = await fetch('/api/public/obs-bridge/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
    body: JSON.stringify({
      obs_connected: connected,
      obs_version: snapshot.obsVersion,
      websocket_version: snapshot.websocketVersion,
      current_scene: snapshot.currentScene,
      stream_active: snapshot.streamActive,
      recording_active: snapshot.recordingActive,
      last_error: error,
    }),
  });
  if (response.status === 401) throw new Error('pairing-revoked');
  if (!response.ok) throw new Error('Не удалось передать статус в приложение');
};

export const ObsBridgePage: React.FC = () => {
  const clientRef = useRef(new ObsWebSocketClient());
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [snapshot, setSnapshot] = useState<ObsConnectionSnapshot>(EMPTY_SNAPSHOT);
  const [obsConnected, setObsConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forgetPairing = () => {
    clientRef.current.disconnect();
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setObsConnected(false);
    setSnapshot(EMPTY_SNAPSHOT);
  };

  const pair = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/public/obs-bridge/pair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.bridge_token) throw new Error(body?.error || 'Не удалось привязать ноутбук');
      localStorage.setItem(TOKEN_KEY, body.bridge_token);
      setToken(body.bridge_token);
      setCode('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось привязать ноутбук'); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const next = await clientRef.current.connect('ws://127.0.0.1:4455', password);
      setSnapshot(next);
      setObsConnected(true);
      await heartbeat(token, next, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось подключиться к OBS';
      setObsConnected(false);
      setError(message);
      try { await heartbeat(token, EMPTY_SNAPSHOT, false, message); } catch {}
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    clientRef.current.disconnect();
    setObsConnected(false);
    setSnapshot(EMPTY_SNAPSHOT);
    try { if (token) await heartbeat(token, EMPTY_SNAPSHOT, false); } catch {}
  };

  useEffect(() => {
    if (!token) return undefined;
    const tick = async () => {
      try {
        if (clientRef.current.isConnected()) {
          const next = await clientRef.current.readSnapshot();
          setSnapshot(next);
          setObsConnected(true);
          await heartbeat(token, next, true);
        } else {
          setObsConnected(false);
          await heartbeat(token, EMPTY_SNAPSHOT, false);
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'pairing-revoked') {
          forgetPairing();
          setError('Привязка отменена в приложении. Получите новый код.');
        } else {
          setObsConnected(false);
        }
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3_000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => () => clientRef.current.disconnect(), []);

  return <main className="min-h-screen bg-[#090a0d] px-4 py-8 text-white" data-testid="obs-bridge-page">
    <div className="mx-auto w-full max-w-lg space-y-4">
      <header className="text-center"><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">2LA Noire</div><h1 className="mt-2 text-[26px] font-semibold">Мост к OBS Studio</h1><p className="mt-2 text-[14px] leading-6 text-white/50">Оставьте эту страницу открытой на ноутбуке, где запущен OBS.</p></header>

      {!token ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
        <div className="flex items-center gap-2"><Laptop className="h-5 w-5 text-sky-200" /><h2 className="text-[16px] font-semibold">1. Привяжите ноутбук</h2></div>
        <p className="mt-2 text-[13px] leading-5 text-white/50">В приложении откройте активную игру, нажмите кнопку с монитором, создайте код и введите его здесь.</p>
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8))} autoCapitalize="characters" autoComplete="one-time-code" placeholder="КОД ИЗ ПРИЛОЖЕНИЯ" className="mt-4 min-h-14 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-center font-mono text-[20px] tracking-[0.14em] text-white outline-none placeholder:text-[13px] placeholder:tracking-normal placeholder:text-white/25" />
        <button type="button" disabled={busy || code.length !== 8} onClick={() => void pair()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[14px] font-bold text-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Привязать ноутбук</button>
      </section> : <>
        <section className={`rounded-3xl border p-5 ${obsConnected ? 'border-emerald-300/20 bg-emerald-300/[0.07]' : 'border-white/10 bg-white/[0.045]'}`}>
          <div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${obsConnected ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/[0.07] text-white/45'}`}>{obsConnected ? <CheckCircle2 className="h-5 w-5" /> : <Radio className="h-5 w-5" />}</span><div><h2 className="text-[16px] font-semibold">{obsConnected ? 'OBS подключён' : 'Ноутбук привязан'}</h2><p className="mt-1 text-[13px] leading-5 text-white/50">{obsConnected ? `Текущая сцена: ${snapshot.currentScene || '—'}` : 'Теперь подключите OBS Studio.'}</p></div></div>
          {obsConnected ? <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-[13px] text-white/60">OBS {snapshot.obsVersion || '—'} · эфир {snapshot.streamActive ? 'идёт' : 'не запущен'} · запись {snapshot.recordingActive ? 'идёт' : 'не идёт'}</div> : null}
        </section>

        {!obsConnected ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <h2 className="text-[16px] font-semibold">2. Подключите OBS</h2>
          <p className="mt-2 text-[13px] leading-5 text-white/50">В OBS включите WebSocket-сервер на стандартном порту 4455. Пароль остаётся только в памяти этой страницы.</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" placeholder="Пароль WebSocket из OBS" className="mt-4 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-[14px] text-white outline-none placeholder:text-white/25" />
          <button type="button" disabled={busy} onClick={() => void connect()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[14px] font-bold text-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}Подключить OBS</button>
        </section> : <button type="button" onClick={() => void disconnect()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-[13px] font-semibold text-white/65"><Unplug className="h-4 w-4" />Отключиться от OBS</button>}

        <button type="button" onClick={forgetPairing} className="w-full py-2 text-[12px] text-white/35">Забыть привязку на этом ноутбуке</button>
      </>}

      {error ? <p className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.06] px-4 py-3 text-[13px] leading-5 text-rose-100/80">{error}</p> : null}
      <p className="text-center text-[11px] leading-5 text-white/25">Пароль OBS не отправляется на сервер и не сохраняется.</p>
    </div>
  </main>;
};

export default ObsBridgePage;
