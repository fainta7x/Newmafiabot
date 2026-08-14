import { useEffect, useRef, useState } from 'react';

type RecorderStatus = 'off' | 'ready' | 'recording';

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

export default function SpeechRecordingPilot() {
  const [status, setStatus] = useState<RecorderStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipDuration, setClipDuration] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const clipUrlRef = useRef<string | null>(null);

  const replaceClipUrl = (next: string | null) => {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = next;
    setClipUrl(next);
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const enableMicrophone = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Этот браузер не даёт приложению доступ к микрофону.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Запись звука не поддерживается этим браузером.');
      return;
    }

    try {
      stopTracks();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setStatus('ready');
    } catch (permissionError: any) {
      const denied = permissionError?.name === 'NotAllowedError' || permissionError?.name === 'PermissionDeniedError';
      setError(denied ? 'Доступ к микрофону запрещён. Разрешите его для приложения и попробуйте ещё раз.' : 'Не удалось открыть микрофон на этом устройстве.');
      setStatus('off');
    }
  };

  const startTestRecording = () => {
    const stream = streamRef.current;
    if (!stream || status !== 'ready') return;
    setError(null);
    replaceClipUrl(null);
    setClipDuration(0);
    chunksRef.current = [];

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
        startedAtRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 0) replaceClipUrl(URL.createObjectURL(blob));
        setClipDuration(duration);
        setStatus(streamRef.current ? 'ready' : 'off');
      };
      recorder.start(250);
      setStatus('recording');
    } catch {
      recorderRef.current = null;
      setError('Не удалось начать запись. Попробуйте выключить и снова включить микрофон.');
      setStatus('ready');
    }
  };

  const stopTestRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    recorderRef.current = null;
  };

  const disableMicrophone = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    stopTracks();
    setStatus('off');
  };

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    stopTracks();
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
  }, []);

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-3 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-300/70">Запись речей · этап 1</div>
          <div className="mt-1 text-sm font-black">Проверка микрофона перед игрой</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">Пока запись остаётся только на этом устройстве и никуда не отправляется.</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${status === 'recording' ? 'bg-rose-500/15 text-rose-300' : status === 'ready' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
          {status === 'recording' ? '● запись' : status === 'ready' ? 'микрофон готов' : 'выключено'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'off' ? (
          <button type="button" onClick={() => void enableMicrophone()} className="min-h-11 rounded-xl bg-sky-600 px-4 text-xs font-black text-white">Включить микрофон</button>
        ) : status === 'recording' ? (
          <button type="button" onClick={stopTestRecording} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-black text-white">Остановить тест</button>
        ) : (
          <button type="button" onClick={startTestRecording} className="min-h-11 rounded-xl bg-white px-4 text-xs font-black text-slate-950">Записать тестовую речь</button>
        )}
        {status !== 'off' && (
          <button type="button" onClick={disableMicrophone} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-4 text-xs font-bold text-slate-300">Выключить</button>
        )}
      </div>

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
