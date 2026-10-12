import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { pokerSoundCues, pokerSoundState, type PokerSoundCue, type PokerSoundState } from '../../lib/pokerSound.ts';

const SOUND_KEY = '2la-poker-sound-enabled';
let context: AudioContext | null = null;
/** The first version was so quiet that a phone speaker played nothing audible; the cues stay short, just clearer. */
const LOUDNESS = 1.8;

// No downloaded samples, licensing dependency, external request or game-server change.
// Web Audio starts only after a user's explicit click. All cues are deliberately quiet.
const getContext = () => {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || (window as any).webkitAudioContext;
  if (!Audio) return null;
  try { context ||= new Audio(); return context; } catch { return null; }
};

const note = (ctx: AudioContext, start: number, hz: number, duration: number, volume: number, type: OscillatorType = 'sine') => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(hz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume * LOUDNESS, start + 0.007);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
};

const softCard = (ctx: AudioContext, start: number) => {
  const samples = Math.floor(ctx.sampleRate * 0.065);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 850;
  const gain = ctx.createGain();
  gain.gain.value = 0.065 * LOUDNESS;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
};

const play = (cue: PokerSoundCue) => {
  const ctx = context;
  if (!ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + 0.008;
  try {
    switch (cue) {
      case 'deal':
        softCard(ctx, at);
        softCard(ctx, at + 0.1);
        break;
      case 'board':
        softCard(ctx, at);
        note(ctx, at + 0.07, 330, 0.065, 0.035);
        break;
      case 'chips':
        note(ctx, at, 830, 0.055, 0.042, 'triangle');
        note(ctx, at + 0.05, 690, 0.075, 0.03, 'triangle');
        break;
      case 'turn':
        note(ctx, at, 523, 0.13, 0.06);
        note(ctx, at + 0.075, 659, 0.18, 0.042);
        break;
      case 'timer':
        note(ctx, at, 420, 0.07, 0.046, 'triangle');
        note(ctx, at + 0.115, 420, 0.07, 0.046, 'triangle');
        break;
      case 'win':
        note(ctx, at, 392, 0.13, 0.055);
        note(ctx, at + 0.13, 523, 0.2, 0.045);
        break;
    }
  } catch { /* sound may be unsupported; poker must work regardless */ }
};

/** Kept on the parent Poker screen: a waiting table and the first dealt hand share
 * the same transition memory, despite rendering different table layouts.
 */
export function usePokerSoundEffects(tableId: string | null, hand: any) {
  // On unless the player switched it off: the cues are short and quiet, and a silent table looked like «no sounds at all» (owner, 2026-10-12).
  const [enabled, setEnabled] = useState(() => {
    try { return window.localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const previous = useRef<PokerSoundState | null>(null);
  useEffect(() => {
    const next = pokerSoundState(tableId, hand);
    const cues = pokerSoundCues(previous.current, next);
    previous.current = next;
    if (enabled && document.visibilityState === 'visible') cues.forEach(play);
  }, [tableId, hand, enabled]);

  // A browser lets sound start only after a tap: unlock the audio engine on the first touch of the table, so a remembered «on»
  // works after a reload without the player having to press the speaker again.
  useEffect(() => {
    if (!enabled) return undefined;
    const unlock = () => { const ctx = getContext(); if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {}); };
    unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [enabled]);

  useEffect(() => {
    const onVisibility = () => {
      // Never play a hand or a timer that elapsed while the Telegram mini app was backgrounded.
      if (document.visibilityState === 'hidden') previous.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try { window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
    if (next) {
      const ctx = getContext();
      if (ctx) void ctx.resume().then(() => play('turn')).catch(() => {});
    }
  };
  return { enabled, toggle };
}

export default function PokerSoundToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return <button type="button" data-testid="poker-sound-toggle" aria-label={enabled ? 'Выключить звуки покера' : 'Включить звуки покера'}
    title={enabled ? 'Звуки покера включены' : 'Звуки покера выключены'} aria-pressed={enabled}
    onClick={onToggle} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${enabled ? 'border-amber-200/35 bg-amber-200/10 text-amber-100' : 'border-white/10 bg-white/[.06] text-white/45'}`}>
    {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
  </button>;
}
