import { useEffect, useRef, useState } from 'react';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { buildLiveBroadcastState, mergeBroadcastDayVotes, sanitizeBroadcastReplayFrames, MAX_REPLAY_FRAMES, type LiveBroadcastDayVote, type LiveBroadcastReplayFrame } from '../../lib/liveBroadcast';
import { readStoredDeathProtocols } from '../../lib/liveDeathProtocol';
import { replayFramesKey, setItemFreeingSpace } from '../../lib/liveStorageBudget';

/**
 * What a club live game sends to the OBS overlay and keeps for the replay, moved out of `EveningLiveGameModal` unchanged
 * (architecture programme, 2026-10-26). The engine writes its session to `mafia_live_session`; these hooks read it.
 */

export type BroadcastConnection = 'idle' | 'connecting' | 'live' | 'offline';

/**
 * The replay keeps a frame when the picture changed (timer and time stamp aside) or at least every 10 s, and at most
 * `MAX_REPLAY_FRAMES` of them. Returns the new list, or null when this state adds nothing.
 */
export const appendReplayFrame = <S extends object>(existing: LiveBroadcastReplayFrame[], state: S, nowMs: number): LiveBroadcastReplayFrame[] | null => {
  const previous = existing.at(-1);
  const lastMs = previous ? Date.parse(previous.at) : 0;
  const meaningfulChange = !previous || JSON.stringify({
    ...previous.state, timerSeconds: null, updatedAt: '',
  }) !== JSON.stringify({ ...state, timerSeconds: null, updatedAt: '' });
  if (!meaningfulChange && nowMs - lastMs < 10_000) return null;
  const frame = { at: new Date(nowMs).toISOString(), state } as unknown as LiveBroadcastReplayFrame;
  return [...existing, frame].slice(-MAX_REPLAY_FRAMES);
};

/** Which seats are alive in the engine's stored session (seats 1–10); an unreadable session gives none. */
export const readAliveSeats = (raw: string | null): Record<number, boolean> => {
  const next: Record<number, boolean> = {};
  try {
    const parsed = JSON.parse(raw || '{}');
    for (const player of Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : []) {
      const slot = Number(player?.slot_num);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 10) next[slot] = player?.alive !== false;
    }
  } catch { /* none */ }
  return next;
};

/** Alive seats for the CRM identity layer, polled every 300 ms while the game runs. */
export const useLiveAliveSeats = (livePhase: string): Record<number, boolean> => {
  const [liveAlive, setLiveAlive] = useState<Record<number, boolean>>({});
  useEffect(() => {
    if (livePhase === 'setup') {
      setLiveAlive({});
      return;
    }

    let lastSignature = '';
    const syncAliveState = () => {
      try {
        const next = readAliveSeats(localStorage.getItem('mafia_live_session'));
        const signature = JSON.stringify(next);
        if (signature !== lastSignature) {
          lastSignature = signature;
          setLiveAlive(next);
        }
      } catch {}
    };

    syncAliveState();
    const intervalId = window.setInterval(syncAliveState, 300);
    return () => window.clearInterval(intervalId);
  }, [livePhase]);
  return liveAlive;
};

/**
 * Publishes the overlay state every 350 ms while the game runs (at least every 5 s when nothing changed, 2 s pause after
 * a failure) and records the replay frames on the device. `forgetReplayFrames` drops them once the protocol is saved.
 */
export const useClubLiveBroadcast = (game: ClubGameRecord, livePhase: string) => {
  const [broadcastConnection, setBroadcastConnection] = useState<BroadcastConnection>('idle');
  const replayFramesRef = useRef<LiveBroadcastReplayFrame[] | null>(null);
  const broadcastConnectionRef = useRef(broadcastConnection);

  useEffect(() => {
    broadcastConnectionRef.current = broadcastConnection;
  }, [broadcastConnection]);

  useEffect(() => {
    if (livePhase === 'setup') {
      setBroadcastConnection('idle');
      return;
    }

    let disposed = false;
    let inFlight = false;
    let lastSentSignature = '';
    let lastSuccessfulAt = 0;
    let retryAfter = 0;
    const metadata = {
      gameId: game.id,
      globalGameNumber: game.global_game_number,
      tableName: game.table_name || null,
      players: (game.club_protocol?.player_results || []).map((player) => ({
        seat: player.seat_number,
        playerId: player.player_id,
        nickname: player.display_name,
      })),
    };

    const syncBroadcast = async () => {
      if (disposed || inFlight) return;
      if (Date.now() < retryAfter) return;
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const built = buildLiveBroadcastState(JSON.parse(raw), metadata);
        if (!built) return;
        const votesKey = `mafia_live_broadcast_votes:${game.id}`;
        let storedVotes: LiveBroadcastDayVote[] = [];
        try {
          const parsed = JSON.parse(localStorage.getItem(votesKey) || '[]');
          if (Array.isArray(parsed)) storedVotes = parsed;
        } catch { /* start a fresh history */ }
        if (built.phaseKey === 'setup' || built.phaseKey === 'zero_night') storedVotes = [];
        const dayVotes = mergeBroadcastDayVotes(storedVotes, built);
        if (dayVotes !== storedVotes || !storedVotes.length) {
          try { localStorage.setItem(votesKey, JSON.stringify(dayVotes)); } catch { /* storage full: still publish */ }
        }
        const deadSeats = new Set(built.players.filter((player) => !player.alive).map((player) => player.seat));
        const protocols = Object.entries(readStoredDeathProtocols())
          .map(([seat, protocol]) => ({ seat: Number(seat), ...protocol }))
          .filter((protocol) => deadSeats.has(protocol.seat) && (protocol.red.length || protocol.black.length || protocol.sheriff.length));
        const state = { ...built, protocols, dayVotes };
        // Capture the same published OBS presentation for replay, rather than reimagining
        // the game from text events. Bound the log and only sample changed frames.
        const framesKey = replayFramesKey(game.id);
        try {
          // The frames live in memory while the game runs and are written to the device only when they changed.
          if (replayFramesRef.current === null) replayFramesRef.current = sanitizeBroadcastReplayFrames(JSON.parse(localStorage.getItem(framesKey) || '[]'));
          const next = appendReplayFrame(replayFramesRef.current, state, Date.now());
          if (next) {
            replayFramesRef.current = next;
            // Full storage must never cost the live session: the frames of other games go first, then these frames stop.
            setItemFreeingSpace(framesKey, JSON.stringify(next), game.id);
          }
        } catch { /* Do not interrupt live judging if device storage is exhausted. */ }
        const signature = JSON.stringify(state);
        const now = Date.now();
        if (signature === lastSentSignature && now - lastSuccessfulAt < 5_000) return;

        inFlight = true;
        if (broadcastConnectionRef.current === 'idle') setBroadcastConnection('connecting');
        await clubGamesApi.publishBroadcastState(game.id, state);
        if (disposed) return;
        lastSentSignature = signature;
        lastSuccessfulAt = Date.now();
        retryAfter = 0;
        setBroadcastConnection('live');
      } catch {
        retryAfter = Date.now() + 2_000;
        if (!disposed) setBroadcastConnection('offline');
      } finally {
        inFlight = false;
      }
    };

    void syncBroadcast();
    const intervalId = window.setInterval(() => void syncBroadcast(), 350);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [game, livePhase]);

  const forgetReplayFrames = () => {
    try { localStorage.removeItem(replayFramesKey(game.id)); } catch { /* ignore */ }
    replayFramesRef.current = null;
  };
  return { connection: broadcastConnection, forgetReplayFrames };
};
