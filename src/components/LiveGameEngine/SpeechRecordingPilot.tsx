import { useEffect, useRef, useState } from 'react';
import { openSpeechRecordingReview } from './SpeechRecordingReview.ts';

type RecorderStatus = 'off' | 'ready' | 'opening' | 'recording' | 'paused';

type LiveSnapshot = {
  phase?: string;
  roundNumber?: number;
  activeSpeakerSlot?: number | null;
  isTimerRunning?: boolean;
  timeLeft?: number;
  votingStage?: string;
  postNightStage?: string;
  activePlayers?: Array<{ slot_num?: number; user_id?: number; nickname?: string }>;
};

type SpeechMeta = {
  id: string;
  sessionId: string;
  key: string;
  slot: number;
  playerId: number | null;
  nickname: string;
  round: number;
  speechType: string;
  startedAt: number;
  pausedMs: number;
  pauseStartedAt: number | null;
};

type StoredSpeechClip = {
  id: string;
  session_id: string;
  slot: number;
  player_id: number | null;
  nickname: string;
  round: number;
  speech_type: string;
  started_at: string;
  duration_seconds: number;
  mime_type: string;
  blob: Blob;
};

const DB_NAME = 'mafia_speech_recordings_v1';
const STORE_NAME = 'clips';

const runtime = {
  armed: false,
  status: 'off' as RecorderStatus,
  stream: null as MediaStream | null,
  openingStream: null as Promise<MediaStream> | null,
  startingRecorder: false,
  autoRecorder: null as MediaRecorder | null,
  chunks: [] as Blob[],
  currentMeta: null as SpeechMeta | null,
  pollTimer: null as number | null,
  sessionId: null as string | null,
  clipCount: 0,
  setupMounted: false,
  rootMissingSince: null as number | null,
  indicator: null as HTMLDivElement | null,
  listeners: new Set<() => void>(),
};

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
};

const notify = () => {
  runtime.listeners.forEach((listener) => listener());
  updateIndicator();
};

const setRuntimeStatus = (status: RecorderStatus) => {
  runtime.status = status;
  notify();
};

const readLiveSnapshot = (): LiveSnapshot | null => {
  try {
    const raw = localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    return JSON.parse(raw) as LiveSnapshot;
  } catch {
    return null;
  }
};

const speechTypeFor = (snapshot: LiveSnapshot) => {
  if (snapshot.phase === 'day_voting' && snapshot.votingStage === 'revote_speeches') return 'Переголосование';
  if (snapshot.postNightStage === 'farewell') return 'Прощальная речь';
  if (snapshot.phase === 'day_speeches') return `День ${snapshot.roundNumber || 1}`;
  return 'Речь';
};

const makeSpeechMeta = (snapshot: LiveSnapshot): SpeechMeta | null => {
  const slot = Number(snapshot.activeSpeakerSlot || 0);
  if (!slot || !runtime.sessionId) return null;
  const player = snapshot.activePlayers?.find((item) => Number(item.slot_num) === slot);
  const round = Number(snapshot.roundNumber || 1);
  const speechType = speechTypeFor(snapshot);
  const key = [snapshot.phase || 'unknown', snapshot.votingStage || '', snapshot.postNightStage || '', round, slot].join(':');
  const startedAt = Date.now();
  return {
    id: `${runtime.sessionId}-${startedAt}-${slot}`,
    sessionId: runtime.sessionId,
    key,
    slot,
    playerId: player?.user_id ? Number(player.user_id) : null,
    nickname: player?.nickname?.trim() || `Игрок ${slot}`,
    round,
    speechType,
    startedAt,
    pausedMs: 0,
    pauseStartedAt: null,
  };
};

const openSpeechDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('session_id', 'session_id', { unique: false });
      store.createIndex('player_id', 'player_id', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const persistSpeechClip = async (clip: StoredSpeechClip) => {
  try {
    const db = await openSpeechDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(clip);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  } catch (error) {
    console.warn('[speech-recording] Failed to persist local clip', error);
  }
};

function updateIndicator() {
  if (typeof document === 'undefined') return;
  if (!runtime.armed || runtime.status === 'off' || runtime.setupMounted) {
    runtime.indicator?.remove();
    runtime.indicator = null;
    return;
  }

  if (!runtime.indicator) {
    const indicator = document.createElement('div');
    indicator.dataset.speechRecordingIndicator = 'true';
    indicator.title = 'Открыть сохранённые речи';
    indicator.onclick = () => void openSpeechRecordingReview(runtime.sessionId);
    Object.assign(indicator.style, {
      position: 'fixed',
      top: '72px',
      right: '10px',
      zIndex: '140',
      maxWidth: '230px',
      padding: '8px 10px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,.12)',
      background: 'rgba(8,10,15,.92)',
      color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      fontWeight: '700',
      boxShadow: '0 10px 28px rgba(0,0,0,.35)',
      pointerEvents: 'auto',
      cursor: 'pointer',
      userSelect: 'none',
    });
    document.body.appendChild(indicator);
    runtime.indicator = indicator;
  }

  const meta = runtime.currentMeta;
  if (runtime.status === 'recording' && meta) {
    runtime.indicator.textContent = `● Запись · #${meta.slot} ${meta.nickname}`;
    runtime.indicator.style.color = '#fda4af';
  } else if (runtime.status === 'paused' && meta) {
    runtime.indicator.textContent = `Ⅱ Пауза записи · #${meta.slot} ${meta.nickname}`;
    runtime.indicator.style.color = '#fcd34d';
  } else if (runtime.status === 'opening') {
    runtime.indicator.textContent = '🎙 Подключаем микрофон…';
    runtime.indicator.style.color = '#bae6fd';
  } else {
    runtime.indicator.textContent = `🎙 Речи · ${runtime.clipCount} · открыть`;
    runtime.indicator.style.color = '#86efac';
  }
}

const releaseStream = () => {
  runtime.stream?.getTracks().forEach((track) => track.stop());
  runtime.stream = null;
};

const requestMicrophoneStream = async () => {
  if (runtime.stream?.getAudioTracks().some((track) => track.readyState === 'live')) return runtime.stream;
  if (runtime.openingStream) return runtime.openingStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported-media');
  if (typeof MediaRecorder === 'undefined') throw new Error('unsupported-recorder');

  const request = navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  }).then((stream) => {
    runtime.openingStream = null;
    if (!runtime.armed) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('recorder-disabled');
    }
    runtime.stream = stream;
    return stream;
  }).catch((error) => {
    runtime.openingStream = null;
    throw error;
  });

  runtime.openingStream = request;
  return request;
};

const finalizeAutoRecording = () => {
  const recorder = runtime.autoRecorder;
  if (!recorder || recorder.state === 'inactive') return;
  try { recorder.stop(); } catch {}
};

