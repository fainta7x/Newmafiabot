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

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.85;
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('error', () => setPlaying(false));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const chooseTrack = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const alternatives = list.filter((track) => track.id !== currentTrackIdRef.current);
    return alternatives[Math.floor(Math.random() * alternatives.length)] || list[0];
  }, []);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    if (!tracksRef.current.length) {
      setPlaying(false);
      return false;
    }
    if (!audio.paused && audio.src) return true;

    const track = chooseTrack();
    if (!track) return false;
    currentTrackIdRef.current = track.id;
    audio.src = track.audio_url;
    audio.currentTime = 0;
    audio.onended = () => {
      const next = chooseTrack();
      if (!next || !audioRef.current) return;
      currentTrackIdRef.current = next.id;
      audioRef.current.src = next.audio_url;
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setBlocked(true));
    };
    try {
      await audio.play();
      setBlocked(false);
      return true;
    } catch {
      setBlocked(true);
      setPlaying(false);
      return false;
    }
  }, [chooseTrack]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.onended = null;
    audio.removeAttribute('src');
    audio.load();
    currentTrackIdRef.current = null;
    setBlocked(false);
    setPlaying(false);
  }, []);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, value));
  }, []);

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
