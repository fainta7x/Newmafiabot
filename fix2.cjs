const fs = require('fs');
let content = fs.readFileSync('src/components/crm/tournaments/TournamentDetailView.tsx', 'utf8');

content = content.replace(
  /\) : \(\n\s*<>\n\n\s*\{\/\* Selected Game Selector & Navigator \*\/\}/,
  `) : activeTab === 'games' ? (\n        <div className="space-y-5">\n          {/* Selected Game Selector & Navigator */}`
);

fs.writeFileSync('src/components/crm/tournaments/TournamentDetailView.tsx', content);
