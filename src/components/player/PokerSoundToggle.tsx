import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { pokerSoundCues, pokerSoundState, type PokerSoundCue, type PokerSoundState } from '../../lib/pokerSound.ts';
import { playPokerCue } from '../../lib/pokerSoundEngine.ts';

const SOUND_KEY = '2la-poker-sound-enabled';
let context: AudioContext | null = null;

// Cues are built in pokerSoundEngine.ts from filtered noise and short struck-object tones: no downloaded samples, nothing to license.
// Web Audio starts only after a user's tap (see the unlock effect below).
const getContext = () => {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || (window as any).webkitAudioContext;
  if (!Audio) return null;
  try { context ||= new Audio(); return context; } catch { return null; }
};

const play = (cue: PokerSoundCue) => {
  const ctx = context;
  if (!ctx || ctx.state !== 'running') return;
  try { playPokerCue(ctx, cue); } catch { /* sound may be unsupported; poker must work regardless */ }
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