const startAutoRecording = async (snapshot: LiveSnapshot) => {
  if (!runtime.armed || runtime.autoRecorder || runtime.startingRecorder) return;
  runtime.startingRecorder = true;
  setRuntimeStatus('opening');
  try {
    const stream = await requestMicrophoneStream();
    if (!runtime.armed || runtime.autoRecorder) return;

    const latest = readLiveSnapshot() || snapshot;
    const slot = Number(latest.activeSpeakerSlot || 0);
    if (!slot || !latest.isTimerRunning) {
      releaseStream();
      setRuntimeStatus(runtime.armed ? 'ready' : 'off');
      return;
    }

    const meta = makeSpeechMeta(latest);
    if (!meta) {
      releaseStream();
      setRuntimeStatus(runtime.armed ? 'ready' : 'off');
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    runtime.autoRecorder = recorder;
    runtime.currentMeta = meta;
    runtime.chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) runtime.chunks.push(event.data);
    };

    recorder.onstop = () => {
      const finishedMeta = runtime.currentMeta;
      const finishedChunks = runtime.chunks;
      const finishedMimeType = recorder.mimeType || mimeType || 'audio/webm';
      runtime.autoRecorder = null;
      runtime.currentMeta = null;
      runtime.chunks = [];

      if (finishedMeta && finishedChunks.length > 0) {
        const endedAt = Date.now();
        const activePauseMs = finishedMeta.pauseStartedAt ? endedAt - finishedMeta.pauseStartedAt : 0;
        const duration = Math.max(0, (endedAt - finishedMeta.startedAt - finishedMeta.pausedMs - activePauseMs) / 1000);
        const blob = new Blob(finishedChunks, { type: finishedMimeType });
        if (blob.size > 0 && duration >= 0.4) {
          runtime.clipCount += 1;
          void persistSpeechClip({
            id: finishedMeta.id,
            session_id: finishedMeta.sessionId,
            slot: finishedMeta.slot,
            player_id: finishedMeta.playerId,
            nickname: finishedMeta.nickname,
            round: finishedMeta.round,
            speech_type: finishedMeta.speechType,
            started_at: new Date(finishedMeta.startedAt).toISOString(),
            duration_seconds: Math.round(duration * 10) / 10,
            mime_type: finishedMimeType,
            blob,
          });
        }
      }

      // Critical for Android / Telegram WebView: do not keep an active microphone
      // between speeches. Keeping getUserMedia alive switches the phone into a
      // communication audio route and can pull game music away from Bluetooth A2DP.
      releaseStream();
      setRuntimeStatus(runtime.armed ? 'ready' : 'off');
      window.setTimeout(() => reconcileAutoRecording(readLiveSnapshot()), 0);
    };

    recorder.start(250);
    setRuntimeStatus('recording');
  } catch (error) {
    releaseStream();
    if ((error as any)?.message !== 'recorder-disabled') {
      console.warn('[speech-recording] Failed to start automatic recording', error);
    }
    setRuntimeStatus(runtime.armed ? 'ready' : 'off');
  } finally {
    runtime.startingRecorder = false;
  }
};

const reconcileAutoRecording = (snapshot: LiveSnapshot | null) => {
  if (!runtime.armed || !snapshot) return;
  const slot = Number(snapshot.activeSpeakerSlot || 0);
  const shouldRun = slot > 0 && Boolean(snapshot.isTimerRunning);
  const meta = runtime.currentMeta;
  const nextMeta = shouldRun ? makeSpeechMeta(snapshot) : null;

  if (shouldRun) {
    if (!runtime.autoRecorder) {
      void startAutoRecording(snapshot);
      return;
    }
    if (meta && nextMeta && meta.key !== nextMeta.key) {
      finalizeAutoRecording();
      return;
    }
    if (runtime.autoRecorder.state === 'paused') {
      if (meta?.pauseStartedAt) {
        meta.pausedMs += Date.now() - meta.pauseStartedAt;
        meta.pauseStartedAt = null;
      }
      try { runtime.autoRecorder.resume(); } catch {}
      setRuntimeStatus('recording');
    }
    return;
  }

  if (!runtime.autoRecorder || !meta) return;
  const sameSpeakerStillSelected = slot === meta.slot;
  const hasTimeLeft = Number(snapshot.timeLeft || 0) > 0;
  if (sameSpeakerStillSelected && hasTimeLeft) {
    if (runtime.autoRecorder.state === 'recording') {
      meta.pauseStartedAt = Date.now();
      try { runtime.autoRecorder.pause(); } catch {}
      setRuntimeStatus('paused');
    }
  } else {
    finalizeAutoRecording();
  }
};

