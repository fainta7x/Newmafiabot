import { describe, expect, it } from 'vitest';
import { normalizeFederationGame } from '../lib/gomafiaExternalGames.ts';

const row = {
  external_game_id: 'game-42',
  external_player_id: '123',
  source_url: 'https://gomafia.pro/tournaments/77',
  game_payload_json: JSON.stringify({
    tournamentName: 'Федеративный турнир', date: '2026-10-10',
    role: 'sheriff', result: 'win', score: 3.2,
  }),
};

describe('Federation game isolation', () => {
  it('exposes a distinctly sourced game with preserved source link', () => {
    expect(normalizeFederationGame(row)).toMatchObject({
      source: 'gomafia', externalGameId: 'game-42', externalPlayerId: '123',
      tournamentName: 'Федеративный турнир', role: 'sheriff', result: 'win',
      score: 3.2, date: '2026-10-10',
    });
  });
  it('refuses malformed data and forged source domains', () => {
    expect(normalizeFederationGame({ ...row, source_url: 'https://gomafia.pro.evil.com/x' })).toBeNull();
    expect(normalizeFederationGame({ ...row, game_payload_json: '{broken' })).toBeNull();
    expect(normalizeFederationGame({ ...row, external_player_id: 'not-numeric' })).toBeNull();
  });
  it('does not infer unknown score, role or results', () => {
    const parsed = normalizeFederationGame({ ...row, game_payload_json: JSON.stringify({
      tournamentName: 'X', role: 'unknown', result: 'draw', score: '12',
    }) });
    expect(parsed).toMatchObject({ role: null, result: null, score: null, date: null });
  });
});
