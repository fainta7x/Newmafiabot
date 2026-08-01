const fs = require('fs');
let content = fs.readFileSync('src/db/index.ts', 'utf8');

content = content.replace(
  /let dbPath = dbPathOrMemory \|\| process\.env\.DATABASE_PATH;\n\n  if \(\!dbPath\) \{/,
  `let dbPath = dbPathOrMemory || process.env.DATABASE_PATH;\n\n  if (!dbPath || dbPath === './mafia_crm.sqlite' || dbPath === 'mafia_crm.sqlite') {`
);

fs.writeFileSync('src/db/index.ts', content);
