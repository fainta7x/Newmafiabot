const fs = require('fs');
let content = fs.readFileSync('src/tests/protocolModal.test.tsx', 'utf8');

// There might be multiple tests that need this! Let's find all `screen.getByRole('button', { name: /Протокол/i })`.
content = content.replace(
  /const protocolBtn = screen.getByRole\('button', \{ name: \/Протокол\/i \}\);/g,
  `const gamesTab = screen.getByRole('button', { name: /Игры/i });\n      fireEvent.click(gamesTab);\n      const protocolBtn = screen.getByRole('button', { name: /Протокол/i });`
);

fs.writeFileSync('src/tests/protocolModal.test.tsx', content);
