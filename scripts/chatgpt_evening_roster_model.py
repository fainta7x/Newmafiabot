from pathlib import Path
import re

path = Path('src/components/crm/EveningGamesView.tsx')
text = path.read_text(encoding='utf-8')

old_import = "import { Archive, ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';"
new_import = "import { Archive, ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';"
if old_import not in text:
    raise SystemExit('lucide import not found')
text = text.replace(old_import, new_import, 1)

anchor = "import { EveningLiveGameModal } from './EveningLiveGameModal';"
if anchor not in text:
    raise SystemExit('live modal import not found')
text = text.replace(anchor, anchor + "\nimport { EveningGameCreateSheet } from './EveningGameCreateSheet';", 1)

for line in [
    "  const [selectedTableId, setSelectedTableId] = useState('');\n",
    "  const [judgeName, setJudgeName] = useState('');\n",
    "  const [seatParticipantIds, setSeatParticipantIds] = useState<string[]>(Array(10).fill(''));\n",
    "  const [creating, setCreating] = useState(false);\n",
]:
    if line not in text:
        raise SystemExit(f'state line not found: {line.strip()}')
    text = text.replace(line, '', 1)

text, count = re.subn(
    r"\n  const tableParticipants = useMemo\(\(\) => participants\.filter\(\(participant\) => \{.*?\n  \}\), \[participants, selectedTableId\]\);\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'tableParticipants block replacement count={count}')

text, count = re.subn(
    r"  const openCreate = \(\) => \{.*?\n  const archiveGame = \(game: ClubGameRecord\) => \{",
    "  const openCreate = () => setShowCreate(true);\n\n  const archiveGame = (game: ClubGameRecord) => {",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'create helpers replacement count={count}')

old_button = 'onClick={openCreate} disabled={tables.length === 0} className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-40"'
new_button = 'onClick={openCreate} className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase flex items-center justify-center gap-2"'
if old_button not in text:
    raise SystemExit('new game button pattern not found')
text = text.replace(old_button, new_button, 1)

replacement = '''\n      {showCreate && (\n        <EveningGameCreateSheet\n          evening={evening}\n          tables={tables}\n          participants={participants}\n          onClose={() => setShowCreate(false)}\n          onCreated={(created) => {\n            setGames((previous) => [created, ...previous.filter((game) => game.id !== created.id)]);\n            setShowCreate(false);\n            setModeChoiceGame(created);\n          }}\n        />\n      )}\n\n      {modeChoiceGame && ('''
text, count = re.subn(
    r"\n      \{showCreate && \(\n.*?\n      \)\}\n\n      \{modeChoiceGame && \(",
    replacement,
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'create modal replacement count={count}')

for forbidden in ['tableParticipants', 'selectedTableId', 'seatParticipantIds', 'handleTableChange', 'updateSeat', 'creating || tableParticipants']:
    if forbidden in text:
        raise SystemExit(f'old table-bound setup still present: {forbidden}')

path.write_text(text, encoding='utf-8')
print('EveningGamesView patched successfully')
