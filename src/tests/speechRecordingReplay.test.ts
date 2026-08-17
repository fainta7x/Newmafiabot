import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSpeechClipUploadUrl,
  resolveActiveClubGameId,
} from '../components/LiveGameEngine/SpeechRecordingServerSync.ts';
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

  it('resolves only the club game snapshot that matches the active legacy session', () => {
    const entries = new Map<string, string>([
      ['mafia_live_session', '{"phase":"day_speeches","roundNumber":2}'],
      ['mafia_live_session:club:17', '{"phase":"setup","roundNumber":1}'],
      ['mafia_live_session:club:42', '{"phase":"day_speeches","roundNumber":2}'],
      ['mafia_live_session:club:42:protocol', '{"votes":[]}'],
    ]);
    const keys = [...entries.keys()];
    const storage = {
      length: keys.length,
      key: (index: number) => keys[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
    };

    expect(resolveActiveClubGameId(storage)).toBe(42);
  });

  it('does not bind a recording when no club-scoped live snapshot matches', () => {
    const entries = new Map<string, string>([
      ['mafia_live_session', '{"phase":"day_speeches"}'],
      ['mafia_live_session:club:17', '{"phase":"setup"}'],
    ]);
    const keys = [...entries.keys()];
    const storage = {
      length: keys.length,
      key: (index: number) => keys[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
    };

    expect(resolveActiveClubGameId(storage)).toBeNull();
  });

  it('builds the raw-audio upload endpoint with all recording metadata', () => {
    const uploadUrl = buildSpeechClipUploadUrl(42, {
      id: 'clip/1',
      session_id: 'session 1',
      slot: 3,
      round: 2,
      duration_seconds: 58.4,
      nickname: 'Игрок №3',
      speech_type: 'День 2',
      started_at: '2026-08-17T12:00:00.000Z',
    });
    const parsed = new URL(uploadUrl, 'https://example.test');

    expect(parsed.pathname).toBe('/api/player/speech-recordings/club-games/42/clips');
    expect(parsed.searchParams.get('clip_id')).toBe('clip/1');
    expect(parsed.searchParams.get('session_id')).toBe('session 1');
    expect(parsed.searchParams.get('seat_number')).toBe('3');
    expect(parsed.searchParams.get('round_number')).toBe('2');
    expect(parsed.searchParams.get('speaker_nickname')).toBe('Игрок №3');
  });

  it('mounts the speech recording router at the path used by Replay', () => {
    const source = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
    expect(source).toContain("import playerSpeechRecordingRoutes from './server/routes/playerSpeechRecordingRoutes.ts';");
    expect(source).toContain("app.use('/api/player/speech-recordings', playerSpeechRecordingRoutes);");
  });
});