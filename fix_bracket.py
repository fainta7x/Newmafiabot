import re
content = open('src/server/routes/tournamentProtocolRoutes.ts', 'r').read()

pattern = r'''      try \{ bestMoveSeats = JSON\.parse\(protocolRecord\.best_move_seats_json \|\| '\[\]'\); \} catch \(_\) \{\}\s*\}'''
repl = r'''      try { bestMoveSeats = JSON.parse(protocolRecord.best_move_seats_json || '[]'); } catch (_) {}'''
content = re.sub(pattern, repl, content)

open('src/server/routes/tournamentProtocolRoutes.ts', 'w').write(content)
