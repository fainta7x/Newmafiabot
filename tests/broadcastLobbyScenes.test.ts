import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { broadcastLobbyPlayerIds, type BroadcastLobby } from '../src/server/services/broadcastLobbyService.ts';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('broadcast lobby and standings scenes', () => {
  it('keeps the existing OBS browser-source URLs unchanged', () => {
    const app = read('src/App.tsx');
    const screen = read('src/components/public/BroadcastLobbyScreen.tsx');

    expect(app).toContain("parts[2] === 'lobby' || parts[2] === 'standings'");
    expect(screen).toContain('/broadcast/<secret>/lobby');
    expect(screen).toContain('/broadcast/<secret>/standings');
    expect(screen).toContain('/api/public/broadcast/${encodeURIComponent(token)}/lobby');
  });

  it('renders both intermission views with dedicated broadcast styling and avatar fallbacks', () => {
    const screen = read('src/components/public/BroadcastLobbyScreen.tsx');
    const css = read('src/components/public/broadcastLobbyScreen.css');

    expect(screen).toContain('Подготовка к игре');
    expect(screen).toContain('Промежуточные результаты');
    expect(screen).toContain('broadcast-avatar-fallback');
    expect(screen).toContain('/avatar/${encodeURIComponent(player.player_id)}');
    expect(css).toContain('.broadcast-lineup-grid');
    expect(css).toContain('.broadcast-podium');
    expect(css).toContain('.broadcast-ranking-grid');
  });

  it('allows avatar delivery for the next lineup and tournament standings, not only the live game', () => {
    const lobby: BroadcastLobby = {
      event: { kind: 'tournament', id: 't1', title: 'Test', starts_at: null },
      next_game: {
        number: 2,
        table: null,
        seats: [
          { seat: 1, nickname: 'Seat player', player_id: 'seat-player' },
          { seat: 2, nickname: 'No profile', player_id: null },
        ],
      },
      played_games: 1,
      total_games: 10,
      standings: [
        { place: 1, nickname: 'Leader', points: 3.2, player_id: 'leader' },
        { place: 2, nickname: 'Seat player', points: 2.7, player_id: 'seat-player' },
      ],
    };

    expect([...broadcastLobbyPlayerIds(lobby)].sort()).toEqual(['leader', 'seat-player']);

    const routes = read('src/server/routes/liveBroadcastRoutes.ts');
    expect(routes).toContain('getIntermissionAvatarPlayerIds');
    expect(routes).toContain('intermissionPlayers?.has(playerId)');
  });

  it('includes canonical player ids in standings so standings avatars can resolve', () => {
    const service = read('src/server/services/broadcastLobbyService.ts');
    expect(service).toContain('SELECT id, player_id FROM tournament_participants WHERE tournament_id = ?');
    expect(service).toContain("playerIdByParticipant.get(String(row.participant_id)) || null");
  });
});
