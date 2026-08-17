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

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
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

const readSpeechClips = async (sessionId?: string | null): Promise<StoredSpeechClip[]> => {
  const db = await openSpeechDb();
  try {
    const clips = await new Promise<StoredSpeechClip[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = sessionId
        ? store.index('session_id').getAll(IDBKeyRange.only(sessionId))
        : store.getAll();
      request.onsuccess = () => resolve((request.result || []) as StoredSpeechClip[]);
      request.onerror = () => reject(request.error);
    });
    return clips.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  } finally {
    db.close();
  }
};

const makeElement = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const makeTextLine = (text: string, styles: Partial<CSSStyleDeclaration>) => {
  const node = makeElement('div');
  node.textContent = text;
  Object.assign(node.style, styles);
  return node;
};

export async function openSpeechRecordingReview(sessionId?: string | null) {
  if (typeof document === 'undefined' || typeof indexedDB === 'undefined') return;
  document.querySelector('[data-speech-recording-review="true"]')?.remove();

  const overlay = makeElement('div');
  overlay.dataset.speechRecordingReview = 'true';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '180',
    background: 'rgba(2,6,23,.88)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: '12px',
  });

  const panel = makeElement('div');
  Object.assign(panel.style, {
    width: 'min(100%, 560px)',
    maxHeight: '82vh',
    overflow: 'auto',
    borderRadius: '24px',
    border: '1px solid rgba(148,163,184,.2)',
    background: '#0f172a',
    color: '#f8fafc',
    boxShadow: '0 24px 80px rgba(0,0,0,.55)',
    padding: '16px',
    fontFamily: 'system-ui, sans-serif',
  });

  const header = makeElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' });
  const heading = makeElement('div');
  heading.append(
    makeTextLine('Запись речей · этап 3', { fontSize: '10px', fontWeight: '900', letterSpacing: '.14em', textTransform: 'uppercase', color: '#7dd3fc' }),
    makeTextLine('Речи этой игры', { fontSize: '18px', fontWeight: '900', marginTop: '3px' }),
    makeTextLine('Локальная копия хранится на этом устройстве; в клубной игре записи дополнительно синхронизируются с Replay.', { fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: '1.4' }),
  );
  const closeButton = makeElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  Object.assign(closeButton.style, {
    width: '38px', height: '38px', flex: '0 0 auto', borderRadius: '12px', border: '1px solid #334155',
    background: '#020617', color: '#cbd5e1', fontSize: '22px', fontWeight: '800', cursor: 'pointer',
  });
  header.append(heading, closeButton);

  const content = makeElement('div');
  content.textContent = 'Загружаю записи…';
  Object.assign(content.style, { fontSize: '12px', color: '#94a3b8' });
  panel.append(header, content);
  overlay.append(panel);
  document.body.appendChild(overlay);

  const objectUrls: string[] = [];
  const close = () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    overlay.remove();
  };
  closeButton.onclick = close;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  try {
    const clips = await readSpeechClips(sessionId);
    if (!overlay.isConnected) return;
    content.replaceChildren();

    if (!clips.length) {
      const empty = makeElement('div');
      empty.textContent = 'Сохранённых речей пока нет. Они появятся здесь после завершения первой речи.';
      Object.assign(empty.style, { padding: '18px 4px', color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' });
      content.appendChild(empty);
      return;
    }

    const summary = makeElement('div');
    const totalSeconds = clips.reduce((sum, clip) => sum + Number(clip.duration_seconds || 0), 0);
    summary.textContent = `${clips.length} ${clips.length === 1 ? 'речь' : clips.length < 5 ? 'речи' : 'речей'} · ${formatDuration(totalSeconds)} аудио`;
    Object.assign(summary.style, { marginBottom: '10px', color: '#86efac', fontSize: '11px', fontWeight: '800' });
    content.appendChild(summary);

    clips.forEach((clip, index) => {
      const card = makeElement('div');
      Object.assign(card.style, {
        border: '1px solid rgba(148,163,184,.16)', background: 'rgba(2,6,23,.55)', borderRadius: '16px',
        padding: '12px', marginBottom: '9px',
      });

      const row = makeElement('div');
      Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' });
      const title = makeElement('div');
      title.append(
        makeTextLine(`${index + 1}. #${clip.slot} · ${clip.nickname || `Игрок ${clip.slot}`}`, { fontSize: '12px', fontWeight: '900', color: '#f8fafc' }),
        makeTextLine(`${clip.speech_type || `День ${clip.round || 1}`} · круг ${clip.round || 1}`, { fontSize: '10px', color: '#94a3b8', marginTop: '3px' }),
      );
      const duration = makeElement('div');
      duration.textContent = formatDuration(Number(clip.duration_seconds || 0));
      Object.assign(duration.style, { flex: '0 0 auto', fontSize: '11px', fontWeight: '900', color: '#cbd5e1' });
      row.append(title, duration);

      const audio = makeElement('audio');
      const url = URL.createObjectURL(clip.blob);
      objectUrls.push(url);
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = url;
      audio.style.width = '100%';
      audio.style.height = '34px';
      card.append(row, audio);
      content.appendChild(card);
    });
  } catch (error) {
    console.warn('[speech-recording] Failed to open local review', error);
    if (!overlay.isConnected) return;
    content.textContent = 'Не удалось открыть локальные записи. Попробуйте закрыть окно и открыть его ещё раз.';
    Object.assign(content.style, { color: '#fda4af', fontSize: '12px', lineHeight: '1.5' });
  }
}
