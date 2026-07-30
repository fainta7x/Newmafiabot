import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { defaultRecognitionAdapter } from '../server/services/recognition/adapter.ts';
import { RecognitionProvider } from '../server/services/recognition/types.ts';

describe('Game Protocol Import (Бланк игры)', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;
  let gameId1: string;
  let gameId2: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);

    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    // Insert 10 players in DB
    const playerIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const pid = `player-proto-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'normal', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
      playerIds.push(pid);
    }

    // Create test tournament with 10 participants
    const tourRes = await supertest(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый Турнир Протокола',
        date: new Date().toISOString(),
        venue: 'Зал А',
        participants: playerIds.map((id, idx) => ({
          player_id: id,
          display_name: `Игрок ${idx + 1}`,
        })),
      });

    tournamentId = tourRes.body.id;

    // Generate seating (creates 10 games)
    const seatingRes = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    gameId1 = seatingRes.body.games[0].id;
    gameId2 = seatingRes.body.games[1].id;
  });

  it('1. Rejects file size over 15MB', async () => {
    // Create dummy buffer > 15MB
    const largeBuffer = Buffer.alloc(16 * 1024 * 1024);

    const res = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports`)
      .set('Cookie', organizerCookie)
      .attach('image', largeBuffer, 'large_blank.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Размер файла превышает');
  });

  it('2. Rejects unsupported MIME type / extension', async () => {
    const textBuffer = Buffer.from('hello world');

    const res = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports`)
      .set('Cookie', organizerCookie)
      .attach('image', textBuffer, 'scoresheet.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Поддерживаются только форматы');
  });

  it('3. Handles missing GEMINI_API_KEY gracefully', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const dummyImage = Buffer.from('fake-jpeg-data');

    const res = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports`)
      .set('Cookie', organizerCookie)
      .attach('image', dummyImage, 'blank.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Распознавание фотографий ещё не настроено');

    process.env.GEMINI_API_KEY = originalKey;
  });

  it('4. Successfully processes recognition for single game and creates DB import record', async () => {
    // Mock recognition provider
    const mockProvider: RecognitionProvider = {
      async recognizeScoresheet() {
        return {
          detected_games: [
            {
              game_number: 1,
              game_number_confidence: 0.95,
              winner_team: { value: 'red', confidence: 0.9 },
              players: Array.from({ length: 10 }, (_, i) => ({
                seat_number: i + 1,
                written_name: `Игрок ${i + 1}`,
                role: { value: i === 0 ? 'sheriff' : i < 4 ? 'mafia' : 'citizen', confidence: 0.9 },
                regular_fouls: { value: 1, confidence: 0.85 },
                technical_fouls: { value: 0, confidence: 0.9 },
                judge_bonus: { value: 0.2, confidence: 0.8 },
                protocol_bonus: { value: 0, confidence: 0.5 },
                penalty_points: { value: 0, confidence: 0.8 },
              })),
              best_move: { recipient_seat: 1, seat_numbers: [2, 3, 4], confidence: 0.85 },
              shots: [{ night_number: 1, seat_number: 1, result: 'killed', confidence: 0.9 }],
              votes: [],
              color_protocols: [],
              judge_name: { value: 'Судья А', confidence: 0.95 },
              warnings: [],
            },
          ],
        };
      },
    };

    defaultRecognitionAdapter.setProvider(mockProvider);

    const dummyImage = Buffer.from('mock-jpeg-image-bytes');

    const res = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports`)
      .set('Cookie', organizerCookie)
      .attach('image', dummyImage, 'single_blank.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.import_id).toBeDefined();
    expect(res.body.status).toBe('review');
    expect(res.body.detected_games.length).toBe(1);

    // Verify DB record created
    const importRecord = await db.get(
      'SELECT * FROM tournament_protocol_imports WHERE id = ?',
      [res.body.import_id]
    );
    expect(importRecord).toBeDefined();
    expect(importRecord.status).toBe('review');
    expect(importRecord.tournament_id).toBe(tournamentId);
  });

  it('5. Supports multi-game recognition on single photo', async () => {
    const mockMultiProvider: RecognitionProvider = {
      async recognizeScoresheet() {
        return {
          detected_games: [
            {
              game_number: 1,
              game_number_confidence: 0.95,
              winner_team: { value: 'red', confidence: 0.9 },
              players: Array.from({ length: 10 }, (_, i) => ({
                seat_number: i + 1,
                written_name: `Игрок ${i + 1}`,
                role: { value: 'citizen', confidence: 0.9 },
                regular_fouls: { value: 0, confidence: 0.9 },
                technical_fouls: { value: 0, confidence: 0.9 },
                judge_bonus: { value: 0, confidence: 0.9 },
                protocol_bonus: { value: 0, confidence: 0.9 },
                penalty_points: { value: 0, confidence: 0.9 },
              })),
              best_move: null,
              shots: [],
              votes: [],
              color_protocols: [],
              judge_name: { value: null, confidence: 0 },
              warnings: [],
            },
            {
              game_number: 2,
              game_number_confidence: 0.92,
              winner_team: { value: 'black', confidence: 0.88 },
              players: Array.from({ length: 10 }, (_, i) => ({
                seat_number: i + 1,
                written_name: `Игрок ${i + 1}`,
                role: { value: 'citizen', confidence: 0.9 },
                regular_fouls: { value: 0, confidence: 0.9 },
                technical_fouls: { value: 0, confidence: 0.9 },
                judge_bonus: { value: 0, confidence: 0.9 },
                protocol_bonus: { value: 0, confidence: 0.9 },
                penalty_points: { value: 0, confidence: 0.9 },
              })),
              best_move: null,
              shots: [],
              votes: [],
              color_protocols: [],
              judge_name: { value: null, confidence: 0 },
              warnings: [],
            },
          ],
        };
      },
    };

    defaultRecognitionAdapter.setProvider(mockMultiProvider);

    const dummyImage = Buffer.from('mock-multi-game-image');
    const res = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports`)
      .set('Cookie', organizerCookie)
      .attach('image', dummyImage, 'multi_blank.jpg');

    expect(res.status).toBe(200);
    expect(res.body.detected_games.length).toBe(2);

    // Apply both games in batch
    const applyRes = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports/${res.body.import_id}/apply`)
      .set('Cookie', organizerCookie)
      .send({
        game_mappings: [
          {
            detected_game_index: 0,
            target_game_id: gameId1,
            action: 'apply',
            draft_data: res.body.detected_games[0],
          },
          {
            detected_game_index: 1,
            target_game_id: gameId2,
            action: 'apply',
            draft_data: res.body.detected_games[1],
          },
        ],
      });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body.applied_count).toBe(2);
  });

  it('6. Validates best move seat numbers (fails if duplicate seats)', async () => {
    await db.run(
      `INSERT INTO tournament_protocol_imports (id, tournament_id, uploaded_by, original_filename, mime_type, storage_path, status, created_at, updated_at)
       VALUES ('imp-dup-test', ?, 'admin', 'test.jpg', 'image/jpeg', '/tmp/test.jpg', 'review', datetime('now'), datetime('now'))`,
      [tournamentId]
    );

    const invalidDraft = {
      game_number: 1,
      game_number_confidence: 0.9,
      winner_team: { value: 'red', confidence: 0.9 },
      players: Array.from({ length: 10 }, (_, i) => ({
        seat_number: i + 1,
        written_name: `Player ${i + 1}`,
        role: { value: 'citizen', confidence: 0.9 },
        regular_fouls: { value: 0, confidence: 0.9 },
        technical_fouls: { value: 0, confidence: 0.9 },
        judge_bonus: { value: 0, confidence: 0.9 },
        protocol_bonus: { value: 0, confidence: 0.9 },
        penalty_points: { value: 0, confidence: 0.9 },
      })),
      best_move: { recipient_seat: 1, seat_numbers: [2, 2, 3], confidence: 0.8 }, // Duplicate seat #2!
      shots: [],
      votes: [],
      color_protocols: [],
      judge_name: { value: null, confidence: 0 },
      warnings: [],
    };

    const applyRes = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports/imp-dup-test/apply`)
      .set('Cookie', organizerCookie)
      .send({
        game_mappings: [
          {
            detected_game_index: 0,
            target_game_id: gameId1,
            action: 'apply',
            draft_data: invalidDraft,
          },
        ],
      });

    expect(applyRes.body.success).toBe(false);
    expect(applyRes.body.errors[0]).toContain('повторяться');
  });

  it('7. Applies recognized draft to tournament game without completing game', async () => {
    const importId = 'imp-apply-valid';
    await db.run(
      `INSERT INTO tournament_protocol_imports (id, tournament_id, uploaded_by, original_filename, mime_type, storage_path, status, created_at, updated_at)
       VALUES (?, ?, 'admin', 'test.jpg', 'image/jpeg', '/tmp/test.jpg', 'review', datetime('now'), datetime('now'))`,
      [importId, tournamentId]
    );

    const validDraft = {
      game_number: 1,
      game_number_confidence: 0.95,
      winner_team: { value: 'red', confidence: 0.9 },
      players: Array.from({ length: 10 }, (_, i) => ({
        seat_number: i + 1,
        written_name: `Игрок ${i + 1}`,
        role: { value: i === 0 ? 'sheriff' : 'citizen', confidence: 0.9 },
        regular_fouls: { value: 1, confidence: 0.9 },
        technical_fouls: { value: 0, confidence: 0.9 },
        judge_bonus: { value: 0.2, confidence: 0.9 },
        protocol_bonus: { value: 0, confidence: 0.9 },
        penalty_points: { value: 0, confidence: 0.9 },
      })),
      best_move: { recipient_seat: 1, seat_numbers: [2, 3, 4], confidence: 0.9 },
      shots: [],
      votes: [],
      color_protocols: [],
      judge_name: { value: 'Главный Судья', confidence: 0.9 },
      warnings: [],
    };

    const applyRes = await supertest(app)
      .post(`/api/tournaments/${tournamentId}/protocol-imports/${importId}/apply`)
      .set('Cookie', organizerCookie)
      .send({
        game_mappings: [
          {
            detected_game_index: 0,
            target_game_id: gameId1,
            action: 'apply',
            draft_data: validDraft,
          },
        ],
      });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body.success).toBe(true);
    expect(applyRes.body.applied_count).toBe(1);

    // Verify game status remains 'planned' (NOT completed)
    const targetGame = await db.get('SELECT * FROM tournament_games WHERE id = ?', [gameId1]);
    expect(targetGame.status).toBe('planned');
    expect(targetGame.draft_protocol_json).toBeDefined();
    expect(targetGame.winner_team).toBe('red');
    expect(targetGame.judge_name).toBe('Главный Судья');
  });

  it('8. Serves saved protocol import image securely to authenticated organizers', async () => {
    const mockFileDir = path.join(process.cwd(), 'uploads', 'protocol_imports');
    if (!fs.existsSync(mockFileDir)) fs.mkdirSync(mockFileDir, { recursive: true });

    const mockFilePath = path.join(mockFileDir, 'test_secure_image.jpg');
    fs.writeFileSync(mockFilePath, Buffer.from('mock-image-content'));

    const importId = 'imp-img-secure-test';
    await db.run(
      `INSERT INTO tournament_protocol_imports (id, tournament_id, uploaded_by, original_filename, mime_type, storage_path, status, created_at, updated_at)
       VALUES (?, ?, 'admin', 'test.jpg', 'image/jpeg', ?, 'review', datetime('now'), datetime('now'))`,
      [importId, tournamentId, mockFilePath]
    );

    // Unauthenticated request -> 401
    const unauthRes = await supertest(app).get(`/api/tournaments/${tournamentId}/protocol-imports/${importId}/image`);
    expect(unauthRes.status).toBe(401);

    // Authenticated request -> 200 image stream
    const authRes = await supertest(app)
      .get(`/api/tournaments/${tournamentId}/protocol-imports/${importId}/image`)
      .set('Cookie', organizerCookie);

    expect(authRes.status).toBe(200);
    expect(authRes.headers['content-type']).toContain('image/jpeg');
  });
});
