const fs = require('fs');
let content = fs.readFileSync('src/components/crm/tournaments/TournamentDetailView.tsx', 'utf8');

// Fix line 62
content = content.replace(
  /const \[showRoster, setShowRoster\] = useState\(false\);\| 'games' \| 'standings' \| 'nominations'>\('organization'\);/,
  `const [showRoster, setShowRoster] = useState(false);`
);

// Fix games tab condition
content = content.replace(
  /\} : \(\n\s*<>\n\n\s*\{\/\* Selected Game Selector & Navigator \*\/\}/,
  `} : activeTab === 'games' ? (\n        <div className="space-y-5">\n          {/* Selected Game Selector & Navigator */}`
);

// Fix closing tag
content = content.replace(
  /<\/>\n      \)\}\n\n      \{\/\* Edit Tournament Data Modal \*\/\}/,
  `</div>\n      )}\n\n      {/* Edit Tournament Data Modal */}`
);

fs.writeFileSync('src/components/crm/tournaments/TournamentDetailView.tsx', content);