const shutdownRuntime = () => {
  runtime.armed = false;
  if (runtime.autoRecorder && runtime.autoRecorder.state !== 'inactive') {
    try { runtime.autoRecorder.stop(); } catch {}
  }
  runtime.autoRecorder = null;
  runtime.currentMeta = null;
  runtime.chunks = [];
  runtime.startingRecorder = false;
  if (runtime.pollTimer !== null) window.clearInterval(runtime.pollTimer);
  runtime.pollTimer = null;
  releaseStream();
  runtime.sessionId = null;
  runtime.rootMissingSince = null;
  setRuntimeStatus('off');
};

const pollLiveState = () => {
  if (!runtime.armed) return;
  const snapshot = readLiveSnapshot();
  reconcileAutoRecording(snapshot);

  if (runtime.setupMounted) {
    runtime.rootMissingSince = null;
    return;
  }

  const liveRootExists = Boolean(document.querySelector('.evening-live-engine-shell, .tournament-live-shell'));
  if (liveRootExists) {
    runtime.rootMissingSince = null;
    return;
  }

  if (runtime.rootMissingSince === null) runtime.rootMissingSince = Date.now();
  if (Date.now() - runtime.rootMissingSince > 2500) shutdownRuntime();
};

const startPolling = () => {
  if (runtime.pollTimer !== null) return;
  runtime.pollTimer = window.setInterval(pollLiveState, 200);
};

const enableRuntime = async () => {
  if (runtime.armed) {
    setRuntimeStatus(runtime.autoRecorder ? 'recording' : 'ready');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported-media');
  if (typeof MediaRecorder === 'undefined') throw new Error('unsupported-recorder');

  runtime.armed = true;
  runtime.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  runtime.clipCount = 0;
  runtime.rootMissingSince = null;
  try {
    // Ask permission once while the user is still in setup. The same permission can
    // then be reused automatically when each speech starts.
    await requestMicrophoneStream();
  } catch (error) {
    runtime.armed = false;
    runtime.sessionId = null;
    releaseStream();
    throw error;
  }
  startPolling();
  setRuntimeStatus('ready');
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => shutdownRuntime());
}

