import { DatabaseWrapper } from './index.ts';

export async function seedDemoData(db: DatabaseWrapper): Promise<void> {
  // Only seed if SEED_DEMO_DATA is explicitly true
  if (process.env.SEED_DEMO_DATA !== 'true') {
    return;
  }

  // To run only on an empty database (or if no players and tournaments exist)
  const playersCountRes = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
  const tournamentsCountRes = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

  const playersCount = playersCountRes?.count || 0;
  const tournamentsCount = tournamentsCountRes?.count || 0;

  if (playersCount > 0 || tournamentsCount > 0) {
    // Database is not empty, do not run the seed to avoid altering any existing user data
    return;
  }

  console.log('[SEED] Seeding demo data: 10 test players and one completed "Test Tournament"...');

  const now = new Date().toISOString();

  // 10 test players with fixed, stable IDs to be fully idempotent
  const testPlayers = [
    { id: 'p-test-1', nickname: 'Тест Иван', full_name: 'Иван Тестовый', contact_status: 'normal' },
    { id: 'p-test-2', nickname: 'Тест Мария', full_name: 'Мария Тестовая', contact_status: 'normal' },
    { id: 'p-test-3', nickname: 'Тест Алексей', full_name: 'Алексей Тестовый', contact_status: 'normal' },
    { id: 'p-test-4', nickname: 'Тест Ольга', full_name: 'Ольга Тестовая', contact_status: 'normal' },
    { id: 'p-test-5', nickname: 'Тест Дмитрий', full_name: 'Дмитрий Тестовый', contact_status: 'normal' },
    { id: 'p-test-6', nickname: 'Тест Елена', full_name: 'Елена Тестовая', contact_status: 'normal' },
    { id: 'p-test-7', nickname: 'Тест Сергей', full_name: 'Сергей Тестовый', contact_status: 'normal' },
    { id: 'p-test-8', nickname: 'Тест Анна', full_name: 'Анна Тестовая', contact_status: 'normal' },
    { id: 'p-test-9', nickname: 'Тест Петр', full_name: 'Петр Тестовый', contact_status: 'normal' },
    { id: 'p-test-10', nickname: 'Тест Наталья', full_name: 'Наталья Тестовая', contact_status: 'normal' },
  ];

  await db.transaction(async (tx) => {
    // 1. Insert Players
    for (const p of testPlayers) {
      const existing = await tx.get('SELECT id FROM players WHERE id = ? OR nickname = ?', [p.id, p.nickname]);
      if (!existing) {
        await tx.run(
          `INSERT INTO players (id, nickname, full_name, contact_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [p.id, p.nickname, p.full_name, p.contact_status, now, now]
        );
      }
    }

    // 2. Insert Tournament
    const tournamentId = 't-test-1';
    const existingTournament = await tx.get('SELECT id FROM tournaments WHERE id = ? OR title = ?', [tournamentId, 'Тестовый турнир']);
    if (!existingTournament) {
      await tx.run(
        `INSERT INTO tournaments (id, title, date, venue, stage, status, chief_judge_name, notes, public_token, results_published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, 'test_tournament_token', ?, ?, ?)`,
        [
          tournamentId,
          'Тестовый турнир',
          now,
          'Клуб Мафия',
          'Финал',
          'Главный Судья',
          'Тестовый демонстрационный турнир для проверки турнирного модуля и публичных результатов.',
          now,
          now,
          now,
        ]
      );

      // 3. Insert Tournament Participants
      for (let i = 0; i < testPlayers.length; i++) {
        const p = testPlayers[i];
        await tx.run(
          `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number)
           VALUES (?, ?, ?, ?, ?)`,
          [`tp-${p.id}`, tournamentId, p.id, p.nickname, i + 1]
        );
      }

      // 4. Generate 10 games
      // Game 1 will be 'completed', Games 2-10 will be 'planned'
      const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
      for (let gNum = 1; gNum <= 10; gNum++) {
        const gameId = `g-test-${gNum}`;
        const status = gNum === 1 ? 'completed' : 'planned';
        const winnerTeam = gNum === 1 ? 'red' : null;

        await tx.run(
          `INSERT INTO tournament_games (id, tournament_id, game_number, judge_name, status, winner_team, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            gameId,
            tournamentId,
            gNum,
            'Главный Судья',
            status,
            winnerTeam,
            gNum === 1 ? now : null,
            gNum === 1 ? now : null,
          ]
        );

        // Generate Seats for each game
        for (let seatIdx = 0; seatIdx < 10; seatIdx++) {
          const seatId = `seat-test-${gNum}-${seatIdx + 1}`;
          const player = testPlayers[seatIdx];
          const role = gNum === 1 ? roles[seatIdx] : null;

          await tx.run(
            `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
             VALUES (?, ?, ?, ?, ?)`,
            [seatId, gameId, `tp-${player.id}`, seatIdx + 1, role]
          );
        }
      }

      // 5. Insert Completed Protocol for Game 1
      const game1Id = 'g-test-1';
      await tx.run(
        `INSERT INTO tournament_game_protocols (id, game_id, status, winner_team, first_killed_participant_id, zero_round_voted_participant_id, best_move_participant_id, best_move_seats_json, votes_json, shots_json, created_at, updated_at, completed_at)
         VALUES (?, ?, 'completed', 'red', ?, NULL, ?, ?, '[]', '[]', ?, ?, ?)`,
        [
          `prot-${game1Id}`,
          game1Id,
          'tp-p-test-1', // Player 1 is first killed
          'tp-p-test-1', // Player 1 best move participant
          JSON.stringify([8, 9, 10]), // Player 1 guesses all 3 Mafia/Don seats (8, 9, 10) correctly!
          now,
          now,
          now,
        ]
      );

      // 6. Insert Player Results for Game 1
      for (let seatIdx = 0; seatIdx < 10; seatIdx++) {
        const player = testPlayers[seatIdx];
        const isFirstKilled = seatIdx === 0;

        let judgeBonus = 0;
        let penaltyPoints = 0;
        let protocolBonus = 0;
        let exitType = 'alive';
        let exitOrder = null;

        if (isFirstKilled) {
          exitType = 'killed';
          exitOrder = 1;
          judgeBonus = 0.3; // Give a nice judge bonus to first killed for outstanding play
        } else if (seatIdx === 7) {
          exitType = 'voted_day';
          exitOrder = 2;
        }

        if (seatIdx === 2) {
          penaltyPoints = 0.5; // Test a penalty point
        }

        await tx.run(
          `INSERT INTO tournament_game_player_results (id, game_id, participant_id, exit_type, exit_order, regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, ci_points, color_protocol_json, notes)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, '[]', NULL)`,
          [
            `res-test-${player.id}`,
            game1Id,
            `tp-${player.id}`,
            exitType,
            exitOrder,
            judgeBonus,
            protocolBonus,
            penaltyPoints,
          ]
        );
      }
    }
  });

  console.log('[SEED] Demo data seeded successfully.');
}
