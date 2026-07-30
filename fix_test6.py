import re
content = open('src/tests/disciplinePersistence.test.ts', 'r').read()

pattern = r'''  it\('6\. Инициализация существующей базы добавляет столбцы и сохраняет заранее созданную старую строку', async \(\) => \{
    const rawDb = createDatabaseConnection\(':memory:'\);'''

replacement = '''  it('6. Инициализация существующей базы добавляет столбцы и сохраняет заранее созданную старую строку', async () => {
    // We must bypass createDatabaseConnection so initializeDatabase is not called yet
    const Database = require('better-sqlite3');
    const sqlite = new Database(':memory:');
    const rawDb = { sqlite, get: async (sql, params) => sqlite.prepare(sql).get(params), all: async (sql, params) => sqlite.prepare(sql).all(params), run: async (sql, params=[]) => sqlite.prepare(sql).run(params), exec: async (sql) => sqlite.exec(sql) };
'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)
open('src/tests/disciplinePersistence.test.ts', 'w').write(content)
