import re
content = open('src/tests/disciplinePersistence.test.ts', 'r').read()

pattern_beforeEach = r'''    // In the old code I didn't actually start game2Id properly if I replaced everything with gameId
    await request\(app\)
      \.patch\(`/api/tournaments/\$\{tournamentId\}/games/\$\{game2Id\}/roles`\)
      \.set\('Cookie', organizerCookie\)
      \.send\(\{ roles: formattedRoles \}\);
    await request\(app\)
      \.post\(`/api/tournaments/\$\{tournamentId\}/games/\$\{game2Id\}/start`\)
      \.set\('Cookie', organizerCookie\);'''

content = re.sub(pattern_beforeEach, '', content)

# Fix test 2 to use gameId
content = content.replace('game2Seats', 'gameSeats').replace('game2Id', 'gameId')

# Fix rawDb mock
content = content.replace("get: async (sql, params) => sqlite.prepare(sql).get(params)", "get: async (sql, params=[]) => sqlite.prepare(sql).get(params)")

open('src/tests/disciplinePersistence.test.ts', 'w').write(content)