export default function SpeechRecordingPilot() {
  const [, forceRender] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipDuration, setClipDuration] = useState(0);
  const [testRecording, setTestRecording] = useState(false);
  const testRecorderRef = useRef<MediaRecorder | null>(null);
  const testChunksRef = useRef<Blob[]>([]);
  const testStartedAtRef = useRef<number | null>(null);
  const clipUrlRef = useRef<string | null>(null);

  const status = runtime.status;

  const replaceClipUrl = (next: string | null) => {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = next;
    setClipUrl(next);
  };

  const enableMicrophone = async () => {
    setError(null);
    try {
      await enableRuntime();
    } catch (permissionError: any) {
      if (permissionError?.message === 'unsupported-media') {
        setError('Этот браузер не даёт приложению доступ к микрофону.');
      } else if (permissionError?.message === 'unsupported-recorder') {
        setError('Запись звука не поддерживается этим браузером.');
      } else {
        const denied = permissionError?.name === 'NotAllowedError' || permissionError?.name === 'PermissionDeniedError';
        setError(denied ? 'Доступ к микрофону запрещён. Разрешите его для приложения и попробуйте ещё раз.' : 'Не удалось открыть микрофон на этом устройстве.');
      }
    }
  };

  const startTestRecording = async () => {
    if (!runtime.armed || status !== 'ready' || testRecording) return;
    setError(null);
    replaceClipUrl(null);
    setClipDuration(0);
    testChunksRef.current = [];

    try {
      const stream = await requestMicrophoneStream();
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      testRecorderRef.current = recorder;
      testStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) testChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = testStartedAtRef.current ? (Date.now() - testStartedAtRef.current) / 1000 : 0;
        testStartedAtRef.current = null;
        const blob = new Blob(testChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        testChunksRef.current = [];
        testRecorderRef.current = null;
        setTestRecording(false);
        if (blob.size > 0) replaceClipUrl(URL.createObjectURL(blob));
        setClipDuration(duration);
      };
      recorder.start(250);
      setTestRecording(true);
    } catch {
      testRecorderRef.current = null;
      setError('Не удалось начать тестовую запись. Попробуйте выключить и снова включить запись речей.');
      setTestRecording(false);
    }
  };

  const stopTestRecording = () => {
    const recorder = testRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const disableMicrophone = () => {
    stopTestRecording();
    shutdownRuntime();
  };

  useEffect(() => {
    runtime.setupMounted = true;
    notify();
    const listener = () => forceRender((value) => value + 1);
    runtime.listeners.add(listener);
    return () => {
      runtime.listeners.delete(listener);
      runtime.setupMounted = false;
      notify();
      if (testRecorderRef.current && testRecorderRef.current.state !== 'inactive') {
        try { testRecorderRef.current.stop(); } catch {}
      }

      // When setup turns into the live table, immediately release the permission
      // probe stream. This restores the normal Android media route (Bluetooth/A2DP).
      window.setTimeout(() => {
        if (runtime.setupMounted || !runtime.armed) return;
        const liveRootExists = Boolean(document.querySelector('.evening-live-engine-shell, .tournament-live-shell'));
        if (liveRootExists) {
          if (!runtime.autoRecorder) releaseStream();
          setRuntimeStatus(runtime.autoRecorder ? runtime.status : 'ready');
        } else {
          shutdownRuntime();
        }
      }, 250);

      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, []);

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-3 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-300/70">Запись речей · этап 4</div>
          <div className="mt-1 text-sm font-black">Автозапись без захвата Bluetooth</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">Разрешение на микрофон даётся один раз. Во время игры микрофон открывается только на саму речь и полностью освобождается между речами, чтобы ночная музыка снова шла через обычный Bluetooth-аудиовыход.</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${testRecording || status === 'recording' ? 'bg-rose-500/15 text-rose-300' : status === 'paused' ? 'bg-amber-500/15 text-amber-300' : status === 'ready' ? 'bg-emerald-500/15 text-emerald-300' : status === 'opening' ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-800 text-slate-400'}`}>
          {testRecording ? '● тест' : status === 'recording' ? '● запись' : status === 'paused' ? 'пауза' : status === 'opening' ? 'микрофон…' : status === 'ready' ? 'автозапись готова' : 'выключено'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'off' ? (
          <button type="button" onClick={() => void enableMicrophone()} className="min-h-11 rounded-xl bg-sky-600 px-4 text-xs font-black text-white">Включить запись речей</button>
        ) : testRecording ? (
          <button type="button" onClick={stopTestRecording} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-black text-white">Остановить тест</button>
        ) : (
          <button type="button" onClick={() => void startTestRecording()} disabled={status !== 'ready'} className="min-h-11 rounded-xl bg-white px-4 text-xs font-black text-slate-950 disabled:opacity-40">Записать тест</button>
        )}
        {status !== 'off' && (
          <button type="button" onClick={disableMicrophone} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-4 text-xs font-bold text-slate-300">Выключить</button>
        )}
        {status !== 'off' && runtime.clipCount > 0 && (
          <button type="button" onClick={() => void openSpeechRecordingReview(runtime.sessionId)} className="min-h-11 rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 text-xs font-black text-emerald-200">Речи ({runtime.clipCount})</button>
        )}
      </div>

      {status !== 'off' && (
        <div className="mt-3 rounded-xl border border-emerald-500/15 bg-emerald-950/20 px-3 py-2 text-[10px] leading-4 text-emerald-100/70">
          После старта игры запись остаётся вооружена, но микрофон не удерживается постоянно. Он автоматически включится с таймером речи и освободится сразу после её окончания.
        </div>
      )}

      {error && <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-950/40 px-3 py-2 text-[11px] leading-4 text-rose-200">{error}</div>}

      {clipUrl && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>Последняя тестовая запись</span>
            <span>{formatDuration(clipDuration)}</span>
          </div>
          <audio className="w-full" controls src={clipUrl} preload="metadata" />
        </div>
      )}
    </section>
  );
}
