import { useCallback, useEffect, useRef, useState } from 'react';

export type JudgeMusicTrack = {
  id: string;
  title: string;
  mime_type: string;
  byte_size: number;
  sort_order: number;
  created_at?: string | null;
  audio_url: string;
};

type JudgeMusicPayload = {
  limit: number;
  max_track_bytes: number;
  tracks: JudgeMusicTrack[];
};

const TARGET_VOLUME = 0.85;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 1300;
const FADE_TICK_MS = 50;

export async function loadJudgeMusicPlaylist(): Promise<JudgeMusicPayload | null> {
  const response = await fetch('/api/player/judge-music', { credentials: 'include' });
  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить плейлист');
  return {
    limit: Number(body?.limit || 10),
    max_track_bytes: Number(body?.max_track_bytes || 8 * 1024 * 1024),
    tracks: Array.isArray(body?.tracks) ? body.tracks : [],
  };
}

export function useJudgeGameMusic() {
  const [tracks, setTracks] = useState<JudgeMusicTrack[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const tracksRef = useRef<JudgeMusicTrack[]>([]);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTokenRef = useRef(0);
  const fadingOutRef = useRef(false);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const reload = useCallback(async () => {
    try {
      const payload = await loadJudgeMusicPlaylist();
      setTracks(payload?.tracks || []);
    } catch {
      setTracks([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const cancelFade = useCallback(() => {
    fadeTokenRef.current += 1;
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    fadeTimerRef.current = null;
    fadingOutRef.current = false;
  }, []);

  const fadeTo = useCallback((target: number, durationMs: number, onDone?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    const token = ++fadeTokenRef.current;
    const from = audio.volume;
    const startedAt = Date.now();
    fadeTimerRef.current = setInterval(() => {
      if (token !== fadeTokenRef.current || !audioRef.current) {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / Math.max(1, durationMs));
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
      if (progress < 1) return;
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
      onDone?.();
    }, FADE_TICK_MS);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('error', () => setPlaying(false));
    audioRef.current = audio;
    return () => {
      cancelFade();
      audio.pause();
      audio.onended = null;
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [cancelFade]);

  const chooseTrack = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const alternatives = list.filter((track) => track.id !== currentTrackIdRef.current);
    return alternatives[Math.floor(Math.random() * alternatives.length)] || list[0];
  }, []);

  const start = useCallback(async (trackId?: string) => {
    const audio = audioRef.current;
    if (!audio) return false;
    const list = tracksRef.current;
    if (!list.length) {
      setPlaying(false);
      return false;
    }

    const explicitTrack = trackId ? list.find((track) => track.id === trackId) || null : null;
    const track = explicitTrack || (trackId ? null : chooseTrack());
    if (!track) return false;

    const sameTrack = currentTrackIdRef.current === track.id && Boolean(audio.src);
    if (sameTrack && !audio.paused && !fadingOutRef.current) return true;
    cancelFade();
    if (!sameTrack) {
      audio.pause();
      currentTrackIdRef.current = track.id;
      audio.src = track.audio_url;
      audio.currentTime = 0;
      audio.volume = 0;
    }

    if (trackId) {
      audio.loop = true;
      audio.onended = null;
    } else {
      audio.loop = false;
      audio.onended = () => {
        const next = chooseTrack();
        if (!next || !audioRef.current) return;
        currentTrackIdRef.current = next.id;
        audioRef.current.src = next.audio_url;
        audioRef.current.currentTime = 0;
        audioRef.current.volume = TARGET_VOLUME;
        void audioRef.current.play().catch(() => setBlocked(true));
      };
    }

    try {
      if (audio.paused) await audio.play();
      setBlocked(false);
      fadeTo(TARGET_VOLUME, FADE_IN_MS);
      return true;
    } catch {
      setBlocked(true);
      setPlaying(false);
      return false;
    }
  }, [cancelFade, chooseTrack, fadeTo]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadingOutRef.current) return;

    if (audio.paused || !audio.src) {
      cancelFade();
      audio.onended = null;
      audio.removeAttribute('src');
      audio.load();
      currentTrackIdRef.current = null;
      setBlocked(false);
      setPlaying(false);
      return;
    }

    fadingOutRef.current = true;
    fadeTo(0, FADE_OUT_MS, () => {
      const current = audioRef.current;
      if (!current) return;
      current.pause();
      current.onended = null;
      current.loop = false;
      current.removeAttribute('src');
      current.load();
      currentTrackIdRef.current = null;
      fadingOutRef.current = false;
      setBlocked(false);
      setPlaying(false);
    });
  }, [cancelFade, fadeTo]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelFade();
    audio.volume = Math.max(0, Math.min(1, value));
  }, [cancelFade]);

  return {
    tracks,
    ready,
    playing,
    blocked,
    reload,
    start,
    stop,
    setVolume,
  };
}
