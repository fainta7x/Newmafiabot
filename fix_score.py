import re

content = open('src/server/routes/tournamentProtocolRoutes.ts', 'r').read()

pattern = r'''function serializeProtocolOutput\(savedProtocol: any, responseBestMoves: any\[\]\) \{
  return \{
    id: savedProtocol\.id,'''

repl = r'''function serializeProtocolOutput(savedProtocol: any, responseBestMoves: any[], best_move_score?: number) {
  return {
    id: savedProtocol.id,'''

content = re.sub(pattern, repl, content)

content = content.replace('completed_at: savedProtocol.completed_at\n  };', 'completed_at: savedProtocol.completed_at,\n    best_move_score: best_move_score ?? 0\n  };')

content = content.replace('serializeProtocolOutput(protocolRecord, best_moves)', 'serializeProtocolOutput(protocolRecord, best_moves, best_move_score)')
content = content.replace('serializeProtocolOutput(savedProtocol, responseBestMoves)', 'serializeProtocolOutput(savedProtocol, responseBestMoves, best_move_score)')
content = content.replace('serializeProtocolOutput(savedProtocol, responseBestMoves2)', 'serializeProtocolOutput(savedProtocol, responseBestMoves2, best_move_score)')

open('src/server/routes/tournamentProtocolRoutes.ts', 'w').write(content)
