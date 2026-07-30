import re

content = open('src/server/routes/tournamentProtocolRoutes.ts', 'r').read()

pattern1 = r'const playerResultsList = fullSeats\.map\(\(seat\) => \{.*?return \{.*?\};\s*\}\);'

def repl(m):
    return 'const playerResultsList = serializePlayerResultsOutput(fullSeats, existingResults, gameId);'

content = re.sub(pattern1, repl, content, flags=re.DOTALL)
open('src/server/routes/tournamentProtocolRoutes.ts', 'w').write(content)
