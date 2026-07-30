import re
content = open('src/server/routes/tournamentProtocolRoutes.ts', 'r').read()

pattern = r'''    const \{ bonusPoints: best_move_score \} = calculateBestMovePoints\(bestMoveSeats, fullSeats\);

    res\.json\(\{ protocol: serializeProtocolOutput\(savedProtocol, responseBestMoves2\), player_results: playerResultsList, game: updatedGame, best_move_score: best_move_score \}\);'''

replacement = '''    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves = bmRecords.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    res.json({ protocol: serializeProtocolOutput(savedProtocol, responseBestMoves), player_results: playerResultsList, game: updatedGame, best_move_score: best_move_score });'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)
open('src/server/routes/tournamentProtocolRoutes.ts', 'w').write(content)
