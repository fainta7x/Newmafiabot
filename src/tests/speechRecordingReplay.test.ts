import { describe, expect, it } from 'vitest';
import { clipDto, protocolHasPlayer } from '../server/routes/speechRecordingRoutes.ts';

describe('speech recording replay helpers', () => {
  it('recognizes a completed protocol participant by player or participant id', () => {
    const payload = {
      player_results: [
        { player_id: 'player-1', participant_id: 'participant-1' },
        { player_id: 'player-2', participant_id: 'participant-2' },
      ],
    };

    expect(protocolHasPlayer(payload, 'player-1')).toBe(true);
    expect(protocolHasPlayer(payload, 'participant-2')).toBe(true);
    expect(protocolHasPlayer(payload, 'outsider')).toBe(false);
  });

  it('returns the mounted player speech API path for replay audio', () => {
    const clip = clipDto({
      id: 'clip/with spaces',
      game_id: 42,
      seat_number: 3,
      speaker_nickname: 'Игрок',
      round_number: 2,
      speech_type: 'Речь',
      started_at: '2026-08-15T12:00:00.000Z',
      duration_seconds: 59,
      mime_type: 'audio/webm',
      byte_size: 1234,
    });

    expect(clip.audio_url).toBe('/api/player/speech-recordings/club-games/42/clips/clip%2Fwith%20spaces/audio');
  });
});
