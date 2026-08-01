const fs = require('fs');
let content = fs.readFileSync('temp_TournamentDetailView.tsx', 'utf8');

// 1. Extract Global actions (429-688)
const split1 = '{/* Global actions row & readiness indicator */}';
const split2 = '\n      </div>\n\n      {/* Feedback banner */}';

if (!content.includes(split1) || !content.includes(split2)) {
  console.error("split1 or split2 not found");
  process.exit(1);
}

const p1 = content.indexOf(split1);
const p2 = content.indexOf(split2);

// include split1
let globalActionsContent = content.substring(p1, p2);

// Remove globalActionsContent from content
content = content.substring(0, p1) + content.substring(p2);

// Also remove backup button from header
content = content.replace(/\{process\.env\.NODE_ENV !== 'production' && \([\s\S]*?<Save className="w-4 h-4" \/>[\s\S]*?<\/span>\s*<\/button>\s*\)\}/, '');

const backupButton = `
            {process.env.NODE_ENV !== 'production' && (
              <button
                type="button"
                onClick={handleCheckpoint}
                disabled={actionLoading}
                className="bg-surface-2 hover:bg-surface-hover text-text-primary border border-border-soft font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px] ml-auto"
                title="Сохранить резервную копию (Git-checkpoint)"
              >
                <Save className="w-3.5 h-3.5 text-accent" />
                <span>Резервная копия</span>
              </button>
            )}
`;

// 3. Extract Roster / Participants Accordion
const split3 = '          {/* Roster / Participants Accordion */}';
const split4 = '\n      {/* Selected Game Selector & Navigator */}';

if (!content.includes(split3) || !content.includes(split4)) {
  console.error("split3 or split4 not found");
  process.exit(1);
}

const p3 = content.indexOf(split3);
const p4 = content.indexOf(split4);

let rosterContent = content.substring(p3, p4);
// Remove roster from content
content = content.substring(0, p3) + content.substring(p4);

rosterContent = rosterContent.replace(
  /<div className="flex items-center justify-between">\s*<div className="flex items-center gap-2">\s*<Users className="w-4 h-4 text-accent" \/>\s*<h3 className="text-sm font-bold text-text-primary">Состав участников \(10 человек\)<\/h3>\s*<\/div>\s*\{isDraft && \(\s*<button\s*onClick=\{[^}]+\}\s*className="text-xs text-accent hover:underline font-bold"\s*>\s*Изменить состав\s*<\/button>\s*\)\}\s*<\/div>/,
  `<div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowRoster(!showRoster)}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-text-primary">Состав участников ({tournament.participants?.length || 0} человек)</h3>
              </div>
              <div className="flex items-center gap-4">
                {isDraft && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowEditRosterModal(true); }}
                    className="text-xs text-accent hover:underline font-bold"
                  >
                    Изменить состав
                  </button>
                )}
                <div className="flex items-center gap-1.5 text-text-muted">
                  <span className="text-xs">{showRoster ? 'Скрыть' : 'Показать'}</span>
                  {showRoster ? <ChevronLeft className="w-4 h-4 -rotate-90" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </div>
            </div>`
);

rosterContent = rosterContent.replace(
  /<div className="grid grid-cols-2 sm:grid-cols-5 gap-2">/,
  `{showRoster && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">`
);

rosterContent = rosterContent.replace(
  /<\/div>\n          <\/div>$/,
  `</div>\n            )}\n          </div>`
);

const orgTabContent = `
      {activeTab === 'organization' && (
        <div className="space-y-5">
          <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                Управление турниром
              </h3>
              ${backupButton}
            </div>
            ${globalActionsContent.replace('{/* Global actions row & readiness indicator */}', '')}
          </div>
${rosterContent}
        </div>
      )}
`;

content = content.replace(
  '{/* Navigation Tabs */}',
  `{/* Navigation Tabs */}`
);

// We need to insert `orgTabContent` right after the navigation tabs `</div>`
const tabsRegex = /\{\/\* Navigation Tabs \*\/\}([\s\S]*?<\/div>)/;
content = content.replace(tabsRegex, match => match + '\n' + orgTabContent);


// 6. State variable `showRoster`
content = content.replace(
  /const \[activeTab, setActiveTab\] = useState<'organization' | 'games' | 'standings' | 'nominations'>\('organization'\);/,
  `const [activeTab, setActiveTab] = useState<'organization' | 'games' | 'standings' | 'nominations'>('organization');\n  const [showRoster, setShowRoster] = useState(false);`
);

// 8. Update the games tab condition:
content = content.replace(
  /\} : \(\n\s*<>\n\s*\{\/\* Selected Game Selector & Navigator \*\/\}/,
  `} : activeTab === 'games' ? (\n        <div className="space-y-5">\n          {/* Selected Game Selector & Navigator */}`
);
content = content.replace(
  /<\/>\n      \)\}\n\n      \{\/\* Edit Tournament Data Modal \*\/\}/,
  `</div>\n      )}\n\n      {/* Edit Tournament Data Modal */}`
);

fs.writeFileSync('rewritten.tsx', content);
console.log('done');
