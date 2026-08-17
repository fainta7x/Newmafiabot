import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}

walk(root);
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replaceAll('(req as any).db', 'req.db');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(path.relative(process.cwd(), file));
  }
}
console.log(`Updated ${changed} files.`);
