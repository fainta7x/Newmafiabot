import re
content = open('src/tests/disciplinePersistence.test.ts', 'r').read()

pattern = r'''const rawDb = \{ sqlite, get: async \(sql, params=\[\]\) => sqlite\.prepare\(sql\)\.get\(params\), all: async \(sql, params\) => sqlite\.prepare\(sql\)\.all\(params\), run: async \(sql, params=\[\]\) => sqlite\.prepare\(sql\)\.run\(params\), exec: async \(sql\) => sqlite\.exec\(sql\) \};'''

repl = r'''const rawDb = { sqlite, get: async (sql, params) => params ? sqlite.prepare(sql).get(...params) : sqlite.prepare(sql).get(), all: async (sql, params) => params ? sqlite.prepare(sql).all(...params) : sqlite.prepare(sql).all(), run: async (sql, params) => params ? sqlite.prepare(sql).run(...params) : sqlite.prepare(sql).run(), exec: async (sql) => sqlite.exec(sql) } as any;'''

content = content.replace(pattern, repl)
open('src/tests/disciplinePersistence.test.ts', 'w').write(content)
