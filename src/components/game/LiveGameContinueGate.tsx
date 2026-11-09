import React, { useEffect, useState } from 'react';
import type { GameKey } from '../../shared/game.ts';
import { liveGameCheckpointApi, readDeviceSession, writeLiveGameCheckpoint, type LiveGameCheckpointPayload } from '../../lib/liveGameCheckpoint.ts';
import { markAutoRestore } from '../../lib/liveGameResume.ts';

/**
 * «Продолжить игру» (owner, 2026-11-03) for ANY game: when this device has no saved session of the game but the server
 * has a copy (the judge changed device or the browser lost its storage), offer to continue it; the engine then restores
 * the copy exactly as it restores its own saved session. The same gate wraps every live-game window.
 */
const CHECKPOINT_WAIT_MS = 2000;

export function LiveGameContinueGate({ gameKey, enabled, children }: { gameKey: GameKey; enabled: boolean; children: React.ReactNode }) {
  const [stage, setStage] = useState<'checking' | 'offer' | 'ready'>(() => (!enabled || readDeviceSession(gameKey) ? 'ready' : 'checking'));
  const [checkpoint, setCheckpoint] = useState<(LiveGameCheckpointPayload & { saved_at: string }) | null>(null);
  useEffect(() => {
    if (stage !== 'checking') return;
    let active = true;
    // A slow or absent server must not hold the start of a game: after this the engine opens, the offer is dropped (owner, 2026-11-09).
    const timer = setTimeout(() => { if (active) { active = false; setStage('ready'); } }, CHECKPOINT_WAIT_MS);
    liveGameCheckpointApi.load(gameKey)
      .then((copy) => {
        if (!active) return;
        // Only a real copy is offered: an empty or foreign answer starts the game as usual.
        if (!copy || typeof copy.session !== 'string' || !copy.session) { setStage('ready'); return; }
        setCheckpoint(copy); setStage('offer');
      })
      .catch(() => { if (active) setStage('ready'); });
    return () => { active = false; clearTimeout(timer); };
  }, [stage, gameKey]);

  if (stage === 'ready') return <>{children}</>;
  const savedAt = checkpoint?.saved_at
    ? new Date(checkpoint.saved_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
    : null;
  const continueGame = () => {
    if (!checkpoint) return;
    try { writeLiveGameCheckpoint(gameKey, checkpoint); markAutoRestore(); } catch { /* storage full: start as usual */ }
    setStage('ready');
  };
  return (
    <div data-testid="live-checkpoint-offer" className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950 p-4">
      {stage === 'checking' ? <p className="text-sm text-white/60">Загружаем игру…</p> : (
        <div className="w-full max-w-sm space-y-4 rounded-[20px] border border-amber-200/15 bg-amber-200/[0.06] p-5 text-white">
          <p className="text-sm leading-6 text-amber-50/80">Найдена незавершённая игра{savedAt ? ` · ${savedAt}` : ''}</p>
          <div className="grid gap-2">
            <button type="button" data-testid="live-checkpoint-continue" onClick={continueGame} className="min-h-12 rounded-xl bg-white px-4 text-sm font-semibold text-[#090a0d]">Продолжить игру</button>
            <button type="button" data-testid="live-checkpoint-discard" onClick={() => setStage('ready')} className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/60">Сбросить</button>
          </div>
        </div>
      )}
    </div>
  );
}
